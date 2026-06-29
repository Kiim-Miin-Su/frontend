// ──────────────────────────────────────────────────────────────
// 스케줄 엔진 (순수 함수). UI/스토어/백엔드와 분리 — 단위 테스트 용이.
// 백엔드 ScheduleService가 동일 규칙을 재현(1:1). 상세: docs/scheduling.md
// ──────────────────────────────────────────────────────────────
import type { ClassSession, AvailabilityBlock, Conflict, ID } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');
export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const addMinutes = (hhmm: string, mins: number): string => {
  const t = toMin(hhmm) + mins;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
/** 0(일)~6(토). 'YYYY-MM-DD' 기준(결정론적, UTC). */
export const weekdayOf = (dateStr: string): number =>
  new Date(dateStr + 'T00:00:00Z').getUTCDay();

/** 두 시간 구간이 겹치는가(맞닿음은 비겹침). */
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);

export type ConflictCandidate = {
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  instructorId?: ID;
  roomId?: ID;
  studentIds?: ID[];
  ignoreSessionId?: ID;
};
export type ConflictCtx = {
  sessions: ClassSession[];
  blocks?: AvailabilityBlock[];
  roomCapacity?: Record<number, number>;
  enrolledCount?: number; // 후보 수업의 등록 인원(capacity 비교용)
};

/** 충돌 검사 — 강사/강의실 이중예약 · 불가시간(Block) · 강의실 capacity. 빈 배열=충돌 없음. */
export function detectConflicts(cand: ConflictCandidate, ctx: ConflictCtx): Conflict[] {
  const out: Conflict[] = [];
  const cStart = cand.startTime;
  const cEnd = addMinutes(cand.startTime, cand.durationMinutes);

  // 1) 같은 날 기존 세션과의 이중예약(강사·강의실)
  for (const s of ctx.sessions) {
    if (s.id === cand.ignoreSessionId) continue;
    if (s.sessionDate !== cand.sessionDate || !s.startTime) continue;
    const sEnd = s.endTime ?? addMinutes(s.startTime, s.durationMinutes);
    if (!overlaps(cStart, cEnd, s.startTime, sEnd)) continue;
    if (cand.instructorId != null && s.instructorId === cand.instructorId)
      out.push({ type: 'double_book', resource: 'instructor', resourceId: cand.instructorId, sessionId: s.id });
    if (cand.roomId != null && s.roomId === cand.roomId)
      out.push({ type: 'double_book', resource: 'room', resourceId: cand.roomId, sessionId: s.id });
  }

  // 2) 불가시간(Block) 침범 — 강사/강의실
  const wd = weekdayOf(cand.sessionDate);
  for (const b of ctx.blocks ?? []) {
    if (b.kind !== 'unavailable' || b.weekday !== wd) continue;
    if (!overlaps(cStart, cEnd, b.startTime, b.endTime)) continue;
    if (b.ownerType === 'instructor' && cand.instructorId === b.ownerId)
      out.push({ type: 'unavailable', resource: 'instructor', resourceId: b.ownerId });
    if (b.ownerType === 'room' && cand.roomId === b.ownerId)
      out.push({ type: 'unavailable', resource: 'room', resourceId: b.ownerId });
  }

  // 3) 강의실 capacity 초과
  if (cand.roomId != null && ctx.roomCapacity && ctx.enrolledCount != null) {
    const cap = ctx.roomCapacity[cand.roomId];
    if (cap != null && ctx.enrolledCount > cap)
      out.push({ type: 'room_capacity', resource: 'room', resourceId: cand.roomId, detail: `${ctx.enrolledCount}/${cap}` });
  }
  return out;
}

export type TeachingHours = { sessions: number; minutes: number; hours: number };

/** 기간 내 시수 집계(회계 입력). 기본은 held+scheduled 포함, instructor/student 필터. */
export function teachingHours(
  sessions: ClassSession[],
  opts: { from?: string; to?: string; instructorId?: ID; statuses?: ClassSession['status'][] } = {},
): TeachingHours {
  const statuses = opts.statuses ?? ['held', 'scheduled', 'makeup'];
  const rows = sessions.filter(
    (s) =>
      (opts.from ? s.sessionDate >= opts.from : true) &&
      (opts.to ? s.sessionDate <= opts.to : true) &&
      (opts.instructorId != null ? s.instructorId === opts.instructorId : true) &&
      statuses.includes(s.status),
  );
  const minutes = rows.reduce((a, s) => a + (s.durationMinutes || 0), 0);
  return { sessions: rows.length, minutes, hours: Math.round((minutes / 60) * 100) / 100 };
}

// ── 이동(드래그)·리사이즈 → 충돌검사용 후보 + PATCH 페이로드 ──
export type SchedulePatch = {
  sessionDate?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  roomId?: ID;
  instructorId?: ID;
};

/** 드래그 이동: 날짜/시작시각(과 선택적으로 강의실/강사) 변경. 길이 유지. */
export function moveCandidate(
  s: ClassSession,
  to: { sessionDate?: string; startTime?: string; roomId?: ID; instructorId?: ID },
): ConflictCandidate {
  return {
    sessionDate: to.sessionDate ?? s.sessionDate,
    startTime: to.startTime ?? s.startTime ?? '00:00',
    durationMinutes: s.durationMinutes,
    instructorId: to.instructorId ?? s.instructorId,
    roomId: to.roomId ?? s.roomId,
    ignoreSessionId: s.id,
  };
}

