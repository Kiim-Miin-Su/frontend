'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SectionCard } from '@/components/ui';
import { useCreateExpense } from '@/lib/queries';
import type { ExpenseCategory } from '@/types';
import { CATEGORIES, categoryLabel } from './labels';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ExpenseFormView() {
  const router = useRouter();
  const createExpense = useCreateExpense();

  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(todayStr());
  const [vendor, setVendor] = useState('');
  const [memo, setMemo] = useState('');
  const [receipt, setReceipt] = useState('');

  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setReceipt(String(reader.result));
    reader.readAsDataURL(f); // 데모: data URL (실제 백엔드는 업로드 후 URL 저장)
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount) return;
    createExpense.mutate({
      category,
      title: title.trim(),
      amount: Number(amount),
      spentAt: spentAt || todayStr(),
      vendor: vendor.trim() || undefined,
      memo: memo.trim() || undefined,
      receiptUrl: receipt || undefined,
    }, { onSuccess: () => router.push('/expenses') });
  };

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/expenses" className="text-[12px] text-fg-muted hover:underline">← 지출 목록</Link>
        <h1 className="text-[20px] font-semibold mt-1">지출 등록</h1>
      </div>
      <SectionCard title="지출 정보">
        <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="분류 *">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {CATEGORIES.map((c) => (<option key={c} value={c}>{categoryLabel[c]}</option>))}
            </select>
          </Field>
          <Field label="항목명 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="화이트보드 마커 외" /></Field>
          <Field label="금액(원) *"><input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="86000" /></Field>
          <Field label="지출일 *"><input type="date" className="input" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} /></Field>
          <Field label="거래처"><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="오피스디포" /></Field>
          <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="비고" /></Field>
          <div className="sm:col-span-2">
            <span className="block text-[12px] font-medium text-fg-muted mb-1">영수증 사진</span>
            <input type="file" accept="image/*" className="text-[13px]" onChange={(e) => onFile(e.target.files?.[0])} />
            {receipt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receipt} alt="영수증 미리보기" className="mt-2 max-h-40 rounded border" style={{ borderColor: 'var(--color-line)' }} />
            )}
          </div>
          <div className="sm:col-span-2 flex justify-end pt-1">
            <button type="submit" className="btn btn-primary">지출 요청</button>
          </div>
        </form>
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">지출은 <b>대표(super_admin) 승인</b> 후 출금 원장·대시보드에 반영됩니다. (관리자 &gt; 승인 센터)</p>
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
