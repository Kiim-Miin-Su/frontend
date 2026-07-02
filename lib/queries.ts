// [참조/처리] 서버 상태 단일 소스 = TanStack Query. 도메인별 읽기 훅을 여기 모아
//  뷰가 store(zustand) 대신 이 훅으로 서버 데이터를 구독한다(실서비스 패턴).
//  - 쓰기(useMutation)는 Q3에서 도메인별로 추가하며 성공 시 관련 queryKey를 invalidate한다.
//  - buildTasks/navBadges/lib.reports 등 "여러 도메인 slice"가 필요한 로직은 useAppData()로 조립해 넘긴다.
"use client";
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type SessionReport as ApiReport } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { Instructor, SessionReport } from "@/types";

// 백엔드 보고서(draft|submitted|approved|rejected)를 store 모델로 정규화.
//  approved→'sent'(작성완료 집계) · rejected→'draft'(재작성=미작성 집계). 실제 상태는 approvalStatus에 보존.
export function toStoreReport(r: ApiReport): SessionReport {
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

// ── 도메인 읽기 훅 (뷰는 { data = [] } 형태로 구독) ──
export const useStudents = () => useQuery({ queryKey: qk.students.list(), queryFn: () => api.students.list() });
export const useParents = () => useQuery({ queryKey: qk.parents.list(), queryFn: () => api.parents.list() });
export const useParentStudents = () => useQuery({ queryKey: qk.parents.relations(), queryFn: () => api.parents.relations() });
export const useSubjects = () => useQuery({ queryKey: qk.subjects.list(), queryFn: () => api.subjects.list() });
export const useCourses = () => useQuery({ queryKey: qk.courses.list(), queryFn: () => api.courses.list() });
export const useEnrollments = () => useQuery({ queryKey: qk.enrollments.list(), queryFn: () => api.enrollments.list() });
export const useSchedule = () => useQuery({ queryKey: qk.schedule.list({}), queryFn: () => api.schedule.list({}) });
export const useAttendance = () => useQuery({ queryKey: qk.attendance.list(), queryFn: () => api.attendance.list() });
export const usePayments = () => useQuery({ queryKey: qk.payments.list(), queryFn: () => api.payments.list() });
export const useTransactions = () => useQuery({ queryKey: qk.transactions.list(), queryFn: () => api.transactions.list() });
export const useExpenses = () => useQuery({ queryKey: qk.expenses.list(), queryFn: () => api.expenses.list() });
export const usePayouts = () => useQuery({ queryKey: qk.payouts.list(), queryFn: () => api.payouts.list() });
export const useCounselForms = () => useQuery({ queryKey: qk.counsel.forms(), queryFn: () => api.counsel.forms() });
export const useCounselRounds = () => useQuery({ queryKey: qk.counsel.rounds(), queryFn: () => api.counsel.rounds() });
export const useAcademyEvents = () => useQuery({ queryKey: qk.events.list(), queryFn: () => api.events.list() });
export const useRoadmaps = () => useQuery({ queryKey: qk.roadmaps.list(), queryFn: () => api.roadmaps.list() });
export const useRoadmapCourses = () => useQuery({ queryKey: qk.roadmaps.courses(), queryFn: () => api.roadmaps.courses() });

// 보고서는 store 모델로 매핑해서 반환(배지·리포트 화면이 store 형상 사용).
export const useReports = () =>
  useQuery({ queryKey: qk.reports.list(), queryFn: async () => (await api.reports.list()).map(toStoreReport) });

// 강사 목록 = 스케줄 자원(resources)에서 파생(단일 소스). store.instructors 대체.
export const useInstructors = () =>
  useQuery({
    queryKey: [...qk.schedule.all, "resources", "instructors"] as const,
    queryFn: async (): Promise<Instructor[]> => {
      const res = await api.schedule.resources();
      return res.instructors.map((i) => ({ id: i.id, name: i.name, subjectName: i.sub }));
    },
  });

// 교차 도메인 slice — buildTasks/navBadges/lib.reports가 store 대신 이걸 받는다(전환용 컴포지트).
// 각 배열은 로딩 전 빈 배열(뷰 안전). currentRole은 zustand(클라 상태)에서 별도로 읽는다.
export function useAppData() {
  const students = useStudents().data ?? [];
  const parents = useParents().data ?? [];
  const parentStudents = useParentStudents().data ?? [];
  const subjects = useSubjects().data ?? [];
  const courses = useCourses().data ?? [];
  const enrollments = useEnrollments().data ?? [];
  const classSessions = useSchedule().data ?? [];
  const attendance = useAttendance().data ?? [];
  const sessionReports = useReports().data ?? [];
  const payments = usePayments().data ?? [];
  const transactions = useTransactions().data ?? [];
  const expenses = useExpenses().data ?? [];
  const instructorPayouts = usePayouts().data ?? [];
  const counselForms = useCounselForms().data ?? [];
  const counselRounds = useCounselRounds().data ?? [];
  const academyEvents = useAcademyEvents().data ?? [];
  const roadmaps = useRoadmaps().data ?? [];
  const roadmapCourses = useRoadmapCourses().data ?? [];
  const instructors = useInstructors().data ?? [];
  return {
    students, parents, parentStudents, subjects, courses, enrollments, classSessions,
    attendance, sessionReports, payments, transactions, expenses, instructorPayouts,
    counselForms, counselRounds, academyEvents, roadmaps, roadmapCourses, instructors,
  };
}

// ── 뮤테이션 훅 (중앙화) ──
// 쓰기는 전부 백엔드 API 경유 + 성공 시 관련 queryKey invalidate → Query(및 store 하이드레이션) 자동 갱신.
// 각 뷰는 아래 훅만 호출(useMutation+invalidate 반복 제거 = 함수 통일).
function useInvalidator(keys: QueryKey[]) {
  const qc = useQueryClient();
  return () => keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}

// 카탈로그
export const useCreateCourse = () => useMutation({ mutationFn: api.courses.create, onSuccess: useInvalidator([qk.courses.all]) });
export const useCreateSubject = () => useMutation({ mutationFn: api.subjects.create, onSuccess: useInvalidator([qk.subjects.all]) });
export const useCreateEvent = () => useMutation({ mutationFn: api.events.create, onSuccess: useInvalidator([qk.events.all]) });
export const useCreateRoadmap = () => useMutation({ mutationFn: api.roadmaps.create, onSuccess: useInvalidator([qk.roadmaps.all]) });

// 명단(학생·수강)
export const useCreateStudent = () => useMutation({ mutationFn: api.students.create, onSuccess: useInvalidator([qk.students.all]) });
export const useRemoveStudent = () => useMutation({ mutationFn: api.students.remove, onSuccess: useInvalidator([qk.students.all, qk.enrollments.all]) });
export const useCreateEnrollment = () => useMutation({ mutationFn: api.enrollments.create, onSuccess: useInvalidator([qk.enrollments.all, qk.students.all]) });

// 결제
export const useCreatePayment = () => useMutation({ mutationFn: api.payments.create, onSuccess: useInvalidator([qk.payments.all]) });
export const useUpdatePayment = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.payments.update>[1] }) => api.payments.update(v.id, v.patch), onSuccess: useInvalidator([qk.payments.all]) });
export const useMarkPaymentPaid = () => useMutation({ mutationFn: api.payments.markPaid, onSuccess: useInvalidator([qk.payments.all, qk.transactions.all]) });

