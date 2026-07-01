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

// 한 세션이 리포트 미작성 상태인가?
//  - 진행완료(held)이고 **실제로 종료 시각이 지난** 수업만 대상(예정·아직 안 끝난 수업 제외 = 강건성).
//  - 결강/취소는 제외(시수 미측정). 수강생 중 리포트 없음/draft가 있으면 미작성으로 본다.
export function sessionNeedsReport(s: ReportSlice, session: ClassSession, nowMs: number = Date.now()): boolean {
  if (session.status !== "held") return false;
  if (sessionEndMs(session) > nowMs) return false; // 아직 끝나지 않은 수업 → 리포트 대상 아님
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

// 미작성 세션 수(작성해야 할 "수업" 수).
export function pendingReportCount(s: ReportSlice, instructorId?: number): number {
  return pendingReportSessions(s, instructorId).length;
}

// 미작성 "보고서" 건수 = held 세션 × 수강생 중 (리포트 없음 or draft)인 (세션·학생) 쌍의 수.
// 알림 배지는 "작성해야 할 보고서 건당 하나"가 직관적이므로 이 값을 사용.
export function pendingReportItemCount(s: ReportSlice, instructorId?: number, nowMs: number = Date.now()): number {
  let n = 0;
  for (const ses of s.classSessions) {
    if (instructorId != null && ses.instructorId !== instructorId) continue;
    if (ses.status !== 'held') continue;
    if (sessionEndMs(ses) > nowMs) continue; // 아직 끝나지 않은 수업 제외(강건성)
    const roster = s.enrollments.filter((e) => e.courseId === ses.courseId).map((e) => e.studentId);
    for (const stId of roster) {
      const r = s.sessionReports.find((x) => x.sessionId === ses.id && x.studentId === stId);
      if (!r || r.status === 'draft') n += 1;
    }
  }
  return n;
}
