'use client';
import { useState } from 'react';
import { useTacoStore } from '@/lib/store';

type FormState = {
  name: string;
  englishName: string;
  grade: string;
  phone: string;
  webId: string;
  courseId: string;
  parentName: string;
  parentPhone: string;
  parentWebId: string;
  relation: string;
};

const empty: FormState = {
  name: '', englishName: '', grade: '', phone: '', webId: '', courseId: '',
  parentName: '', parentPhone: '', parentWebId: '', relation: '모',
};

export function StudentForm() {
  const addStudent = useTacoStore((s) => s.addStudent);
  const courses = useTacoStore((s) => s.courses);
  const [f, setF] = useState<FormState>(empty);
  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    addStudent({
      name: f.name.trim(),
      englishName: f.englishName.trim() || undefined,
      grade: f.grade ? Number(f.grade) : undefined,
      phone: f.phone.trim() || undefined,
      webId: f.webId.trim() || undefined,
      courseId: f.courseId ? Number(f.courseId) : undefined,
      parent: f.parentName.trim()
        ? {
            name: f.parentName.trim(),
            phone: f.parentPhone.trim() || undefined,
            webId: f.parentWebId.trim() || undefined,
            relation: f.relation,
          }
        : undefined,
    });
    setF(empty);
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      {/* 학생 */}
      <Group title="학생 정보">
        <Field label="이름 *"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="김서연" /></Field>
        <Field label="영문명"><input className="input" value={f.englishName} onChange={(e) => set({ englishName: e.target.value })} placeholder="Sophia" /></Field>
        <Field label="학년"><input className="input" type="number" min={1} max={12} value={f.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="11" /></Field>
        <Field label="연락처"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="010-0000-0000" /></Field>
        <Field label="학생 Web ID (선택)"><input className="input" value={f.webId} onChange={(e) => set({ webId: e.target.value })} placeholder="로그인 계정 / 미가입 시 비움" /></Field>
        <Field label="등록 코스 (선택)">
          <select className="input" value={f.courseId} onChange={(e) => set({ courseId: e.target.value })}>
            <option value="">— 미등록 —</option>
            {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
      </Group>

      {/* 학부모 (선택) */}
      <Group title="학부모 (선택 — 결제·연락 주체)">
        <Field label="학부모 이름"><input className="input" value={f.parentName} onChange={(e) => set({ parentName: e.target.value })} placeholder="김미경" /></Field>
        <Field label="관계">
          <select className="input" value={f.relation} onChange={(e) => set({ relation: e.target.value })}>
            <option value="모">모</option>
            <option value="부">부</option>
            <option value="보호자">보호자</option>
          </select>
        </Field>
        <Field label="학부모 연락처"><input className="input" value={f.parentPhone} onChange={(e) => set({ parentPhone: e.target.value })} placeholder="010-0000-0000" /></Field>
        <Field label="학부모 Web ID (선택)"><input className="input" value={f.parentWebId} onChange={(e) => set({ parentWebId: e.target.value })} placeholder="로그인 계정 / 미가입 시 비움" /></Field>
      </Group>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary">학생 등록</button>
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-fg-muted mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
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