// 지출(승인 워크플로우)
export const useCreateExpense = () => useMutation({ mutationFn: api.expenses.create, onSuccess: useInvalidator([qk.expenses.all]) });
export const useApproveExpense = () => useMutation({ mutationFn: api.expenses.approve, onSuccess: useInvalidator([qk.expenses.all, qk.transactions.all]) });
export const useRejectExpense = () => useMutation({ mutationFn: api.expenses.reject, onSuccess: useInvalidator([qk.expenses.all]) });

// 상담
export const useCreateCounsel = () => useMutation({ mutationFn: api.counsel.create, onSuccess: useInvalidator([qk.counsel.all]) });
export const useUpdateCounsel = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.counsel.update>[1] }) => api.counsel.update(v.id, v.patch), onSuccess: useInvalidator([qk.counsel.all]) });
export const useCreateCounselRound = () =>
  useMutation({ mutationFn: (v: { formId: number; input: Parameters<typeof api.counsel.createRound>[1] }) => api.counsel.createRound(v.formId, v.input), onSuccess: useInvalidator([qk.counsel.all]) });

// 스케줄(생성·수정·삭제) — 삭제/상태변경은 리포트·정산 적격에도 영향 → 폭넓게 무효화
export const useCreateSchedule = () => useMutation({ mutationFn: api.schedule.create, onSuccess: useInvalidator([qk.schedule.all]) });
export const useUpdateSchedule = () =>
  useMutation({ mutationFn: (v: { id: number; body: Parameters<typeof api.schedule.update>[1] }) => api.schedule.update(v.id, v.body), onSuccess: useInvalidator([qk.schedule.all, qk.reports.all, qk.payouts.all]) });
export const useRemoveSchedule = () => useMutation({ mutationFn: api.schedule.remove, onSuccess: useInvalidator([qk.schedule.all, qk.reports.all, qk.payouts.all]) });

// 출결(강사 마킹) — session×student upsert
export const useUpsertAttendance = () => useMutation({ mutationFn: api.attendance.upsert, onSuccess: useInvalidator([qk.attendance.all]) });

// 리포트(작성·제출·승인/반려) — 승인은 시수/정산 적격 변동
export const useCreateReport = () => useMutation({ mutationFn: api.reports.create, onSuccess: useInvalidator([qk.reports.all]) });
export const useSubmitReport = () => useMutation({ mutationFn: api.reports.submit, onSuccess: useInvalidator([qk.reports.all]) });
export const useApproveReport = () =>
  useMutation({ mutationFn: (v: { id: number; approvedBy?: number }) => api.reports.approve(v.id, v.approvedBy), onSuccess: useInvalidator([qk.reports.all, qk.payouts.all]) });
export const useRejectReport = () =>
  useMutation({ mutationFn: (v: { id: number; reason?: string }) => api.reports.reject(v.id, v.reason), onSuccess: useInvalidator([qk.reports.all, qk.payouts.all]) });

// 정산(강사 페이) — 생성/확정/지급/반려/조정
export const useGeneratePayout = () =>
  useMutation({ mutationFn: (v: { instructorId: number; from: string; to: string }) => api.payouts.generate(v.instructorId, v.from, v.to), onSuccess: useInvalidator([qk.payouts.all]) });
export const useConfirmPayout = () => useMutation({ mutationFn: api.payouts.confirm, onSuccess: useInvalidator([qk.payouts.all]) });
export const usePayPayout = () => useMutation({ mutationFn: api.payouts.pay, onSuccess: useInvalidator([qk.payouts.all, qk.transactions.all]) });
export const useRejectPayout = () =>
  useMutation({ mutationFn: (v: { id: number; reason?: string }) => api.payouts.reject(v.id, v.reason), onSuccess: useInvalidator([qk.payouts.all, qk.schedule.all]) });
export const useAdjustPayout = () =>
  useMutation({ mutationFn: (v: { id: number; amount: number; reason?: string }) => api.payouts.adjust(v.id, v.amount, v.reason), onSuccess: useInvalidator([qk.payouts.all]) });
