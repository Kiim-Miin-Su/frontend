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

// ── 가용 교집합 추천(Lantiv #7): 학생가용 ∧ 강사가용 − 불가 − 점유 → 주별 후보 ──
// 요일별 분 구간(가용 윈도우).
export type DayWindow = { weekday: number; start: number; end: number };

/** owner의 특정 kind 블록 → 요일별 분 구간 목록. */
export function ownerWindows(
  blocks: AvailabilityBlock[],
  ownerType: AvailabilityBlock['ownerType'],
  ownerId: ID,
  kind: AvailabilityBlock['kind'],
): DayWindow[] {
  return blocks
    .filter((b) => b.ownerType === ownerType && b.ownerId === ownerId && b.kind === kind)
    .map((b) => ({ weekday: b.weekday, start: toMin(b.startTime), end: toMin(b.endTime) }));
}

/** 한 요일에 대한 두 가용 윈도우 집합의 교집합. 한쪽이 비면(=가용 제약 없음) 다른 쪽을 그대로(없으면 full). */
function dayIntersect(a: DayWindow[], b: DayWindow[], wd: number, full: [number, number]): [number, number][] {
  const av = a.filter((w) => w.weekday === wd).map((w) => [w.start, w.end] as [number, number]);
  const bv = b.filter((w) => w.weekday === wd).map((w) => [w.start, w.end] as [number, number]);
  const A = av.length ? av : [full];
  const B = bv.length ? bv : [full];
  const out: [number, number][] = [];
  for (const [as, ae] of A) for (const [bs, be] of B) {
    const s = Math.max(as, bs, full[0]); const e = Math.min(ae, be, full[1]);
    if (s < e) out.push([s, e]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

export type PairSuggestInput = {
  weekStart: string; // 월요일 ISO
  weekdays?: number[]; // 기본 월~금
  workStart?: string; // 기본 09:00
  workEnd?: string; // 기본 21:00
  durationMinutes: number;
  stepMin?: number; // 기본 30
  instructorId: ID;
  studentId?: ID; // 선택(없으면 강사 가용만)
  roomId?: ID; // 선택(강의실 점유·불가도 제외)
};
export type PairSuggestCtx = {
  sessions: ClassSession[]; // 점유(기존 수업)
  blocks: AvailabilityBlock[]; // 가용/불가 전체(소유자 무관)
  limit?: number;
};

/** 학생·강사(+강의실) 가용 교집합에서 불가/점유를 제외한 주별 배정 후보. */
export function suggestPairSlots(input: PairSuggestInput, ctx: PairSuggestCtx): SlotCandidate[] {
  const wds = input.weekdays ?? [1, 2, 3, 4, 5];
  const step = input.stepMin ?? 30;
  const full: [number, number] = [toMin(input.workStart ?? '09:00'), toMin(input.workEnd ?? '21:00')];
  const dur = input.durationMinutes;
  const limit = ctx.limit ?? 24;
  const instAvail = ownerWindows(ctx.blocks, 'instructor', input.instructorId, 'available');
  const studAvail = input.studentId != null ? ownerWindows(ctx.blocks, 'student', input.studentId, 'available') : [];

  const blockedBy = (wd: number, s: number, e: number): boolean =>
    ctx.blocks.some((b) => {
      if (b.kind !== 'unavailable' || b.weekday !== wd) return false;
      const owns = (b.ownerType === 'instructor' && b.ownerId === input.instructorId) ||
        (b.ownerType === 'student' && b.ownerId === input.studentId) ||
        (b.ownerType === 'room' && b.ownerId === input.roomId);
      return owns && s < toMin(b.endTime) && toMin(b.startTime) < e;
    });
  const busy = (date: string, s: number, e: number): boolean =>
    ctx.sessions.some((ss) => {
      if (ss.sessionDate !== date || !ss.startTime) return false;
      const sameRes = ss.instructorId === input.instructorId || (input.roomId != null && ss.roomId === input.roomId);
      if (!sameRes) return false;
      const se = ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes;
      return s < se && toMin(ss.startTime) < e;
    });

  const out: SlotCandidate[] = [];
  for (const date of weekDates(input.weekStart)) {
    const wd = weekdayOf(date);
    if (!wds.includes(wd)) continue;
    for (const [ws, we] of dayIntersect(instAvail, studAvail, wd, full)) {
      for (let s = ws; s + dur <= we; s += step) {
        if (blockedBy(wd, s, s + dur) || busy(date, s, s + dur)) continue;
        out.push({ date, weekday: wd, startTime: fromMinLocal(s), endTime: fromMinLocal(s + dur) });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

// ── 학생 중심 추천(Lantiv): 학생 스케줄에 맞는 수업·강사 추천 ──
// 학생 가용 − 학생 불가 − 학생 점유 안에서 후보 시간을 만들고,
// 각 코스(=강사)에 대해 강사가 그 시간에 가용한지(instructorFree) 표시.
// 불가능한 강사도 후보로 노출하되 색을 달리해 사용자가 "조정"으로 선택할 수 있게 한다.
export type StudentRecoCourse = { id: ID; name: string; instructorId: ID; instructorName?: string; color?: string };
export type StudentRecoInput = {
  weekStart: string;
  weekdays?: number[];
  workStart?: string;
  workEnd?: string;
  durationMinutes: number;
  stepMin?: number;
  studentId: ID;
  courses: StudentRecoCourse[];
  roomId?: ID;
};
export type StudentReco = SlotCandidate & {
  courseId: ID; courseName: string; instructorId: ID; instructorName?: string; color?: string;
  instructorFree: boolean; reason?: string; // instructorFree=false 사유(불가/충돌)
};
export type StudentRecoCtx = {
  sessions: (ClassSession & { studentIds?: ID[] })[];
  blocks: AvailabilityBlock[];
  limit?: number;
};

export function recommendForStudent(input: StudentRecoInput, ctx: StudentRecoCtx): StudentReco[] {
  const wds = input.weekdays ?? [1, 2, 3, 4, 5];
  const step = input.stepMin ?? 30;
  const full: [number, number] = [toMin(input.workStart ?? '09:00'), toMin(input.workEnd ?? '21:00')];
  const dur = input.durationMinutes;
  const limit = ctx.limit ?? 30;
  const studAvail = ownerWindows(ctx.blocks, 'student', input.studentId, 'available');

  const overlapsBlock = (ownerType: AvailabilityBlock['ownerType'], ownerId: ID, wd: number, s: number, e: number) =>
    ctx.blocks.some((b) => b.kind === 'unavailable' && b.ownerType === ownerType && b.ownerId === ownerId &&
      b.weekday === wd && s < toMin(b.endTime) && toMin(b.startTime) < e);
  const studentBusy = (date: string, s: number, e: number) =>
    ctx.sessions.some((ss) => ss.sessionDate === date && ss.startTime && (ss.studentIds ?? []).includes(input.studentId) &&
      s < (ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes) && toMin(ss.startTime) < e);
  const instructorBusy = (instructorId: ID, date: string, s: number, e: number) =>
    ctx.sessions.some((ss) => ss.sessionDate === date && ss.startTime && ss.instructorId === instructorId &&
      s < (ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes) && toMin(ss.startTime) < e);
  const instAvailOf = (instructorId: ID) => ownerWindows(ctx.blocks, 'instructor', instructorId, 'available');
  const withinAvail = (wins: DayWindow[], wd: number, s: number, e: number) => {
    const day = wins.filter((w) => w.weekday === wd);
    if (!day.length) return true; // 가용 정의 없음 = 제약 없음
    return day.some((w) => w.start <= s && e <= w.end);
  };

  const out: StudentReco[] = [];
  for (const date of weekDates(input.weekStart)) {
    const wd = weekdayOf(date);
    if (!wds.includes(wd)) continue;
    // 학생 가용 윈도우(없으면 full)
    const dayWins = studAvail.filter((w) => w.weekday === wd).map((w) => [Math.max(w.start, full[0]), Math.min(w.end, full[1])] as [number, number]);
    const windows = dayWins.length ? dayWins : [full];
    for (const [ws, we] of windows) {
      for (let s = ws; s + dur <= we; s += step) {
        const e = s + dur;
        if (overlapsBlock('student', input.studentId, wd, s, e) || studentBusy(date, s, e)) continue;
        for (const c of input.courses) {
          const free = !instructorBusy(c.instructorId, date, s, e) &&
            !overlapsBlock('instructor', c.instructorId, wd, s, e) &&
            withinAvail(instAvailOf(c.instructorId), wd, s, e) &&
            (input.roomId == null || (!overlapsBlock('room', input.roomId, wd, s, e)));
          out.push({
            date, weekday: wd, startTime: fromMinLocal(s), endTime: fromMinLocal(e),
            courseId: c.id, courseName: c.name, instructorId: c.instructorId, instructorName: c.instructorName, color: c.color,
            instructorFree: free, reason: free ? undefined : '강사 시간 조정 필요',
          });
        }
      }
    }
  }
  // 가용 강사 우선 → 날짜/시간 순. 제한.
  out.sort((a, b) => Number(b.instructorFree) - Number(a.instructorFree) || (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return out.slice(0, limit);
}

// ── 학생 → 적합 강사 추천(좌측 패널): 학생가용 ∧ 강사가용 교집합이 있는(블록 비충돌) 강사 ──
export type InstructorMatch = {
  instructorId: ID;
  instructorName?: string;
  subjectName?: string;
  color?: string;
  freeSlots: number; // 학생과 함께 비는 후보 슬롯 수(많을수록 적합)
  sample: SlotCandidate[]; // 상위 후보 미리보기
};
export type InstructorMatchInput = {
  weekStart: string;
  weekdays?: number[];
  workStart?: string;
  workEnd?: string;
  durationMinutes: number;
  stepMin?: number;
  studentId: ID;
  instructors: { id: ID; name?: string; subjectName?: string; color?: string }[]; // 후보(과목 필터는 호출측에서)
};
/** 각 후보 강사에 대해 학생과의 가용 교집합 슬롯을 구해, 1개 이상인 강사만 적합도순으로 추천. */
export function recommendInstructorsForStudent(
  input: InstructorMatchInput,
  ctx: { sessions: (ClassSession & { studentIds?: ID[] })[]; blocks: AvailabilityBlock[] },
): InstructorMatch[] {
  return input.instructors
    .map((ins) => {
      const slots = suggestPairSlots(
        {
          weekStart: input.weekStart, weekdays: input.weekdays, workStart: input.workStart, workEnd: input.workEnd,
          durationMinutes: input.durationMinutes, stepMin: input.stepMin, instructorId: ins.id, studentId: input.studentId,
        },
        { sessions: ctx.sessions, blocks: ctx.blocks, limit: 50 },
      );
      return { instructorId: ins.id, instructorName: ins.name, subjectName: ins.subjectName, color: ins.color, freeSlots: slots.length, sample: slots.slice(0, 3) };
    })
    .filter((m) => m.freeSlots > 0)
    .sort((a, b) => b.freeSlots - a.freeSlots);
}

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
