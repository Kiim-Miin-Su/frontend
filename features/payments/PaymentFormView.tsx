'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SectionCard } from '@/components/ui';
import { useStudents, useCourses, useEnrollments, useCreatePayment } from '@/lib/queries';
import type { PaymentMethod } from '@/types';
import { won } from '@/lib/format';
import { METHODS, methodLabel } from './labels';

export function PaymentFormView() {
  const router = useRouter();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { data: enrollments = [] } = useEnrollments();
  const createPayment = useCreatePayment();

  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [dueAt, setDueAt] = useState('');

  const pickCourse = (id: string) => {
    setCourseId(id);
    const c = courses.find((x) => x.id === Number(id));
    if (c) setAmount(String(c.price)); // 기본 금액 = 코스 정가
  };

  const enrollment = enrollments.find(
    (e) => e.studentId === Number(studentId) && e.courseId === Number(courseId),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !amount) return;
    createPayment.mutate({
      studentId: Number(studentId),
      enrollmentId: enrollment?.id,
      amount: Number(amount),
      paymentMethod: (method || undefined) as PaymentMethod | undefined,
      dueAt: dueAt || undefined,
    }, { onSuccess: () => router.push('/payments') });
  };

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/payments" className="text-[12px] text-fg-muted hover:underline">← 결제 목록</Link>
        <h1 className="text-[20px] font-semibold mt-1">신규 청구</h1>
      </div>
      <SectionCard title="청구 정보">
        <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="학생 *">
            <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">선택</option>
              {students.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="코스">
            <select className="input" value={courseId} onChange={(e) => pickCourse(e.target.value)}>
              <option value="">선택</option>
              {courses.map((c) => (<option key={c.id} value={c.id}>{c.name} ({won(c.price)})</option>))}
            </select>
          </Field>
          <Field label="금액(원) *">
            <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="480000" />
          </Field>
          <Field label="결제 수단">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">선택</option>
              {METHODS.map((m) => (<option key={m} value={m}>{methodLabel[m]}</option>))}
            </select>
          </Field>
          <Field label="납부 기한">
            <input type="date" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between pt-1">
            <span className="text-[12px] text-fg-subtle">
              {studentId && courseId ? (enrollment ? '수강 등록 연결됨' : '연결된 수강 등록 없음(청구만 생성)') : ''}
            </span>
            <button type="submit" className="btn btn-primary">청구 생성</button>
          </div>
        </form>
      </SectionCard>
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
