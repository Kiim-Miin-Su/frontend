'use client';
import { useState } from 'react';
import { SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { won } from '@/lib/format';
import { AdminGuard, AdminHeader, Field } from './AdminShell';

export function CoursesView() {
  const subjects = useTacoStore((s) => s.subjects);
  const courses = useTacoStore((s) => s.courses);
  const instructors = useTacoStore((s) => s.instructors);
  const subjectName = (id: number) => subjects.find((x) => x.id === id)?.name ?? '—';
  const instructorName = (id: number) => instructors.find((x) => x.id === id)?.name ?? '—';

  return (
    <AdminGuard>
      <div className="p-6 max-w-[1100px] mx-auto space-y-6">
        <AdminHeader />
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title="코스 추가"><CourseForm /></SectionCard>
          <SectionCard title="과목 추가"><SubjectForm /></SectionCard>
        </div>
        <SectionCard title="코스 목록">
          <table className="table">
            <thead><tr><th>코스</th><th>과목</th><th>강사</th><th className="text-right">정가</th></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-fg-muted">{subjectName(c.subjectId)}</td>
                  <td className="text-fg-muted">{instructorName(c.instructorId)}</td>
                  <td className="text-right mono">{won(c.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </AdminGuard>
  );
}

function CourseForm() {
  const subjects = useTacoStore((s) => s.subjects);
  const instructors = useTacoStore((s) => s.instructors);
  const addCourse = useTacoStore((s) => s.addCourse);
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [price, setPrice] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subjectId || !instructorId) return;
    addCourse({
      name: name.trim(), subjectId: Number(subjectId), instructorId: Number(instructorId),
      price: Number(price) || 0, hourlyRate: Number(hourlyRate) || 0,
    });
    setName(''); setSubjectId(''); setInstructorId(''); setPrice(''); setHourlyRate('');
  };

  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="코스명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SAT Reading 정규" /></Field>
      <Field label="정가(원)"><input className="input" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="480000" /></Field>
      <Field label="강사 시급(원/시간)"><input className="input" type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="50000" /></Field>
      <Field label="과목 *">
        <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">선택</option>
          {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </Field>
      <Field label="담당 강사 *">
        <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          <option value="">선택</option>
          {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
        </select>
      </Field>
      <div className="sm:col-span-2 flex justify-end"><button type="submit" className="btn btn-primary">코스 추가</button></div>
    </form>
  );
}

function SubjectForm() {
  const addSubject = useTacoStore((s) => s.addSubject);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    addSubject({ code: code.trim(), name: name.trim() });
    setCode(''); setName('');
  };
  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="코드 *"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="science" /></Field>
      <Field label="과목명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="과학" /></Field>
      <div className="sm:col-span-2 flex justify-end"><button type="submit" className="btn btn-primary">과목 추가</button></div>
    </form>
  );
}
