'use client';
import { Badge, SectionCard, StatusDot, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import type { StudentStatus } from '@/types';
import { StudentForm } from './StudentForm';

const tone: Record<StudentStatus, Tone> = {
  lead: 'neutral', active: 'success', paused: 'attention', completed: 'done', canceled: 'danger',
};
const label: Record<StudentStatus, string> = {
  lead: '신규접수', active: '수강중', paused: '일시정지', completed: '수료', canceled: '취소',
};

export function StudentsView() {
  const students = useTacoStore((s) => s.students);
  const enrollments = useTacoStore((s) => s.enrollments);
  const courses = useTacoStore((s) => s.courses);
  const parentStudents = useTacoStore((s) => s.parentStudents);
  const parents = useTacoStore((s) => s.parents);
  const removeStudent = useTacoStore((s) => s.removeStudent);

  const coursesOf = (studentId: number) =>
    enrollments
      .filter((e) => e.studentId === studentId)
      .map((e) => courses.find((c) => c.id === e.courseId)?.name)
      .filter(Boolean);

  const parentOf = (studentId: number) => {
    const link = parentStudents.find((ps) => ps.studentId === studentId);
    if (!link) return undefined;
    const p = parents.find((x) => x.id === link.parentId);
    return p ? `${p.name} (${link.relation ?? '보호자'})` : undefined;
  };

  return (
    <div className="p-6 max-w-[1180px] mx-auto space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">학생</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">학생 등록 및 목록 · 총 {students.length}명</p>
      </div>

      <SectionCard title="학생 등록">
        <StudentForm />
      </SectionCard>

      <SectionCard title="학생 목록">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학년</th>
                <th>Web ID</th>
                <th>등록 코스</th>
                <th>학부모</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const cs = coursesOf(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[12px] text-fg-subtle">{s.englishName ?? ''}</div>
                    </td>
                    <td className="mono">{s.grade ?? '—'}</td>
                    <td className="mono text-fg-muted">{s.webId ?? <span className="text-fg-subtle">미가입</span>}</td>
                    <td className="text-fg-muted">{cs.length ? cs.join(', ') : '—'}</td>
                    <td className="text-fg-muted">{parentOf(s.id) ?? '—'}</td>
                    <td>
                      <Badge tone={tone[s.status]}>
                        <StatusDot tone={tone[s.status]} label={label[s.status]} />
                      </Badge>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(`${s.name} 학생을 삭제할까요? 출석·피드백·수강등록도 함께 삭제됩니다.`)) {
                            removeStudent(s.id);
                          }
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
