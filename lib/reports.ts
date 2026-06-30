// ─────────────────────────────────────────────────────────────
// "리포트 미작성" 단일 정의 — Sidebar 배지·Topbar 알림·작성 화면이 모두 이 함수를 써서
// 같은 기준으로 개수를 계산한다(참조 무결성: 한 곳에서 리포트를 쓰면 모든 곳의 개수가 함께 줄어듦).
//
// 기준: status==='held'(진행 완료) 세션에서, 수강생 중 한 명이라도
//       리포트가 없거나 'draft'(작성중)이면 그 세션은 "리포트 미작성"으로 센다.
// ─────────────────────────────────────────────────────────────
import type { ClassSession, Enrollment, SessionReport } from "@/types";

export type ReportSlice = {
  classSessions: ClassSession[];
  enrollments: Enrollment[];
  sessionReports: SessionReport[];
};

function rosterStudentIds(s: ReportSlice, courseId: number): number[] {
  return s.enrollments.filter((e) => e.courseId === courseId).map((e) => e.studentId);
}

// 한 세션이 리포트 미작성 상태인가?
export function sessionNeedsReport(s: ReportSlice, session: ClassSession): boolean {
  if (session.status !== "held") return false;
  const roster = rosterStudentIds(s, session.courseId);
  if (roster.length === 0) return false; // 수강생 없으면 작성 대상 아님
  return roster.some((stId) => {
    const r = s.sessionReports.find((x) => x.sessionId === session.id && x.studentId === stId);
    return !r || r.status === "draft";
  });
}

// 리포트 미작성 세션 목록(강사 지정 시 해당 강사만, 미지정 시 전체).
export function pendingReportSessions(s: ReportSlice, instructorId?: number): ClassSession[] {
  return s.classSessions.filter(
    (ses) => (instructorId == null || ses.instructorId === instructorId) && sessionNeedsReport(s, ses),
  );
}

export function pendingReportCount(s: ReportSlice, instructorId?: number): number {
  return pendingReportSessions(s, instructorId).length;
}
