'use client';
// [참조/처리] 경영 지표(수입·지출) 상세 — 대시보드에서 분리(CEO 전용).
//  - store.transactions(입·출금 원장)에서 입금 합/출금 합, store.payments에서 미수금 파생.
//  - 매출 시각화(RevenueCharts) + 입·출금 원장 리스트. 비-CEO 접근 시 안내만.
import Link from 'next/link';
import { StatCard, SectionCard, IconArrowDown, IconArrowUp, IconReceipt } from '@/components/ui';
import { won, shortDate } from '@/lib/format';
import { useTacoStore } from '@/lib/store';
import { isCEO, roleLabel } from '@/lib/roles';
import { RevenueCharts } from './RevenueCharts';

export function InsightsView() {
  const store = useTacoStore();
  const role = store.currentRole;

  if (!isCEO(role)) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <h1 className="text-[20px] font-semibold">경영 지표</h1>
        <p className="text-[13px] text-fg-muted mt-1">경영 지표(수입·지출·매출 추이)는 대표(super_admin)만 열람할 수 있습니다. (현재: {roleLabel[role]})</p>
        <div className="mt-4"><Link href="/" className="btn btn-primary">대시보드로</Link></div>
      </div>
    );
  }

  const inbound = store.transactions.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount, 0);
  const outbound = store.transactions.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount, 0);
  const unpaid = store.payments.filter((p) => p.status === 'pending').reduce((a, p) => a + p.amount, 0);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">경영 지표</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">수입·지출·매출 추이 (대표 전용)</p>
        </div>
        <Link href="/" className="btn btn-sm">← 대시보드</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="이번 달 입금" value={won(inbound)} tone="success" icon={<IconArrowDown />} sub="신규·재수강" />
        <StatCard label="이번 달 출금" value={won(outbound)} tone="attention" icon={<IconArrowUp />} sub="강사 페이 · 지출" />
        <StatCard label="미수금" value={won(unpaid)} tone="danger" icon={<IconReceipt />} sub={`청구 ${store.payments.filter((p) => p.status === 'pending').length}건 대기`} />
      </div>

      <RevenueCharts />

      <SectionCard title="입·출금 원장">
        <ul className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
          {store.transactions.map((t) => {
            const isIn = t.direction === 'in';
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="w-7 h-7 rounded-full grid place-items-center shrink-0"
                  style={{
                    backgroundColor: isIn ? 'var(--color-success-subtle)' : 'var(--color-attention-subtle)',
                    color: isIn ? 'var(--color-success)' : 'var(--color-attention)',
                  }}
                >
                  {isIn ? <IconArrowDown /> : <IconArrowUp />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{t.label}</div>
                  <div className="text-[11px] text-fg-subtle uppercase">{t.method} · {shortDate(t.occurredAt)}</div>
                </div>
                <div className={`mono text-[13px] font-semibold ${isIn ? 'text-success' : 'text-fg'}`}>
                  {isIn ? '+' : '−'}{won(t.amount)}
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
