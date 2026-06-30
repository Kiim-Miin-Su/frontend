import { describe, it, expect } from 'vitest';
import type { ClassSession, AvailabilityBlock } from '@/types';
import { overlaps, addMinutes, weekdayOf, detectConflicts, teachingHours, moveCandidate, resizeCandidate, layoutLanes, suggestSlots, suggestPairSlots, recommendForStudent, recommendInstructorsForStudent, ownerWindows } from './schedule';

const ablock = (p: Partial<AvailabilityBlock>): AvailabilityBlock => ({
  id: 1, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '09:00', endTime: '12:00', ...p,
});

const sess = (p: Partial<ClassSession> & { studentIds?: number[] }): ClassSession & { studentIds?: number[] } => ({
  id: 1, courseId: 10, instructorId: 1, roomId: 1,
  sessionDate: '2026-06-29', startTime: '16:00', endTime: '17:30',
  durationMinutes: 90, status: 'scheduled', ...p,
});

describe('시간 유틸', () => {
  it('addMinutes는 분을 더해 HH:mm 반환', () => {
    expect(addMinutes('16:00', 90)).toBe('17:30');
    expect(addMinutes('23:30', 45)).toBe('24:15');
  });
  it('weekdayOf: 2026-06-29는 월요일(1)', () => {
    expect(weekdayOf('2026-06-29')).toBe(1);
  });
});

describe('overlaps (경계값)', () => {
  it('맞닿은 시간은 충돌 아님 (16:00–17:30 / 17:30–18:30)', () => {
    expect(overlaps('16:00', '17:30', '17:30', '18:30')).toBe(false);
  });
  it('1분 겹침은 충돌', () => {
    expect(overlaps('16:00', '17:30', '17:29', '18:00')).toBe(true);
  });
  it('완전 포함도 충돌', () => {
    expect(overlaps('16:00', '18:00', '16:30', '17:00')).toBe(true);
  });
});

describe('detectConflicts', () => {
  const existing = [sess({ id: 100, instructorId: 1, roomId: 1, startTime: '16:00', endTime: '17:30' })];

  it('충돌 없으면 빈 배열', () => {
    const c = detectConflicts(
      { sessionDate: '2026-06-29', startTime: '18:00', durationMinutes: 60, instructorId: 1, roomId: 1 },
      { sessions: existing },
    );
    expect(c).toEqual([]);
  });

  it('같은 강사·시간겹침 → 강사 이중예약', () => {
    const c = detectConflicts(
      { sessionDate: '2026-06-29', startTime: '17:00', durationMinutes: 60, instructorId: 1, roomId: 2 },
      { sessions: existing },
    );
    expect(c).toContainEqual({ type: 'double_book', resource: 'instructor', resourceId: 1, sessionId: 100 });
  });

  it('같은 강의실·시간겹침 → 강의실 이중예약', () => {
    const c = detectConflicts(
      { sessionDate: '2026-06-29', startTime: '17:00', durationMinutes: 60, instructorId: 9, roomId: 1 },
      { sessions: existing },
    );
    expect(c.some((x) => x.type === 'double_book' && x.resource === 'room')).toBe(true);
  });

  it('이동(ignoreSessionId)하면 자기 자신과는 충돌 아님', () => {
    const c = detectConflicts(
      { sessionDate: '2026-06-29', startTime: '16:00', durationMinutes: 90, instructorId: 1, roomId: 1, ignoreSessionId: 100 },
      { sessions: existing },
    );
    expect(c).toEqual([]);
  });

  it('불가시간(Block) 위 배치 → unavailable', () => {
    const blocks: AvailabilityBlock[] = [
      { id: 1, ownerType: 'instructor', ownerId: 1, kind: 'unavailable', weekday: 1, startTime: '12:00', endTime: '13:00' },
    ];
    const c = detectConflicts(
      { sessionDate: '2026-06-29', startTime: '12:30', durationMinutes: 60, instructorId: 1 },
      { sessions: [], blocks },
    );
    expect(c).toContainEqual({ type: 'unavailable', resource: 'instructor', resourceId: 1 });
  });

  it('강의실 capacity 초과 → room_capacity', () => {
    const c = detectConflicts(
      { sessionDate: '2026-06-29', startTime: '20:00', durationMinutes: 60, roomId: 1 },
      { sessions: [], roomCapacity: { 1: 6 }, enrolledCount: 8 },
    );
    expect(c.some((x) => x.type === 'room_capacity')).toBe(true);
  });
});

