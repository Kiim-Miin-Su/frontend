'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { useExpenses, useApproveExpense, useRejectExpense } from '@/lib/queries';
import { isAdmin } from '@/lib/roles';
import { won } from '@/lib/format';
import { ReasonModal } from '@/components/ReasonModal';
import { categoryLabel, categoryTone, approvalLabel, approvalTone } from './labels';

export function ExpenseDetailView({ expenseId }: { expenseId: number }) {
  const { data: expenses = [] } = useExpenses();
  const expense = expenses.find((e) => e.id === expenseId);
  const admin = isAdmin(useTacoStore((s) => s.currentRole));
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const rejectReasons = useTacoStore((s) => s.expenseRejectReasons);
  const setExpenseRejectReason = useTacoStore((s) => s.setExpenseRejectReason);
  const [modal, setModal] = useState<'reject' | 'viewReason' | null>(null);

  if (!expense) {
    return (
      <div className="p-6 max-w-[720px] mx-auto">
        <Link href="/expenses" className="text-[12px] text-fg-muted hover:underline">← 지출 목록</Link>
        <div className="mt-3 text-fg-muted">지출을 찾을 수 없습니다. (id: {expenseId})</div>
      </div>
    );
  }

  const rows: [string, string][] = [
    ['항목', expense.title],
    ['금액', won(expense.amount)],
    ['거래처', expense.vendor ?? '—'],
    ['지출일', expense.spentAt],
    ['메모', expense.memo ?? '—'],
  ];

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/expenses" className="text-[12px] text-fg-muted hover:underline">← 지출 목록</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-[20px] font-semibold">{expense.title}</h1>
          <Badge tone={categoryTone[expense.category]}>{categoryLabel[expense.category]}</Badge>
          <Badge tone={approvalTone[expense.status]}>{approvalLabel[expense.status]}</Badge>
        </div>
      </div>

      {/* 관리자: 그 자리에서 승인/반려 (관리자 탭은 몰아보기용) */}
      {admin && expense.status === 'requested' && (
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => approveExpense.mutate(expense.id)}>승인</button>
          <button className="btn btn-danger" onClick={() => setModal('reject')}>반려</button>
        </div>
      )}
      {expense.status === 'rejected' && (
        <button className="text-[13px] text-danger hover:underline" onClick={() => setModal('viewReason')}>반려 사유 보기</button>
      )}

      <SectionCard title="지출 상세">
        <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex px-4 py-3 text-[13px]">
              <span className="w-32 text-fg-muted">{k}</span>
              <span className={k === '금액' ? 'mono font-medium' : ''}>{v}</span>
            </div>
          ))}
        </div>
        {expense.receiptUrl && (
          <div className="p-4 border-t" style={{ borderColor: 'var(--color-line)' }}>
            <div className="text-[12px] text-fg-muted mb-2">영수증</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={expense.receiptUrl} alt="영수증" className="max-h-72 rounded border" style={{ borderColor: 'var(--color-line)' }} />
          </div>
        )}
      </SectionCard>

      {modal === 'reject' && (
        <ReasonModal mode="input" title="지출 반려" onClose={() => setModal(null)}
          onSubmit={(reason) => { rejectExpense.mutate(expense.id); setExpenseRejectReason(expense.id, reason); setModal(null); }} />
      )}
      {modal === 'viewReason' && (
        <ReasonModal mode="view" title="지출 반려 사유" initial={rejectReasons[expense.id] ?? ''} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
