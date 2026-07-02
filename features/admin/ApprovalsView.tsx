'use client';
import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import {
  useInstructors,
  useExpenses,
  usePayouts,
  useReports,
  useStudents,
  useSchedule,
  useCourses,
  useApproveReport,
  useRejectReport,
  useApproveExpense,
  useRejectExpense,
  useConfirmPayout,
} from '@/lib/queries';
import { won } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import { AdminHeader } from './AdminShell';
import { categoryLabel } from '@/features/expenses/labels';
import { api, type PendingAccount } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ReasonModal } from '@/components/ReasonModal';
import type { AccountRole } from '@/types';

const ROLE_OPTS: AccountRole[] = ['instructor', 'manager', 'admin', 'super_admin'];

// 가입 승인 대기(백엔드 계정) — 이메일 인증 완료 후 대표가 승인하면 로그인 가능.
function MemberApprovals() {
  const [rows, setRows] = useState<PendingAccount[]>([]);
  const [roleSel, setRoleSel] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try { setRows(await api.auth.pending(token)); } catch { setMsg('목록을 불러오지 못했습니다. (대표 권한 필요)'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: number, action: 'approve' | 'reject') {
    const token = getToken();
    if (!token) return;
    try {
      if (action === 'approve') await api.auth.approve(token, id, roleSel[id]);
      else await api.auth.reject(token, id);
      setMsg(action === 'approve' ? '승인했습니다.' : '반려했습니다.');
      await load();
    } catch { setMsg('처리 실패'); }
  }

  return (
    <SectionCard title={`가입 승인 대기 (${rows.length})`}>
      {msg && <div className="px-4 pt-3 text-[12px] text-accent">{msg}</div>}
      {rows.length === 0 ? (
        <div className="p-4 text-[13px] text-fg-subtle">승인 대기 중인 가입 신청이 없습니다.</div>
      ) : (
        <table className="table">
          <thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>이메일 인증</th><th>역할 지정</th><th className="text-right"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.webId}</td>
                <td>{r.name}</td>
                <td className="text-fg-muted">{r.email}</td>
                <td>{r.emailVerified ? <span className="text-success">완료</span> : <span className="text-fg-subtle">미완료</span>}</td>
                <td>
                  <select className="input h-8 w-28" value={roleSel[r.id] ?? r.role}
                    onChange={(e) => setRoleSel((s) => ({ ...s, [r.id]: e.target.value }))}>
                    {ROLE_OPTS.map((ro) => <option key={ro} value={ro}>{roleLabel[ro]}</option>)}
                  </select>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-sm btn-primary mr-1.5" disabled={!r.emailVerified} onClick={() => decide(r.id, 'approve')} title={r.emailVerified ? '' : '이메일 인증 후 승인 가능'}>승인</button>
                  <button className="btn btn-sm btn-danger" onClick={() => decide(r.id, 'reject')}>반려</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

// 승인은 대표(super_admin) 전용
export function ApprovalsView() {
  const currentRole = useTacoStore((s) => s.currentRole);
  const { data: instructors = [] } = useInstructors();
  const { data: expenses = [] } = useExpenses();
  const { data: instructorPayouts = [] } = usePayouts();
  const { data: sessionReports = [] } = useReports();
  const { data: students = [] } = useStudents();
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const confirmPayout = useConfirmPayout();
  const isSuper = currentRole === 'super_admin';
  const instructorName = (id: number) => instructors.find((i) => i.id === id)?.name ?? '—';

  const [expenseReject, setExpenseReject] = useState<number | null>(null);
  const pendingExpenses = expenses.filter((e) => e.status === 'requested');
  const pendingPayouts = instructorPayouts.filter((p) => p.status === 'pending');
  // 작성완료(submitted)·미승인 리포트 — 승인 시 시수 적격으로 편입
  const pendingReports = sessionReports.filter((r) => (r.status === 'submitted' || r.approvalStatus === 'submitted') && r.approvalStatus !== 'approved');
  const studentName = (id: number) => students.find((s) => s.id === id)?.name ?? '—';
  const sessionInfo = (sid: number) => {
    const s = classSessions.find((x) => x.id === sid);
    if (!s) return '';
    const c = courses.find((x) => x.id === s.courseId)?.name ?? '수업';
    return `${c} · ${s.sessionDate} ${s.startTime ?? ''}`;
  };

  if (!isSuper) {
    return (
      <div className="p-6 max-w-[1100px] mx-auto space-y-6">
        <AdminHeader />
        <div className="card card-pad text-[14px] text-fg-muted">
          🔒 승인 센터는 <b>대표(CEO)</b> 전용입니다. 현재 역할: {roleLabel[currentRole]} — 우측 상단에서 대표로 전환하세요.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <AdminHeader />

      <MemberApprovals />

      <SectionCard title={`수업 보고서 승인 대기 (${pendingReports.length})`}>
        {pendingReports.length === 0 ? (
          <div className="p-4 text-[13px] text-fg-subtle">승인 대기 중인 보고서가 없습니다. <span className="text-fg-subtle">승인 시 해당 수업이 시수로 집계됩니다.</span></div>
        ) : (
          <table className="table">
            <thead><tr><th>강사</th><th>학생</th><th>수업</th><th>내용</th><th className="text-right"></th></tr></thead>
            <tbody>
              {pendingReports.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{instructorName(r.instructorId)}</td>
                  <td>{studentName(r.studentId)}</td>
                  <td className="text-fg-muted">{sessionInfo(r.sessionId)}</td>
                  <td className="text-fg-muted max-w-[280px] truncate" title={r.content}>{r.content || '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={() => approveReport.mutate({ id: r.id })}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={() => rejectReport.mutate({ id: r.id })}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title={`지출 승인 대기 (${pendingExpenses.length})`}>
        {pendingExpenses.length === 0 ? (
          <div className="p-4 text-[13px] text-fg-subtle">대기 중인 지출이 없습니다.</div>
        ) : (
          <table className="table">
            <thead><tr><th>항목</th><th>분류</th><th className="text-right">금액</th><th>지출일</th><th></th></tr></thead>
            <tbody>
              {pendingExpenses.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td className="text-fg-muted">{categoryLabel[e.category]}</td>
                  <td className="text-right mono">{won(e.amount)}</td>
                  <td className="mono text-fg-muted">{e.spentAt}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={() => approveExpense.mutate(e.id)}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setExpenseReject(e.id)}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title={`강사 페이 승인 대기 (${pendingPayouts.length})`}>
        {pendingPayouts.length === 0 ? (
          <div className="p-4 text-[13px] text-fg-subtle">대기 중인 정산이 없습니다.</div>
        ) : (
          <table className="table">
            <thead><tr><th>강사</th><th>기간</th><th className="text-right">금액</th><th></th></tr></thead>
            <tbody>
              {pendingPayouts.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{instructorName(p.instructorId)}</td>
                  <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                  <td className="text-right mono">{won(p.amount)} <span className="text-fg-subtle">({p.sessionCount ?? 0}회)</span></td>
                  <td className="text-right">
                    <button className="btn btn-sm btn-primary" onClick={() => confirmPayout.mutate(p.id)}>승인</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">승인 시 지출은 즉시 출금 반영, 강사 페이는 승인 후 강사페이 탭에서 지급 처리합니다.</p>

      {expenseReject != null && (
        <ReasonModal
          mode="input"
          title="지출 반려"
          onClose={() => setExpenseReject(null)}
          onSubmit={() => { rejectExpense.mutate(expenseReject); setExpenseReject(null); }}
        />
      )}
    </div>
  );
}
