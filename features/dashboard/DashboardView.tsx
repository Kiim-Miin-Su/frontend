'use client';
import {
  Badge,
  StatCard,
  SectionCard,
  StatusDot,
  IconArrowDown,
  IconArrowUp,
  IconUsers,
  IconReceipt,
  type Tone,
} from '@/components/ui';
import { won, shortDate } from '@/lib/format';
import { useTacoStore } from '@/lib/store';
import type { EnrollmentStatus } from '@/types';

const statusTone: Record<EnrollmentStatus, Tone> = {
  active: 'success',
  paused: 'attention',
  completed: 'done',
  canceled: 'danger',
};
const statusLabel: Record<EnrollmentStatus, string> = {
  active: '수강중',
  paused: '일시정지',
  completed: '수료',
  canceled: '취소',
};

export function DashboardView() {
  const store = useTacoStore();

  // 스토어(mock)에서 파생
  const inbound = store.transactions.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount, 0);
  const outbound = store.transactions.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount, 0);
  const unpaid = store.payments.filter((p) => p.status === 'pending').reduce((a, p) => a + p.amount, 0);

  const recent = store.enrollments
    .slice()
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))
    .slice(0, 5)
    .map((e) => {
      const student = store.students.find((s) => s.id === e.studentId);
      const course = store.courses.find((c) => c.id === e.courseId);
      return { id: e.id, student, course, status: e.status, amount: course?.price ?? 0, at: e.enrolledAt };
    });

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold">대시보드</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">2026년 6월 · 이번 달 운영 현황</p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
          <span className="dot" style={{ backgroundColor: 'var(--color-success)' }} />
          mock 스토어 연결됨
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="이번 달 입금" value={won(inbound)} tone="success" icon={<IconArrowDown />} sub="신규·재수강" />
        <StatCard label="이번 달 출금" value={won(outbound)} tone="attention" icon={<IconArrowUp />} sub="강사 페이 · 지출" />
        <StatCard label="수강 등록" value={`${store.enrollments.length}건`} tone="accent" icon={<IconUsers />} sub={`학생 ${store.students.length}명`} />
        <StatCard label="미수금" value={won(unpaid)} tone="danger" icon={<IconReceipt />} sub={`청구 ${store.payments.filter((p) => p.status === 'pending').length}건 대기`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionCard title="최근 수강 등록" action={<a href="/students" className="btn btn-sm">학생 관리</a>}>
            <table className="table">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>코스</th>
                  <th>상태</th>
                  <th className="text-right">금액</th>
                  <th className="text-right">등록일</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium">{e.student?.name ?? '—'}</div>
                      <div className="text-[12px] text-fg-subtle">{e.student?.englishName}</div>
                    </td>
                    <td className="text-fg-muted">{e.course?.name ?? '—'}</td>
                    <td>
                      <Badge tone={statusTone[e.status]}>
                        <StatusDot tone={statusTone[e.status]} label={statusLabel[e.status]} />
                      </Badge>
                    </td>
                    <td className="text-right mono">{won(e.amount)}</td>
                    <td className="text-right text-fg-muted mono">{shortDate(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="입·출금 원장" action={<span className="badge badge-neutral">오늘</span>}>
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
      </div>
    </div>
  );
}
