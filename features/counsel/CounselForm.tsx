'use client';
import { useState } from 'react';
import { useTacoStore } from '@/lib/store';
import type {
  CounselSource,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
} from '@/types';

type Author = 'parent' | 'student' | 'staff';

type FormState = {
  author: Author;
  applicantName: string;
  applicantPhone: string;
  interestSubjectId: string;
  interestCourseId: string;
  desiredStartTime: string;
  learningAtmosphere: string;
  studentIntention: string;
  weakness: string;
  academyExpectation: string;
};

const empty: FormState = {
  author: 'parent', applicantName: '', applicantPhone: '', interestSubjectId: '',
  interestCourseId: '', desiredStartTime: '', learningAtmosphere: '', studentIntention: '',
  weakness: '', academyExpectation: '',
};

// 작성 주체 → source 매핑 (학생/학부모 = 내부폼, 상담실장 = 수기접수)
const sourceOf = (a: Author): CounselSource => (a === 'staff' ? 'manual' : 'internal_form');

export function CounselForm() {
  const addCounselForm = useTacoStore((s) => s.addCounselForm);
  const subjects = useTacoStore((s) => s.subjects);
  const courses = useTacoStore((s) => s.courses);
  const [f, setF] = useState<FormState>(empty);
  const set = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.applicantName.trim()) return;
    addCounselForm({
      applicantName: f.applicantName.trim(),
      applicantPhone: f.applicantPhone.trim() || undefined,
      source: sourceOf(f.author),
      assignedStaffId: f.author === 'staff' ? 1 : undefined,
      interestSubjectId: f.interestSubjectId ? Number(f.interestSubjectId) : undefined,
      interestCourseId: f.interestCourseId ? Number(f.interestCourseId) : undefined,
      desiredStartTime: (f.desiredStartTime || undefined) as DesiredStartTime | undefined,
      learningAtmosphere: (f.learningAtmosphere || undefined) as LearningAtmosphere | undefined,
      studentIntention: (f.studentIntention || undefined) as StudentIntention | undefined,
      weakness: f.weakness.trim() || undefined,
      academyExpectation: f.academyExpectation.trim() || undefined,
    });
    setF({ ...empty, author: f.author });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="작성 주체">
          <select className="input" value={f.author} onChange={(e) => set({ author: e.target.value as Author })}>
            <option value="parent">학부모</option>
            <option value="student">학생</option>
            <option value="staff">상담실장</option>
          </select>
        </Field>
        <Field label="신청자 이름 *"><input className="input" value={f.applicantName} onChange={(e) => set({ applicantName: e.target.value })} placeholder="한서진" /></Field>
        <Field label="연락처"><input className="input" value={f.applicantPhone} onChange={(e) => set({ applicantPhone: e.target.value })} placeholder="010-0000-0000" /></Field>

        <Field label="관심 과목">
          <select className="input" value={f.interestSubjectId} onChange={(e) => set({ interestSubjectId: e.target.value })}>
            <option value="">선택 안 함</option>
            {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </Field>
        <Field label="관심 코스">
          <select className="input" value={f.interestCourseId} onChange={(e) => set({ interestCourseId: e.target.value })}>
            <option value="">선택 안 함</option>
            {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <Field label="희망 시작 시기">
          <select className="input" value={f.desiredStartTime} onChange={(e) => set({ desiredStartTime: e.target.value })}>
            <option value="">선택 안 함</option>
            <option value="immediately">즉시</option>
            <option value="within_1_month">1개월 내</option>
            <option value="within_2_3_months">2~3개월</option>
            <option value="undecided">미정</option>
          </select>
        </Field>
        <Field label="학습 분위기">
          <select className="input" value={f.learningAtmosphere} onChange={(e) => set({ learningAtmosphere: e.target.value })}>
            <option value="">선택 안 함</option>
            <option value="self_directed">자기주도</option>
            <option value="normal">보통</option>
            <option value="needs_management">관리필요</option>
          </select>
        </Field>
        <Field label="학생 의향">
          <select className="input" value={f.studentIntention} onChange={(e) => set({ studentIntention: e.target.value })}>
            <option value="">선택 안 함</option>
            <option value="student_wants">학생 희망</option>
            <option value="parent_only">학부모 주도</option>
            <option value="unknown">미상</option>
          </select>
        </Field>
        <Field label="약점"><input className="input" value={f.weakness} onChange={(e) => set({ weakness: e.target.value })} placeholder="독해 속도 등" /></Field>
      </div>

      <Field label="학원에 바라는 점">
        <textarea className="input h-16 py-2" value={f.academyExpectation} onChange={(e) => set({ academyExpectation: e.target.value })} placeholder="기대하는 점을 적어주세요" />
      </Field>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary">상담 신청</button>
      </div>
    </form>
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
