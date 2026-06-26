'use client';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import type { AttendanceStatus, ReportStatus } from '@/types';
import { shortDate } from '@/lib/format';

const ATT: { value: AttendanceStatus; label: string; tone: Tone }[] = [
  { value: 'present', label: '출석', tone: 'success' },
  { value: 'late', label: '지각', tone: 'attention' },
  { value: 'absent', label: '결석', tone: 'danger' },
  { value: 'excused', label: '인정결석', tone: 'done' },
];
const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };

export function ClassSessionDetailView({ sessionId }: { sessionId: number }) {
  const store = useTacoStore();
  const session = store.classSessions.find((s) => s.id === sessionId);

  if (!session) {
    return <div className="p-6 text-fg-muted">수업을 찾을 수 없습니다. (id: {sessionId})</div>;
  }

  const course = store.courses.find((c) => c.id === session.courseId);
  const instructor = store.instructors.find((i) => i.id === session.instructorId);

  // 이 수업(코스)의 수강생 = enrollments에서 courseId 일치
  const roster = store.enrollments
    .filter((e) => e.courseId === session.courseId)
    .map((e) => store.students.find((s) => s.id === e.studentId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="p-6 max-w-[920px] mx-auto space-y-6">
      <div>
        <a href="/sessions" className="text-[12px] text-fg-muted hover:underline">← 수업 목록</a>
        <h1 className="text-[20px] font-semibold mt-1">{course?.name ?? '수업'} · {shortDate(session.sessionDate)}</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          강사 {instructor?.name ?? '—'} · {session.durationMinutes}분 · {session.topic ?? '주제 미정'}
        </p>
      </div>

      <SectionCard title={`학생 출석 · 피드백 (${roster.length}명)`}>
        <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
          {roster.map((student) => {
            const att = store.attendance.find(
              (a) => a.sessionId === sessionId && a.studentId === student.id,
            );
            const report = store.sessionReports.find(
              (r) => r.sessionId === sessionId && r.studentId === student.id,
            );
            return (
              <div key={student.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium">{student.name}</span>
                    <span className="text-[12px] text-fg-subtle ml-2">{student.englishName}</span>
                  </div>
                  {report && <Badge tone={reportTone[report.status]}>{reportLabel[report.status]}</Badge>}
                </div>

                {/* 출석 체크 */}
                <div className="flex gap-2 mb-3">
                  {ATT.map((opt) => {
                    const active = att?.status === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => store.setAttendance(sessionId, student.id, opt.value)}
                        className={`btn btn-sm ${active ? `badge-${opt.tone}` : ''}`}
                        style={active ? { borderColor: 'transparent', fontWeight: 600 } : undefined}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* 학부모용 피드백 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <span className="block text-[12px] font-medium text-fg-muted mb-1">학부모 피드백</span>
                    <textarea
                      className="input h-20 py-2 leading-relaxed"
                      placeholder="오늘 수업 내용·태도·성취를 적어주세요 (카카오로 발송 예정)"
                      value={report?.content ?? ''}
                      onChange={(e) =>
                        store.upsertReport(sessionId, student.id, session.instructorId, { content: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <span className="block text-[12px] font-medium text-fg-muted mb-1">숙제</span>
                    <textarea
                      className="input h-20 py-2 leading-relaxed"
                      placeholder="다음 수업 전까지"
                      value={report?.homework ?? ''}
                      onChange={(e) =>
                        store.upsertReport(sessionId, student.id, session.instructorId, { homework: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={!report?.content}
                    onClick={() => store.submitReport(sessionId, student.id)}
                  >
                    피드백 제출 (발송 대기)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