/** 리사이즈: 시작/끝 핸들 드래그 → 새 시작·종료로 길이 재계산(분). 최소 길이 보장. */
export function resizeCandidate(
  s: ClassSession,
  edge: { startTime?: string; endTime?: string },
  minMinutes = 15,
): ConflictCandidate {
  const startTime = edge.startTime ?? s.startTime ?? '00:00';
  const endTime = edge.endTime ?? s.endTime ?? addMinutes(startTime, s.durationMinutes);
  const durationMinutes = Math.max(minMinutes, toMin(endTime) - toMin(startTime));
  return { sessionDate: s.sessionDate, startTime, durationMinutes, instructorId: s.instructorId, roomId: s.roomId, ignoreSessionId: s.id };
}

/** 후보 → PATCH 페이로드. */
export const candidateToPatch = (c: ConflictCandidate): SchedulePatch => ({
  sessionDate: c.sessionDate,
  startTime: c.startTime,
  durationMinutes: c.durationMinutes,
  roomId: c.roomId,
  instructorId: c.instructorId,
});

// ── 슬롯 추천: 가용 ∩ − 점유 → 겹치지 않는 후보 시간 ──
export type SuggestInput = {
  weekStart: string; // 월요일 ISO
  weekdays?: number[]; // 0(일)~6(토), 기본 월~금
  workStart?: string; // 'HH:mm' 기본 09:00
  workEnd?: string; // 기본 21:00
  durationMinutes: number;
  stepMin?: number; // 후보 간격, 기본 30
  instructorId?: ID;
  roomId?: ID;
};
export type SuggestCtx = {
  sessions: ClassSession[]; // 점유(기존 수업)
  blocks?: AvailabilityBlock[]; // 불가시간(Block)
  limit?: number;
};
export type SlotCandidate = { date: string; weekday: number; startTime: string; endTime: string };

/** 강사/강의실이 비어 있고 불가시간과 겹치지 않는 시작 후보를 주별로 생성. */
export function suggestSlots(input: SuggestInput, ctx: SuggestCtx): SlotCandidate[] {
  const wds = input.weekdays ?? [1, 2, 3, 4, 5];
  const step = input.stepMin ?? 30;
  const ws = toMin(input.workStart ?? '09:00');
  const we = toMin(input.workEnd ?? '21:00');
  const dur = input.durationMinutes;
  const limit = ctx.limit ?? 24;
  const dates = weekDates(input.weekStart);
  const out: SlotCandidate[] = [];

  const busy = (date: string, s: number, e: number): boolean => {
    // 기존 수업(같은 강사/강의실) 점유
    for (const ss of ctx.sessions) {
      if (ss.sessionDate !== date || !ss.startTime) continue;
      const sameRes = (input.instructorId != null && ss.instructorId === input.instructorId) ||
        (input.roomId != null && ss.roomId === input.roomId);
      if (!sameRes) continue;
      const se = ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes;
      if (s < se && toMin(ss.startTime) < e) return true;
    }
    // 불가시간(Block)
    const wd = weekdayOf(date);
    for (const b of ctx.blocks ?? []) {
      if (b.kind !== 'unavailable' || b.weekday !== wd) continue;
      const owns = (b.ownerType === 'instructor' && input.instructorId === b.ownerId) ||
        (b.ownerType === 'room' && input.roomId === b.ownerId);
      if (owns && s < toMin(b.endTime) && toMin(b.startTime) < e) return true;
    }
    return false;
  };

  for (const date of dates) {
    if (!wds.includes(weekdayOf(date))) continue;
    for (let s = ws; s + dur <= we; s += step) {
      if (busy(date, s, s + dur)) continue;
      out.push({ date, weekday: weekdayOf(date), startTime: fromMinLocal(s), endTime: fromMinLocal(s + dur) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
const fromMinLocal = (mm: number) => `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;

// ── 겹치는 일정 나란히 배치(구글 캘린더식 레인) ──
// 같은 컬럼(요일/강의실)에서 시간이 겹치는 이벤트를 열로 나눠 lane/lanes 부여.
export type LaneItem = { id: number; start: number; end: number };
export function layoutLanes(items: LaneItem[]): Record<number, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const res: Record<number, { lane: number; lanes: number }> = {};
  let cluster: { id: number; lane: number }[] = [];
  let colsEnd: number[] = [];
  let clusterMaxEnd = -Infinity;
  const flush = () => {
    const lanes = colsEnd.length || 1;
    cluster.forEach((c) => (res[c.id] = { lane: c.lane, lanes }));
    cluster = []; colsEnd = []; clusterMaxEnd = -Infinity;
  };
  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterMaxEnd) flush();
    let lane = colsEnd.findIndex((e) => e <= ev.start);
    if (lane === -1) { lane = colsEnd.length; colsEnd.push(ev.end); }
    else colsEnd[lane] = ev.end;
    cluster.push({ id: ev.id, lane });
    clusterMaxEnd = Math.max(clusterMaxEnd, ev.end);
  }
  flush();
  return res;
}

/** 주(週) 시작(월요일) 기준 7일 날짜 배열. */
export function weekDates(weekStartISO: string): string[] {
  const base = new Date(weekStartISO + 'T00:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
