"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { currentClaims } from "@/lib/auth";
import { isPublicRoute } from "@/lib/auth-routes";
import { useTacoStore } from "@/lib/store";
import { api, type SessionReport as ApiReport } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { AccountRole, SessionReport } from "@/types";

// 백엔드 보고서(승인 라이프사이클: draft|submitted|approved|rejected)를 store 모델로 정규화.
// 배지 계산은 'draft=미작성', 승인 대기는 approvalStatus로 판단하므로 실제 상태를 approvalStatus에 보존한다.
//  - approved → 'sent'(작성 완료로 집계)  · rejected → 'draft'(재작성 필요 = 미작성으로 집계)
function toStoreReport(r: ApiReport): SessionReport {
  const status: SessionReport["status"] =
    r.status === "approved" ? "sent" : r.status === "rejected" ? "draft" : r.status;
  return {
    id: r.id, sessionId: r.sessionId, studentId: r.studentId, instructorId: r.instructorId,
    subjectId: r.subjectId, content: r.content, homework: r.homework,
    status, approvalStatus: r.status,
    submittedAt: r.submittedAt, approvedAt: r.approvedAt, approvedBy: r.approvedBy,
    rejectedReason: r.rejectedReason,
  };
}

// 공개(인증) 경로는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화 + 백엔드 적재.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const setInstructorPayouts = useTacoStore((s) => s.setInstructorPayouts);
  const setClassSessions = useTacoStore((s) => s.setClassSessions);
  const setSessionReports = useTacoStore((s) => s.setSessionReports);
  const setStudents = useTacoStore((s) => s.setStudents);
  const setPayments = useTacoStore((s) => s.setPayments);
  const setExpenses = useTacoStore((s) => s.setExpenses);
  const setEnrollments = useTacoStore((s) => s.setEnrollments);
  const setCourses = useTacoStore((s) => s.setCourses);
  const setSubjects = useTacoStore((s) => s.setSubjects);
  const publicRoute = isPublicRoute(pathname);

  // 로그인된 경우에만 역할을 앱 전역 currentRole에 반영(공개 경로에선 동기화하지 않음).
  useEffect(() => {
    if (publicRoute) return;
    const claims = currentClaims();
    const role = claims?.roles?.[0];
    if (role) setCurrentRole(role as AccountRole);
  }, [pathname, publicRoute, setCurrentRole]);

  // 단일 소스화: 백엔드(정산서·세션·보고서)를 TanStack Query로 패칭(캐시·재검증) → store로 write-through.
  // 배지/대시보드는 store 기준이라, 캘린더 등에서 관련 쿼리를 invalidate하면 자동 재패칭→store 갱신됨.
  // 실패(오프라인)면 쿼리는 에러로 두고 기존 시드를 유지(store 미변경).
  const enabled = !publicRoute;
  const payoutsQ = useQuery({ queryKey: qk.payouts.list(), queryFn: () => api.payouts.list(), enabled });
  const scheduleQ = useQuery({ queryKey: qk.schedule.list({}), queryFn: () => api.schedule.list({}), enabled });
  const reportsQ = useQuery({ queryKey: qk.reports.list(), queryFn: () => api.reports.list(), enabled });
  const studentsQ = useQuery({ queryKey: qk.students.list(), queryFn: () => api.students.list(), enabled });
  const paymentsQ = useQuery({ queryKey: qk.payments.list(), queryFn: () => api.payments.list(), enabled });
  const expensesQ = useQuery({ queryKey: qk.expenses.list(), queryFn: () => api.expenses.list(), enabled });
  const enrollmentsQ = useQuery({ queryKey: qk.enrollments.list(), queryFn: () => api.enrollments.list(), enabled });
  const coursesQ = useQuery({ queryKey: qk.courses.list(), queryFn: () => api.courses.list(), enabled });
  const subjectsQ = useQuery({ queryKey: qk.subjects.list(), queryFn: () => api.subjects.list(), enabled });

  useEffect(() => { if (payoutsQ.data) setInstructorPayouts(payoutsQ.data); }, [payoutsQ.data, setInstructorPayouts]);
  useEffect(() => { if (scheduleQ.data) setClassSessions(scheduleQ.data); }, [scheduleQ.data, setClassSessions]);
  useEffect(() => { if (reportsQ.data) setSessionReports(reportsQ.data.map(toStoreReport)); }, [reportsQ.data, setSessionReports]);
  useEffect(() => { if (studentsQ.data?.length) setStudents(studentsQ.data); }, [studentsQ.data, setStudents]);
  useEffect(() => { if (paymentsQ.data?.length) setPayments(paymentsQ.data); }, [paymentsQ.data, setPayments]);
  useEffect(() => { if (expensesQ.data?.length) setExpenses(expensesQ.data); }, [expensesQ.data, setExpenses]);
  useEffect(() => { if (enrollmentsQ.data?.length) setEnrollments(enrollmentsQ.data); }, [enrollmentsQ.data, setEnrollments]);
  useEffect(() => { if (coursesQ.data?.length) setCourses(coursesQ.data); }, [coursesQ.data, setCourses]);
  useEffect(() => { if (subjectsQ.data?.length) setSubjects(subjectsQ.data); }, [subjectsQ.data, setSubjects]);

  if (publicRoute) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