describe('move/resize 후보 + 충돌', () => {
  const base = sess({ id: 1, instructorId: 1, roomId: 1, sessionDate: '2026-06-29', startTime: '16:00', endTime: '17:30', durationMinutes: 90 });
  const other = sess({ id: 2, instructorId: 1, roomId: 2, sessionDate: '2026-06-30', startTime: '16:00', endTime: '17:00', durationMinutes: 60 });

  it('moveCandidate: 길이 유지하며 날짜/시각 이동', () => {
    const c = moveCandidate(base, { sessionDate: '2026-06-30', startTime: '16:30' });
    expect(c).toMatchObject({ sessionDate: '2026-06-30', startTime: '16:30', durationMinutes: 90, ignoreSessionId: 1 });
  });

  it('moveCandidate: 다른 수업과 강사 시간겹침이면 충돌', () => {
    const c = moveCandidate(base, { sessionDate: '2026-06-30', startTime: '16:30' }); // 16:30-18:00, 강사1
    expect(detectConflicts(c, { sessions: [other] }).some((x) => x.resource === 'instructor')).toBe(true);
  });

  it('resizeCandidate: 끝 핸들 → 길이 재계산', () => {
    const c = resizeCandidate(base, { endTime: '18:00' });
    expect(c.durationMinutes).toBe(120);
  });

  it('resizeCandidate: 최소 길이(15분) 보장', () => {
    const c = resizeCandidate(base, { startTime: '16:00', endTime: '16:05' });
    expect(c.durationMinutes).toBe(15);
  });
});

describe('teachingHours', () => {
  it('기간·강사 필터 + 시수 합', () => {
    const sessions = [
      sess({ id: 1, instructorId: 1, durationMinutes: 90, sessionDate: '2026-06-29' }),
      sess({ id: 2, instructorId: 1, durationMinutes: 120, sessionDate: '2026-06-30' }),
      sess({ id: 3, instructorId: 2, durationMinutes: 60, sessionDate: '2026-06-29' }),
      sess({ id: 4, instructorId: 1, durationMinutes: 60, sessionDate: '2026-07-10' }), // 기간 밖
    ];
    const r = teachingHours(sessions, { from: '2026-06-29', to: '2026-07-05', instructorId: 1 });
    expect(r.sessions).toBe(2);
    expect(r.minutes).toBe(210);
    expect(r.hours).toBe(3.5);
  });
});

describe('layoutLanes (겹침 나란히)', () => {
  it('안 겹치면 모두 1열', () => {
    const r = layoutLanes([{ id: 1, start: 540, end: 600 }, { id: 2, start: 660, end: 720 }]);
    expect(r[1]).toEqual({ lane: 0, lanes: 1 });
    expect(r[2]).toEqual({ lane: 0, lanes: 1 });
  });
  it('부분 겹침(시작/끝 다름) → 2열로 나란히', () => {
    const r = layoutLanes([{ id: 1, start: 540, end: 660 }, { id: 2, start: 600, end: 720 }]);
    expect(r[1].lanes).toBe(2);
    expect(r[2].lanes).toBe(2);
    expect(r[1].lane).not.toBe(r[2].lane);
  });
  it('3중 겹침 → 3열', () => {
    const r = layoutLanes([
      { id: 1, start: 540, end: 720 }, { id: 2, start: 560, end: 700 }, { id: 3, start: 580, end: 660 },
    ]);
    expect(Math.max(r[1].lanes, r[2].lanes, r[3].lanes)).toBe(3);
  });
});

describe('suggestSlots (겹치지 않는 추천)', () => {
  it('점유 시간과 겹치지 않는 후보만 반환', () => {
    const sessions = [sess({ id: 1, instructorId: 1, sessionDate: '2026-06-29', startTime: '09:00', endTime: '10:00', durationMinutes: 60 })];
    const slots = suggestSlots(
      { weekStart: '2026-06-29', weekdays: [1], workStart: '09:00', workEnd: '11:00', durationMinutes: 60, stepMin: 30, instructorId: 1 },
      { sessions },
    );
    // 09:00·09:30 후보는 점유와 겹쳐 제외, 10:00 후보만 남음
    expect(slots.every((s) => s.startTime >= '10:00')).toBe(true);
    expect(slots.some((s) => s.startTime === '10:00')).toBe(true);
  });
  it('불가시간(Block)도 제외', () => {
    const blocks = [{ id: 1, ownerType: 'instructor' as const, ownerId: 1, kind: 'unavailable' as const, weekday: 1, startTime: '12:00', endTime: '13:00' }];
    const slots = suggestSlots(
      { weekStart: '2026-06-29', weekdays: [1], workStart: '11:00', workEnd: '14:00', durationMinutes: 60, stepMin: 60, instructorId: 1 },
      { sessions: [], blocks },
    );
    expect(slots.some((s) => s.startTime === '12:00')).toBe(false);
  });
});

