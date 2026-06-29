'use client';
import { useState } from 'react';
import { useTacoStore } from '@/lib/store';
import { api } from '@/lib/api';

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

type VerifyState = { state: 'idle' | 'checking' | 'valid' | 'invalid'; name?: string };

const empty: FormState = {
  name: '', englishName: '', grade: '', phone: '', webId: '', courseId: '',
  parentName: '', parentPhone: '', parentWebId: '', relation: '모',
};

export function StudentForm() {
  const addStudent = useTacoStore((s) => s.addStudent);
  const courses = useTacoStore((s) => s.courses);
  const [f, setF] = useState<FormState>(empty);
  const [studentWeb, setStudentWeb] = useState<VerifyState>({ state: 'idle' });
  const [parentWeb, setParentWeb] = useState<VerifyState>({ state: 'idle' });
  const set = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));

  const verify = async (webId: string, setV: (v: VerifyState) => void) => {
    if (!webId.trim()) return;
    setV({ state: 'checking' });
    try {
      const r = await api.users.exists(webId.trim());
      setV(r.exists ? { state: 'valid', name: r.name } : { state: 'invalid' });
    } catch {
      setV({ state: 'invalid' });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    // web id를 입력했다면 반드시 "확인"으로 검증된 것만 허용
    if (f.webId.trim() && studentWeb.state !== 'valid') {
      alert('학생 Web ID를 확인해 주세요.');
      return;
    }
    if (f.parentName.trim() && f.parentWebId.trim() && parentWeb.state !== 'valid') {
      alert('학부모 Web ID를 확인해 주세요.');
      return;
    }
    addStudent({
      student: {
        name: f.name.trim(),
        englishName: f.englishName.trim() || undefined,
        grade: f.grade ? Number(f.grade) : undefined,
        phone: f.phone.trim() || undefined,
        webId: f.webId.trim() || undefined,
      },
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
    setStudentWeb({ state: 'idle' });
    setParentWeb({ state: 'idle' });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      <Group title="학생 정보">
        <Field label="이름 *"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="김서연" /></Field>
        <Field label="영문명"><input className="input" value={f.englishName} onChange={(e) => set({ englishName: e.target.value })} placeholder="Sophia" /></Field>
        <Field label="학년"><input className="input" type="number" min={1} max={12} value={f.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="11" /></Field>
        <Field label="연락처"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="010-0000-0000" /></Field>
        <WebIdField
          label="학생 Web ID (선택)"
          value={f.webId}
          status={studentWeb}
          onChange={(v) => { set({ webId: v }); setStudentWeb({ state: 'idle' }); }}
          onVerify={() => verify(f.webId, setStudentWeb)}
        />
        <Field label="등록 코스 (선택)">
          <select className="input" value={f.courseId} onChange={(e) => set({ courseId: e.target.value })}>
            <option value="">— 미등록 —</option>
            {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
      </Group>

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
        <WebIdField
          label="학부모 Web ID (선택)"
          value={f.parentWebId}
          status={parentWeb}
          onChange={(v) => { set({ parentWebId: v }); setParentWeb({ state: 'idle' }); }}
          onVerify={() => verify(f.parentWebId, setParentWeb)}
        />
      </Group>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary">학생 등록</button>
      </div>
    </form>
  );
}

function WebIdField({
  label, value, status, onChange, onVerify,
}: {
  label: string;
  value: string;
  status: VerifyState;
  onChange: (v: string) => void;
  onVerify: () => void;
}) {
  return (
    <div className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      <div className="flex gap-2">
        <input className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="로그인 계정 / 미가입 시 비움" />
        <button
          type="button"
          className="btn btn-sm shrink-0"
          disabled={!value.trim() || status.state === 'checking'}
          onClick={onVerify}
        >
          {status.state === 'checking' ? '확인 중…' : '확인'}
        </button>
      </div>
      {status.state === 'valid' && <span className="text-[12px] text-success mt-1 inline-block">✓ {status.name} 확인됨</span>}
      {status.state === 'invalid' && <span className="text-[12px] text-danger mt-1 inline-block">존재하지 않는 ID</span>}
    </div>
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
