import { describe, it, expect } from 'vitest';
import type { ClassSession, AvailabilityBlock } from '@/types';
import { overlaps, addMinutes, weekdayOf, detectConflicts, teachingHours } from './schedule';

const sess = (p: Partial<ClassSession>): ClassSession => ({
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