// ── 참조 크기별(스케일) 불변식 ──
function makeWeek(n: number): ClassSession[] {
  // 전역적으로 유니크한 (날짜, 30분 슬롯)에 배치 → 같은 날 두 수업은 시간이 절대 안 겹침.
  // (강사/강의실이 어떻게 분포해도 same-resource 겹침이 0임을 보장)
  const SLOTS = 20; // 09:00~19:00, 30분 간격
  const out: ClassSession[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(1 + Math.floor(i / SLOTS)); // 슬롯 다 차면 다음 날(월말 롤오버 안전)
    const startMin = 9 * 60 + (i % SLOTS) * 30;
    const hh = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
    out.push(sess({
      id: i + 1, instructorId: (i % 2) + 1, roomId: (i % 3) + 1,
      sessionDate: d.toISOString().slice(0, 10),
      startTime: hh, endTime: addMinutes(hh, 30), durationMinutes: 30, status: 'held',
    }));
  }
  return out;
}
function conflictsWithin(sessions: ClassSession[]): number {
  let c = 0;
  for (let i = 0; i < sessions.length; i++)
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i], b = sessions[j];
      if (a.sessionDate === b.sessionDate && a.startTime && b.startTime &&
        overlaps(a.startTime, a.endTime!, b.startTime, b.endTime!) &&
        (a.instructorId === b.instructorId || a.roomId === b.roomId)) c++;
    }
  return c;
}

describe.each([10, 100, 1000])('스케일 N=%i 불변식', (n) => {
  const sessions = makeWeek(n);
  it('① 같은 자원 시간겹침 0', () => {
    expect(conflictsWithin(sessions)).toBe(0);
  });
  it('② 모든 세션이 startTime/endTime 보유(FK 자리 일관)', () => {
    expect(sessions.every((s) => !!s.startTime && !!s.endTime && s.durationMinutes > 0)).toBe(true);
  });
  it('③ 시수 합 = N×30분', () => {
    expect(teachingHours(sessions).minutes).toBe(n * 30);
  });
});

// 2026-06-29 = 월요일(weekday 1). weekStart로 사용.
const MON = '2026-06-29';

describe('suggestPairSlots (학생가용 ∧ 강사가용)', () => {
  it('교집합 윈도우에서만 후보 생성', () => {
    const blocks = [
      ablock({ id: 1, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '09:00', endTime: '12:00' }),
      ablock({ id: 2, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '10:00', endTime: '11:00' }),
    ];
    const out = suggestPairSlots(
      { weekStart: MON, weekdays: [1], durationMinutes: 60, stepMin: 30, instructorId: 1, studentId: 2 },
      { sessions: [], blocks },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: MON, startTime: '10:00', endTime: '11:00' });
  });

  it('강사 불가시간(Block)이 교집합을 가리면 제외', () => {
    const blocks = [
      ablock({ id: 1, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '09:00', endTime: '12:00' }),
      ablock({ id: 2, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '10:00', endTime: '11:00' }),
      ablock({ id: 3, ownerType: 'instructor', ownerId: 1, kind: 'unavailable', weekday: 1, startTime: '10:00', endTime: '10:30' }),
    ];
    const out = suggestPairSlots(
      { weekStart: MON, weekdays: [1], durationMinutes: 60, stepMin: 30, instructorId: 1, studentId: 2 },
      { sessions: [], blocks },
    );
    expect(out).toHaveLength(0);
  });

  it('강사 점유(기존 수업)와 겹치면 제외', () => {
    const blocks = [
      ablock({ id: 1, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '09:00', endTime: '12:00' }),
      ablock({ id: 2, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '10:00', endTime: '12:00' }),
    ];
    const sessions = [sess({ id: 9, instructorId: 1, sessionDate: MON, startTime: '10:00', endTime: '11:00' })];
    const out = suggestPairSlots(
      { weekStart: MON, weekdays: [1], durationMinutes: 60, stepMin: 30, instructorId: 1, studentId: 2 },
      { sessions, blocks },
    );
    expect(out.map((s) => s.startTime)).toEqual(['11:00']); // 10:00·10:30은 점유와 겹쳐 제외
  });
});

