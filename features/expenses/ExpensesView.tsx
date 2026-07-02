'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard, MonthCalendar } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { useExpenses } from '@/lib/queries';
import { won } from '@/lib/format';
import { categoryLabel, categoryTone, approvalLabel, approvalTone } from './labels';
import { ReasonModal } from '@/components/ReasonModal';

export function ExpensesView() {
  // 지출 목록은 TanStack Query에서 가져오고, 반려 사유는 클라이언트 전용 store에 유지.
  const { data: expenses = [] } = useExpenses();
  const rejectReasons = useTacoStore((s) => s.expenseRejectReasons);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [viewReason, setViewReason] = useState<number | null>(null);

  const total = expenses.reduce((a, e) => a + e.amount, 0);

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">지출 · 비품</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">총 지출 {won(total)} · {expenses.length}건</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-line)' }}>
            <button className={`btn btn-sm rounded-none border-0 ${view === 'list' ? 'badge-accent' : ''}`} onClick={() => setView('list')}>리스트</button>
            <button className={`btn btn-sm rounded-none border-0 ${view === 'calendar' ? 'badge-accent' : ''}`} onClick={() => setView('calendar')}>캘린더</button>
          </div>
          <Link href="/expenses/new" className="btn btn-primary btn-sm">지출 등록</Link>
        </div>
      </div>

      {view === 'list' ? (
        <SectionCard title="지출 목록">
          <table className="table">
            <thead>
              <tr>
                <th>항목</th>
                <th>분류</th>
                <th>거래처</th>
                <th className="text-right">금액</th>
                <th>승인</th>
                <th className="text-right">지출일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td><Badge tone={categoryTone[e.category]}>{categoryLabel[e.category]}</Badge></td>
                  <td className="text-fg-muted">{e.vendor ?? '—'}</td>
                  <td className="text-right mono">{won(e.amount)}</td>
                  <td>
                    <Badge tone={approvalTone[e.status]}>{approvalLabel[e.status]}</Badge>
                    {e.status === 'rejected' && (
                      <button className="block text-[11px] text-danger mt-0.5 hover:underline" onClick={() => setViewReason(e.id)}>반려 사유 보기</button>
                    )}
                  </td>
                  <td className="text-right mono text-fg-muted">{e.spentAt}</td>
                  <td className="text-right"><Link href={`/expenses/${e.id}`} className="btn btn-sm">상세</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      ) : (
        <MonthCalendar
          titlePrefix="지출 · "
          renderDay={(dateStr) =>
            expenses
              .filter((e) => e.spentAt === dateStr)
              .map((e) => (
                <div
                  key={e.id}
                  className="rounded px-1.5 py-1 text-[11px] font-medium truncate"
                  style={{ backgroundColor: 'var(--color-attention-subtle)', color: 'var(--color-attention)' }}
                  title={`${e.title} · ${won(e.amount)}`}
                >
                  {categoryLabel[e.category]} {won(e.amount)}
                </div>
              ))
          }
        />
      )}

      {viewReason != null && (
        <ReasonModal mode="view" title="지출 반려 사유" initial={rejectReasons[viewReason] ?? ''} onClose={() => setViewReason(null)} />
      )}
    </div>
  );
}
