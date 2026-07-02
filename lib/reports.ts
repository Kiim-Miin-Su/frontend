// ─────────────────────────────────────────────────────────────
// "리포트 미작성" 단일 정의 — Sidebar 배지·Topbar 알림·보고서 탭 리스트·대시보드가
// 모두 여기서 개수를 계산한다(참조 무결성: 한 곳에서 리포트를 쓰면 모든 곳의 개수가 함께 줄어듦).
//
// ▣ 유일한 기준 함수 = missingReportStudentIds(s, session)
//   기준: status==='held'(진행완료) AND 실제 종료 시각이 지난(지난 수업) AND
//         수강생 중 리포트가 없거나 'draft'(작성중)인 학생.
//   → 세션 목록/세션 수/보고서 건수/필요 여부 전부 이 함수 하나만 호출해서 파생(중복 로직 제거).
// ─────────────────────────────────────────────────────────────
import type { ClassSession, Enrollment, SessionReport } from "@/types";

export type ReportSlice = {
  classSessions: ClassSession[];
  enrollments: Enrollment[];
  sessionReports: SessionReport[];
};

// 코스 로스터(리포트 대상 수강생) — **활성 수강만**(enrollment.status==='active').
//  백엔드 스케줄 코호트(activeStudentIds)와 동일 규칙(감사 B): 취소/일시정지/완료 수강생은
//  리포트 미작성 집계에서 제외(소프트삭제된 학생은 enrollment도 canceled로 정리됨 — students.remove).
//  export: ReportWriteView/ReportsCalendarView가 자체 rosterOf 중복 대신 이 함수를 쓴다(단일 소스).
export function rosterStudentIds(s: Pick<ReportSlice, 'enrollments'>, courseId: number): number[] {
  return s.enrollments.filter((e) => e.courseId === courseId && e.status === 'active').map((e) => e.studentId);
}

// 세션 종료 시각(ms). endTime 없으면 startTime + durationMinutes로 계산. (로컬 시각 기준)
// export: 보강 판정(lib/makeup)도 "실제 종료 여부"를 같은 규칙으로 공유.
export function sessionEndMs(session: ClassSession): number {
  if (!session.startTime) return Number.POSITIVE_INFINITY; // 시작 시각 없으면 종료 판정 보류(미포함)
  let endHHMM = session.endTime;
  if (!endHHMM) {
    const [h, m] = session.startTime.split(":").map(Number);
    const total = h * 60 + m + (session.durationMinutes ?? 0);
    endHHMM = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const t = Date.parse(`${session.sessionDate}T${endHHMM}:00`);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

// ▣ 유일한 기준 함수 — 한 세션에서 "리포트 미작성"인 수강생 id 목록.
//  - held(진행완료) 아니면 [] (예정·취소·노쇼·보강은 시수/보고 대상 아님).
//  - 아직 끝나지 않은 수업([])이면 [] (지난 수업만 = 배지·리스트 공통 기준).
//  - 수강생 없으면 [] (작성 대상 아님). 리포트 없음/draft인 학생만 포함.
export function missingReportStudentIds(
  s: ReportSlice,
  session: ClassSession,
  nowMs: number = Date.now(),
): number[] {
  if (session.status !== "held") return [];
  if (sessionEndMs(session) > nowMs) return [];
  return rosterStudentIds(s, session.courseId).filter((stId) => {
    const r = s.sessionReports.find((x) => x.sessionId === session.id && x.studentId === stId);
    return !r || r.status === "draft";
  });
}

// 한 세션이 리포트 미작성 상태인가? (기준 함수 파생)
export function sessionNeedsReport(s: ReportSlice, session: ClassSession, nowMs: number = Date.now()): boolean {
  return missingReportStudentIds(s, session, nowMs).length > 0;
}

// 리포트 미작성 세션 목록(강사 지정 시 해당 강사만, 미지정 시 전체). (기준 함수 파생)
export function pendingReportSessions(s: ReportSlice, instructorId?: number, nowMs: number = Date.now()): ClassSession[] {
  return s.classSessions.filter(
    (ses) => (instructorId == null || ses.instructorId === instructorId) && sessionNeedsReport(s, ses, nowMs),
  );
}

// 미작성 세션 수(작성해야 할 "수업" 수). (기준 함수 파생)
export function pendingReportCount(s: ReportSlice, instructorId?: number, nowMs: number = Date.now()): number {
  return pendingReportSessions(s, instructorId, nowMs).length;
}

// 미작성 "보고서" 건수 = 세션별 미작성 수강생 수의 합. 배지·리스트가 쓰는 값(수업 수가 아닌 보고서 건수). (기준 함수 파생)
export function pendingReportItemCount(s: ReportSlice, instructorId?: number, nowMs: number = Date.now()): number {
  return s.classSessions.reduce(
    (n, ses) => (instructorId != null && ses.instructorId !== instructorId ? n : n + missingReportStudentIds(s, ses, nowMs).length),
    0,
  );
}

// ▣ 배지·탭 공용 요약 — 같은 모집단(전체 기간 + 동일 역할 스코프)에서 세션 수와 보고서 건수를 함께.
//  버그(2026-07-02) 재발 방지: 배지=보고서 건수(itemCount) vs 탭=세션 수(sessionCount)가 서로 다른
//  스코프(월/강사)로 계산돼 "탭 10건 vs 배지 4" 불일치 발생 → 두 뷰 모두 이 함수 하나만 쓴다.
export function pendingReportSummary(
  s: ReportSlice,
  instructorId?: number,
  nowMs: number = Date.now(),
): { sessions: ClassSession[]; sessionCount: number; itemCount: number } {
  const sessions = pendingReportSessions(s, instructorId, nowMs);
  const itemCount = sessions.reduce((n, ses) => n + missingReportStudentIds(s, ses, nowMs).length, 0);
  return { sessions, sessionCount: sessions.length, itemCount };
}