describe('recommendForStudent (학생 중심 수업·강사 추천)', () => {
  const courses = [
    { id: 11, name: 'AP Calculus BC', instructorId: 2 },
    { id: 10, name: 'SAT Reading 정규', instructorId: 1 },
  ];

  it('강사가 비면 instructorFree=true, 점유면 false (둘 다 후보로 노출)', () => {
    const blocks = [ablock({ id: 1, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '16:00', endTime: '18:00' })];
    // 강사1(코스10)은 16:00-17:30 점유 → 조정 필요. 강사2(코스11)는 가용.
    const sessions = [sess({ id: 9, instructorId: 1, courseId: 10, sessionDate: MON, startTime: '16:00', endTime: '17:30', studentIds: [1, 4] })];
    const out = recommendForStudent(
      { weekStart: MON, weekdays: [1], durationMinutes: 90, stepMin: 30, studentId: 2, courses },
      { sessions, blocks },
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].instructorFree).toBe(true); // 가용 강사가 먼저
    const free = out.find((r) => r.courseId === 11);
    const adjust = out.find((r) => r.courseId === 10 && r.startTime === '16:00');
    expect(free?.instructorFree).toBe(true);
    expect(adjust?.instructorFree).toBe(false);
    expect(adjust?.reason).toBeTruthy();
  });

  it('학생 본인 점유 시간은 후보에서 제외', () => {
    // 학생 가용 16:00-20:00, 본인 수업 16:00-17:30 → 17:30 이전 시작은 모두 제외, 17:30부터 가능.
    const blocks = [ablock({ id: 1, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '16:00', endTime: '20:00' })];
    const sessions = [sess({ id: 9, instructorId: 2, courseId: 11, sessionDate: MON, startTime: '16:00', endTime: '17:30', studentIds: [2] })];
    const out = recommendForStudent(
      { weekStart: MON, weekdays: [1], durationMinutes: 90, stepMin: 30, studentId: 2, courses },
      { sessions, blocks },
    );
    expect(out.every((r) => r.startTime >= '17:30')).toBe(true); // 본인 점유(–17:30)와 겹치는 시작 제외
    expect(out.some((r) => r.startTime === '17:30')).toBe(true);
  });
});

describe('ownerWindows', () => {
  it('특정 owner/kind 블록만 요일별 분 구간으로', () => {
    const blocks = [
      ablock({ id: 1, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '09:00', endTime: '12:00' }),
      ablock({ id: 2, ownerType: 'instructor', ownerId: 1, kind: 'unavailable', weekday: 1, startTime: '12:00', endTime: '13:00' }),
      ablock({ id: 3, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '10:00', endTime: '11:00' }),
    ];
    const w = ownerWindows(blocks, 'instructor', 1, 'available');
    expect(w).toEqual([{ weekday: 1, start: 540, end: 720 }]);
  });
});

describe('recommendInstructorsForStudent (학생 → 적합 강사)', () => {
  it('학생과 가용이 겹치는 강사만 슬롯수 순으로 추천', () => {
    const blocks = [
      ablock({ id: 1, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '16:00', endTime: '18:00' }),
      ablock({ id: 2, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '16:00', endTime: '18:00' }), // 겹침 → 추천
      ablock({ id: 3, ownerType: 'instructor', ownerId: 2, kind: 'available', weekday: 1, startTime: '09:00', endTime: '11:00' }), // 안겹침 → 제외
    ];
    const out = recommendInstructorsForStudent(
      { weekStart: MON, weekdays: [1], durationMinutes: 60, stepMin: 30, studentId: 2,
        instructors: [{ id: 1, name: '박지훈' }, { id: 2, name: '정유진' }] },
      { sessions: [], blocks },
    );
    expect(out.map((m) => m.instructorId)).toEqual([1]);
    expect(out[0].freeSlots).toBeGreaterThan(0);
  });

  it('강사 불가시간이 교집합을 가리면 추천 제외', () => {
    const blocks = [
      ablock({ id: 1, ownerType: 'student', ownerId: 2, kind: 'available', weekday: 1, startTime: '16:00', endTime: '17:00' }),
      ablock({ id: 2, ownerType: 'instructor', ownerId: 1, kind: 'available', weekday: 1, startTime: '16:00', endTime: '17:00' }),
      ablock({ id: 3, ownerType: 'instructor', ownerId: 1, kind: 'unavailable', weekday: 1, startTime: '16:00', endTime: '17:00' }),
    ];
    const out = recommendInstructorsForStudent(
      { weekStart: MON, weekdays: [1], durationMinutes: 60, stepMin: 30, studentId: 2, instructors: [{ id: 1, name: '박지훈' }] },
      { sessions: [], blocks },
    );
    expect(out).toHaveLength(0);
  });
});
