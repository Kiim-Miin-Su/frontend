import { describe, it, expect } from 'vitest';
import {
  missingReportStudentIds,
  sessionNeedsReport,
  pendingReportSessions,
  pendingReportCount,
  pendingReportItemCount,
  pendingReportSummary,
  type ReportSlice,
} from './reports';
import type { ClassSession, Enrollment, SessionReport } from '@/types';

const ses = (p: Partial<ClassSession>): ClassSession => ({
  id: 1, courseId: 10, instructorId: 1, sessionDate: '2026-06-30', startTime: '16:00',
  durationMinutes: 90, status: 'held', ...p,
} as ClassSession);
const enr = (p: Partial<Enrollment>): Enrollment => ({ id: 1, studentId: 1, courseId: 10, status: 'active', enrolledAt: '2026-06-01', ...p } as Enrollment);

const NOW = Date.parse('2026-06-30T17:00:00'); // 16:00~17:30 수업은 아직 진행 중

describe('sessionNeedsReport (강건성: 실제 종료된 수업만)', () => {
  const slice: ReportSlice = { classSessions: [], enrollments: [enr({})], sessionReports: [] };

  it('held지만 아직 안 끝난 수업(16:00~17:30, 현재 17:00) → 리포트 대상 아님', () => {
    expect(sessionNeedsReport(slice, ses({ sessionDate: '2026-06-30', startTime: '16:00' }), NOW)).toBe(false);
  });

  it('held이고 종료된 수업(어제) → 리포트 대상', () => {
    expect(sessionNeedsReport(slice, ses({ sessionDate: '2026-06-29', startTime: '16:00' }), NOW)).toBe(true);
  });

  it('예정(scheduled) 수업 → 대상 아님', () => {
    expect(sessionNeedsReport(slice, ses({ sessionDate: '2026-06-20', status: 'scheduled' }), NOW)).toBe(false);
  });

  it('취소(canceled) 수강은 리포트 대상에서 제외 — 백엔드 코호트와 동일 규칙(감사 B)', () => {
    const s2: ReportSlice = {
      classSessions: [],
      enrollments: [enr({ id: 1, studentId: 1 }), enr({ id: 2, studentId: 4, status: 'canceled' })],
      sessionReports: [],
    };
    expect(missingReportStudentIds(s2, ses({ sessionDate: '2026-06-29' }), NOW)).toEqual([1]); // 4 제외
  });

  it('이미 작성(non-draft)된 학생만 있으면 → 대상 아님', () => {
    const reports: SessionReport[] = [{ id: 1, sessionId: 1, studentId: 1, instructorId: 1, content: 'x', status: 'submitted' } as SessionReport];
    const s2: ReportSlice = { classSessions: [], enrollments: [enr({})], sessionReports: reports };
    expect(sessionNeedsReport(s2, ses({ sessionDate: '2026-06-29' }), NOW)).toBe(false);
  });
});

describe('pendingReportItemCount (종료된 수업의 미작성 보고서 건수)', () => {
  it('종료된 held 2건(각 1명) − 작성 1 = 1', () => {
    const slice: ReportSlice = {
      classSessions: [ses({ id: 1, sessionDate: '2026-06-29' }), ses({ id: 2, sessionDate: '2026-06-28' })],
      enrollments: [enr({})],
      sessionReports: [{ id: 1, sessionId: 1, studentId: 1, instructorId: 1, content: 'x', status: 'submitted' } as SessionReport],
    };
    expect(pendingReportItemCount(slice, undefined, NOW)).toBe(1); // 세션2만 미작성
  });

  it('아직 안 끝난 수업은 건수에서 제외', () => {
    const slice: ReportSlice = {
      classSessions: [ses({ id: 9, sessionDate: '2026-06-30', startTime: '16:00' })],
      enrollments: [enr({})], sessionReports: [],
    };
    expect(pendingReportItemCount(slice, undefined, NOW)).toBe(0);
  });
});

