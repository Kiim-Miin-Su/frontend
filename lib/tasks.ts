// 역할별 "대기 중인 할 일(To-do)" 단일 소스.
// Topbar 알림 배지 카운트와 대시보드 To-do 섹션이 같은 로직을 공유한다.
import type {
  AccountRole,
  ClassSession,
  CounselForm,
  Course,
  Enrollment,
  Expense,
  Instructor,
  InstructorPayout,
  Payment,
  SessionReport,
  Student,
} from '@/types';
import type { Tone } from '@/components/ui';
import { isAdmin } from '@/lib/roles';
import { pendingReportSessions, pendingReportCount, type ReportSlice } from '@/lib/reports';

// 회계상 분리: pay(강사 페이=출금) / expense(지출=출금) / payment(결제·수납=입금) / counsel(상담) / report·class(강사)
export type TaskGroup = 'pay' | 'expense' | 'payment' | 'counsel' | 'report' | 'class';

export type TaskItem = {
  id: string;
  group: TaskGroup;
  title: string;
  detail?: string;
  href: string;
  tone: Tone;
  /** 빨간 배지(미룰 수 없는 할 일)에 포함할지 — 정보성 항목(다가오는 수업)은 false */
  counts: boolean;
};

// 대시보드/사이드바 데모에서 'instructor' 역할 = 박지훈(강사 id 1)로 매핑.
export const DEMO_INSTRUCTOR_ID = 1;
// 월 정산(재결제) 주기 기준 수업 횟수(데모). 주 2회 × 4주 = 8회.
export const PAYMENT_CYCLE_SESSIONS = 8;

