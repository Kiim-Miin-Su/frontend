import { describe, it, expect } from 'vitest';
import { makeupNeeds, makeupNeededCount, type MakeupSlice } from './makeup';
import type { ClassSession } from '@/types';

const ses = (p: Partial<ClassSession>): ClassSession => ({
  id: 1, courseId: 10, instructorId: 1, sessionDate: '2026-06-20', startTime: '16:00',
  durationMinutes: 90, status: 'scheduled', ...p,
} as ClassSession);

const NOW = Date.parse('2026-06-30T12:00:00'); // 6/20은 과거, 7/x는 미래

describe('makeup (보강 필요 단일 정의)', () => {
  it('취소된 수업 → 보강 필요', () => {
    const s: MakeupSlice = { classSessions: [ses({ status: 'canceled' })] };
    expect(makeupNeededCount(s, 1, NOW)).toBe(1);
  });

  it('노쇼 수업 → 보강 필요', () => {
    const s: MakeupSlice = { classSessions: [ses({ status: 'no_show' })] };
    expect(makeupNeededCount(s, 1, NOW)).toBe(1);
  });

  it('예정인데 종료 시각이 지남(과거 미진행) → 보강 필요(unheld_past)', () => {
    const s: MakeupSlice = { classSessions: [ses({ status: 'scheduled', sessionDate: '2026-06-20' })] };
    const needs = makeupNeeds(s, 1, NOW);
    expect(needs).toHaveLength(1);
    expect(needs[0].reason).toBe('unheld_past');
  });

  it('아직 안 끝난 예정 수업(미래) → 대상 아님(강건성)', () => {
    const s: MakeupSlice = { classSessions: [ses({ status: 'scheduled', sessionDate: '2026-07-10' })] };
    expect(makeupNeededCount(s, 1, NOW)).toBe(0);
  });

  it('진행 완료(held) 수업 → 보강 대상 아님', () => {
    const s: MakeupSlice = { classSessions: [ses({ status: 'held', sessionDate: '2026-06-20' })] };
    expect(makeupNeededCount(s, 1, NOW)).toBe(0);
  });

  it('취소됐지만 보강 세션(makeupForSessionId 링크) 존재 → 해소(카운트 0)', () => {
    const s: MakeupSlice = { classSessions: [
      ses({ id: 1, status: 'canceled' }),
      ses({ id: 2, status: 'makeup', sessionDate: '2026-06-25', makeupForSessionId: 1 }),
    ] };
    expect(makeupNeededCount(s, 1, NOW)).toBe(0);
    expect(makeupNeeds(s, 1, NOW).find((m) => m.session.id === 1)?.resolved).toBe(true);
  });

  it('다른 강사의 취소 수업은 제외', () => {
    const s: MakeupSlice = { classSessions: [ses({ status: 'canceled', instructorId: 2 })] };
    expect(makeupNeededCount(s, 1, NOW)).toBe(0);
  });
});