// 단일 소스: 모든 파생 함수가 missingReportStudentIds 하나에서 나온다.
describe('단일 기준 함수 missingReportStudentIds ↔ 파생 일치', () => {
  // 종료된 held 세션, 수강생 2명(1·4) 중 1명(1)만 작성 → 미작성 학생 [4].
  const slice: ReportSlice = {
    classSessions: [ses({ id: 1, sessionDate: '2026-06-29' })],
    enrollments: [enr({ id: 1, studentId: 1 }), enr({ id: 2, studentId: 4 })],
    sessionReports: [{ id: 1, sessionId: 1, studentId: 1, instructorId: 1, content: 'x', status: 'submitted' } as SessionReport],
  };

  it('미작성 학생 목록 = [4] (수업 1건이지만 보고서 누락은 1건)', () => {
    expect(missingReportStudentIds(slice, slice.classSessions[0], NOW)).toEqual([4]);
  });

  it('세션 수(1) vs 보고서 건수(1) — 같은 기준에서 파생', () => {
    expect(pendingReportCount(slice, undefined, NOW)).toBe(1);      // 미작성 세션 1건
    expect(pendingReportItemCount(slice, undefined, NOW)).toBe(1);  // 미작성 보고서 1건
    expect(pendingReportSessions(slice, undefined, NOW).map((s) => s.id)).toEqual([1]);
    expect(sessionNeedsReport(slice, slice.classSessions[0], NOW)).toBe(true);
  });

  it('보고서 건수 > 세션 수 케이스(2명 모두 미작성) — 배지=건수 반영', () => {
    const s2: ReportSlice = { ...slice, sessionReports: [] };
    expect(pendingReportCount(s2, undefined, NOW)).toBe(1);     // 수업은 1건
    expect(pendingReportItemCount(s2, undefined, NOW)).toBe(2); // 보고서 누락은 2건(수업 수보다 많음)
  });
});

// 버그 회귀(2026-07-02): "탭 10건 vs 배지 4" — 배지와 탭이 서로 다른 스코프(월/강사)·단위(세션/보고서)로
// 계산돼 불일치. 두 뷰 공용 pendingReportSummary가 배지(itemCount)·리스트(sessions)를 한 모집단에서 산출.
describe('pendingReportSummary — 배지·탭 공용 모집단', () => {
  // 강사1: 종료 세션 2건(미작성 1+2=3건) · 강사2: 종료 세션 1건(미작성 1건) · 진행중 1건(제외)
  const slice: ReportSlice = {
    classSessions: [
      ses({ id: 1, sessionDate: '2026-06-29', instructorId: 1 }),
      ses({ id: 2, sessionDate: '2026-06-28', instructorId: 1, courseId: 11 }),
      ses({ id: 3, sessionDate: '2026-06-27', instructorId: 2 }),
      ses({ id: 4, sessionDate: '2026-06-30', startTime: '16:00', instructorId: 1 }), // 진행 중 → 제외
    ],
    enrollments: [enr({ id: 1, studentId: 1 }), enr({ id: 2, studentId: 4 }), enr({ id: 3, studentId: 7, courseId: 11 })],
    sessionReports: [{ id: 1, sessionId: 1, studentId: 1, instructorId: 1, content: 'x', status: 'submitted' } as SessionReport],
  };
  // 세션1(코스10, 수강 1·4): 학생1 작성 → 미작성 [4] = 1건
  // 세션2(코스11, 수강 7): 미작성 1건 / 세션3(코스10): 미작성 2건(1·4)

  it('itemCount = Σ missingReportStudentIds (배지 값), sessions = 리스트 모집단 — 항상 일치', () => {
    const all = pendingReportSummary(slice, undefined, NOW);
    expect(all.sessions.map((s) => s.id).sort()).toEqual([1, 2, 3]);
    expect(all.sessionCount).toBe(3); // 탭 "수업 N개"
    expect(all.itemCount).toBe(4); // 배지 "보고서 M건" = 1+1+2
    // 불변식: itemCount == 모집단 세션들의 미작성 합 (탭·배지 불일치 원천 차단)
    expect(all.itemCount).toBe(
      all.sessions.reduce((n, s) => n + missingReportStudentIds(slice, s, NOW).length, 0),
    );
  });

  it('강사 스코프: 배지(강사)와 리포트 작성 탭이 같은 숫자를 본다', () => {
    const inst1 = pendingReportSummary(slice, 1, NOW);
    expect(inst1.sessions.map((s) => s.id).sort()).toEqual([1, 2]);
    expect(inst1.sessionCount).toBe(2);
    expect(inst1.itemCount).toBe(2); // 세션1[4]=1 + 세션2[7]=1
    expect(inst1.itemCount).toBe(pendingReportItemCount(slice, 1, NOW)); // 기존 배지 함수와 동치
  });

  it('전체 = 강사별 합(스코프 분해 정합)', () => {
    const all = pendingReportSummary(slice, undefined, NOW);
    const byInst = pendingReportSummary(slice, 1, NOW).itemCount + pendingReportSummary(slice, 2, NOW).itemCount;
    expect(all.itemCount).toBe(byInst);
  });
});
