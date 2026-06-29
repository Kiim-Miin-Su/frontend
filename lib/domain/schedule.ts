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

/** 주(週) 시작(월요일) 기준 7일 날짜 배열. */
export function weekDates(weekStartISO: string): string[] {
  const base = new Date(weekStartISO + 'T00:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
