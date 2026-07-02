'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard } from '@/components/ui';
import { usePayments, useStudents, useEnrollments, useCourses, useUpdatePayment, useMarkPaymentPaid } from '@/lib/queries';
import type { PaymentMethod, PaymentStatus } from '@/types';
import { won } from '@/lib/format';
import { statusLabel, statusTone, methodLabel, METHODS, STATUSES } from './labels';

export function PaymentDetailView({ paymentId }: { paymentId: number }) {
  const { data: payments = [] } = usePayments();
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const updatePayment = useUpdatePayment();
  const markPaid = useMarkPaymentPaid();
  const payment = payments.find((p) => p.id === paymentId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ amount: '', paymentMethod: '', dueAt: '', status: '' as string });

  if (!payment) {
    return (
      <div className="p-6 max-w-[720px] mx-auto">
        <Link href="/payments" className="text-[12px] text-fg-muted hover:underline">← 결제 목록</Link>
        <div className="mt-3 text-fg-muted">결제를 찾을 수 없습니다. (id: {paymentId})</div>
      </div>
    );
  }

  const student = students.find((s) => s.id === payment.studentId);
  const enrollment = payment.enrollmentId ? enrollments.find((e) => e.id === payment.enrollmentId) : undefined;
  const course = enrollment ? courses.find((c) => c.id === enrollment.courseId) : undefined;

  const startEdit = () => {
    setDraft({
      amount: String(payment.amount),
      paymentMethod: payment.paymentMethod ?? '',
      dueAt: payment.dueAt ?? '',
      status: payment.status,
    });
    setEditing(true);
  };
  const save = () => {
    // 백엔드 UpdatePaymentInput은 status 미포함(상태 전이는 별도 엔드포인트) → 금액·수단·기한만 patch.
    updatePayment.mutate({
      id: payment.id,
      patch: {
        amount: Number(draft.amount) || payment.amount,
        paymentMethod: (draft.paymentMethod || undefined) as PaymentMethod | undefined,
        dueAt: draft.dueAt || undefined,
      },
    });
    // 상태를 '수납완료'로 바꿨다면 전용 수납 처리(markPaid)로 원장 반영.
    if ((draft.status as PaymentStatus) === 'paid' && payment.status !== 'paid') {
      markPaid.mutate(payment.id);
    }
    setEditing(false);
  };

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/payments" className="text-[12px] text-fg-muted hover:underline">← 결제 목록</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-[20px] font-semibold">{student?.name ?? '결제'} · {won(payment.amount)}</h1>
          <Badge tone={statusTone[payment.status]}>{statusLabel[payment.status]}</Badge>
        </div>
      </div>

      <SectionCard
        title="결제 상세"
        action={
          editing ? (
            <div className="flex gap-1.5">
              <button className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
              <button className="btn btn-sm btn-primary" onClick={save}>저장</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button className="btn btn-sm" onClick={startEdit}>수정</button>
              {payment.status === 'pending' && (
                <button className="btn btn-sm btn-primary" onClick={() => markPaid.mutate(payment.id)}>수납 처리</button>
              )}
            </div>
          )
        }
      >
        {editing ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="청구 금액(원)">
              <input className="input" type="number" min={0} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </Field>
            <Field label="결제 수단">
              <select className="input" value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>
                <option value="">선택 안 함</option>
                {METHODS.map((m) => (<option key={m} value={m}>{methodLabel[m]}</option>))}
              </select>
            </Field>
            <Field label="납부 기한">
              <input type="date" className="input" value={draft.dueAt} onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })} />
            </Field>
            <Field label="상태">
              <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                {STATUSES.map((s) => (<option key={s} value={s}>{statusLabel[s]}</option>))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
            {([
              ['학생', student?.name ?? '—'],
              ['코스', course?.name ?? '— (직접 청구)'],
              ['청구 금액', won(payment.amount)],
              ['수납액', won(payment.paidAmount ?? 0)],
              ['결제 수단', payment.paymentMethod ? methodLabel[payment.paymentMethod] : '—'],
              ['납부 기한', payment.dueAt ?? '—'],
              ['수납일', payment.paidAt ?? '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex px-4 py-3 text-[13px]">
                <span className="w-32 text-fg-muted">{k}</span>
                <span className={k.includes('금액') || k.includes('수납액') ? 'mono font-medium' : ''}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">수납 처리하면 입·출금 원장과 대시보드 입금/미수금에 반영됩니다.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