type StoreSlice = ReportSlice & {
  currentRole: AccountRole;
  instructors: Instructor[];
  students: Student[];
  courses: Course[];
  classSessions: ClassSession[];
  sessionReports: SessionReport[];
  expenses: Expense[];
  instructorPayouts: InstructorPayout[];
  counselForms: CounselForm[];
  enrollments: Enrollment[];
  payments: Payment[];
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const won = (n: number) => '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 관리자/매니저: 승인·지급·요청 대기 건 (회계상 그룹 분리)
function adminTasks(s: StoreSlice): TaskItem[] {
  const iname = (id: number) => s.instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`;
  const sname = (id?: number) => s.students.find((x) => x.id === id)?.name ?? '학생';
  const today = todayISO();
  const out: TaskItem[] = [];

  // ── 강사 페이(출금) — 승인 대기(pending) / 지급 대기(confirmed) ──
  for (const p of s.instructorPayouts) {
    if (p.status === 'pending') {
      out.push({
        id: `pay-approve-${p.id}`, group: 'pay', tone: 'attention', counts: true,
        title: `강사 페이 승인 대기 — ${iname(p.instructorId)}`,
        detail: `${p.periodStart}~${p.periodEnd} · ${won(p.amount)}${p.sessionCount ? ` (${p.sessionCount}회)` : ''}`,
        href: '/admin/approvals',
      });
    } else if (p.status === 'confirmed') {
      out.push({
        id: `pay-pay-${p.id}`, group: 'pay', tone: 'accent', counts: true,
        title: `강사 페이 지급 대기 — ${iname(p.instructorId)}`,
        detail: `${p.periodStart}~${p.periodEnd} · ${won(p.amount)} 지급 처리 필요`,
        href: '/payouts',
      });
    }
  }

  // ── 결제·수납(입금) — 미수 건만(청구 pending). 기한 경과면 연체. ──
  for (const pm of s.payments) {
    if (pm.status !== 'pending') continue;
    const overdue = !!pm.dueAt && pm.dueAt < today;
    out.push({
      id: `pay-due-${pm.id}`, group: 'payment', tone: overdue ? 'danger' : 'attention', counts: true,
      title: `미수금 — ${sname(pm.studentId)}`,
      detail: `${won(pm.amount)} · ${overdue ? '연체' : '납부 대기'}${pm.dueAt ? ` (기한 ${pm.dueAt})` : ''}`,
      href: '/payments',
    });
  }

  // ── 상담 — 미배정·날짜 미정 건만(상담실장이 정확한 날짜를 미정으로 둔 경우) ──
  for (const c of s.counselForms) {
    if (c.status !== 'requested') continue;
    const dateUndecided = !c.nextContactAt; // 정확한 상담 날짜 미정
    const unassigned = c.assignedStaffId == null; // 담당 미배정
    if (!dateUndecided && !unassigned) continue;
    out.push({
      id: `counsel-${c.id}`, group: 'counsel', tone: 'accent', counts: true,
      title: `상담 배정 대기 — ${c.applicantName}`,
      detail: `날짜 미정 · 담당/일정 배정 필요`,
      href: '/counsel',
    });
  }

  // ── 지출(출금) — 승인 대기 ──
  for (const e of s.expenses.filter((x) => x.status === 'requested')) {
    out.push({
      id: `expense-${e.id}`, group: 'expense', tone: 'attention', counts: true,
      title: `지출 승인 대기 — ${e.title}`,
      detail: `${won(e.amount)} · ${e.spentAt}`,
      href: '/admin/approvals',
    });
  }

  // ── 수업 보고서 승인 대기(작성완료·미승인) — 승인은 관리자(승인센터) 책임이므로 /admin/approvals로 ──
  for (const r of s.sessionReports.filter((x) => (x.status === 'submitted' || x.approvalStatus === 'submitted') && x.approvalStatus !== 'approved')) {
    out.push({
      id: `report-approve-${r.id}`, group: 'report', tone: 'accent', counts: true,
      title: `수업 보고서 승인 대기 — ${sname(r.studentId)}`,
      detail: `${iname(r.instructorId)} · 승인 시 시수 집계`,
      href: '/admin/approvals',
    });
  }
  return out;
}

// 강사: 리포트 미작성(진행된 내 수업) + 오늘/다가오는 내 수업
function instructorTasks(s: StoreSlice, instructorId: number): TaskItem[] {
  const today = todayISO();
  const out: TaskItem[] = [];

  // 진행됐는데 리포트 미작성 → 시수/페이가 잡히려면 작성 필요. (단일 소스: lib/reports)
  for (const ses of pendingReportSessions(s, instructorId)) {
    out.push({
      id: `report-${ses.id}`, group: 'report', tone: 'danger', counts: true,
      title: `리포트 미작성 — ${ses.topic ?? '수업'}`,
      detail: `${ses.sessionDate} ${ses.startTime ?? ''} · 작성해야 시수가 측정됩니다`,
      href: '/reports/write',
    });
  }

  // 오늘 수업(진행 예정) — 카운트 / 다가오는 수업 — 정보성
  const upcoming = s.classSessions
    .filter((ses) => ses.instructorId === instructorId && ses.status === 'scheduled' && ses.sessionDate >= today)
    .sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? '')));
  for (const ses of upcoming) {
    const isToday = ses.sessionDate === today;
    out.push({
      id: `class-${ses.id}`, group: 'class', tone: isToday ? 'success' : 'neutral', counts: isToday,
      title: `${isToday ? '오늘 수업' : '다가오는 수업'} — ${ses.topic ?? '수업'}`,
      detail: `${ses.sessionDate} ${ses.startTime ?? ''}`,
      href: '/schedule',
    });
  }
  return out;
}

export function buildTasks(s: StoreSlice, role: AccountRole = s.currentRole): { items: TaskItem[]; count: number } {
  let items: TaskItem[] = [];
  if (isAdmin(role)) items = adminTasks(s);
  else if (role === 'instructor') items = instructorTasks(s, DEMO_INSTRUCTOR_ID);
  // 학생/학부모는 운영 할 일 없음(일정은 캘린더에서)
  const count = items.filter((t) => t.counts).length;
  return { items, count };
}

// 사이드바 탭별 빨간 배지 개수 — 탭마다 명시적 기준(권한 반영). 0인 탭은 키 없음.
// 기준(요구사항): 상담=다음 만남 날짜 미정 / 결제=미수 / 강사페이=미정산 / 지출=승인대기 /
//   수업보고서=미작성(작성해야 할 세션당 1) / 관리자=미승인(승인 대기) 모두.
export function navBadges(s: StoreSlice, role: AccountRole = s.currentRole): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (nav: string, n: number) => { if (n > 0) out[nav] = n; };

  // 강사: 본인 수업보고서 미작성만
  if (role === 'instructor') {
    put('/reports', pendingReportCount(s, DEMO_INSTRUCTOR_ID));
    return out;
  }
  if (!isAdmin(role)) return out; // 학생/학부모 등은 알림 없음

  // 관리자/매니저
  put('/counsel', s.counselForms.filter((c) => c.status === 'requested' && !c.nextContactAt).length); // 다음 만남 날짜 미정
  put('/payments', s.payments.filter((p) => p.status === 'pending').length); // 미수(미납)
  put('/payouts', s.instructorPayouts.filter((p) => p.status === 'pending' || p.status === 'confirmed').length); // 미정산(미지급)
  put('/expenses', s.expenses.filter((e) => e.status === 'requested').length); // 승인 대기
  put('/reports', pendingReportCount(s)); // 미작성(전체)

  // 관리자(승인 센터): 미승인 모두 = 보고서 승인대기 + 지출 승인대기 + 강사페이 승인대기 (가입 승인은 백엔드 계정)
  const reportApprove = s.sessionReports.filter((r) => (r.status === 'submitted' || r.approvalStatus === 'submitted') && r.approvalStatus !== 'approved').length;
  const expenseApprove = s.expenses.filter((e) => e.status === 'requested').length;
  const payoutApprove = s.instructorPayouts.filter((p) => p.status === 'pending').length;
  put('/admin', reportApprove + expenseApprove + payoutApprove);

  return out;
}
