'use client';
import { useState } from 'react';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import type { AttendanceStatus, ReportStatus } from '@/types';

const attLabel: Record<AttendanceStatus, string> = { present: '출석', late: '지각', absent: '결석', excused: '인정결석' };
const attTone: Record<AttendanceStatus, Tone> = { present: 'success', late: 'attention', absent: 'danger', excused: 'done' };
const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

export function ReportsCalendarView() {
  const store = useTacoStore();
  const [ym, setYm] = useState({ y: 2026, m: 5 }); // 0-based: 2026-06
  const [selected, setSelected] = useState<number | null>(null);

  const startWeekday = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStr = `${ym.y}-${pad(ym.m + 1)}`;
  const sessionsOn = (day: number) =>
    store.classSessions.filter((cs) => cs.sessionDate === `${monthStr}-${pad(day)}`);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const move = (delta: number) => {
    const dt = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
    setSelected(null);
  };

  const courseName = (id: number) => store.courses.find((c) => c.id === id)?.name ?? '수업';
  const instructorName = (id: number) => store.instructors.find((i) => i.id === id)?.name ?? '—';

  const session = selected != null ? store.classSessions.find((s) => s.id === selected) : undefined;
  const roster = session
    ? store.enrollments
        .filter((e) => e.courseId === session.courseId)
        .map((e) => store.students.find((s) => s.id === e.studentId))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
    : [];

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">수업 보고서</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">캘린더에서 수업을 선택하면 학생별 피드백을 확인합니다.</p>
      </div>

      <SectionCard
        title={`${ym.y}년 ${ym.m + 1}월`}
        action={
          <div className="flex gap-1.5">
            <button className="btn btn-sm" onClick={() => move(-1)}>← 이전</button>
            <button className="btn btn-sm" onClick={() => move(1)}>다음 →</button>
          </div>
        }
      >
        <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--color-line)' }}>
          {WEEK.map((w, i) => (
            <div key={w} className={`px-3 py-2 text-[12px] font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-accent' : 'text-fg-muted'}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const list = day ? sessionsOn(day) : [];
            return (
              <div
                key={idx}
                className="min-h-[92px] border-b border-r p-1.5"
                style={{ borderColor: 'var(--color-line-muted)' }}
              >
                {day && <div className="text-[12px] text-fg-subtle mb-1 px-1">{day}</div>}
                <div className="space-y-1">
                  {list.map((cs) => {
                    const active = cs.id === selected;
                    return (
                      <button
                        key={cs.id}
                        onClick={() => setSelected(cs.id)}
                        className="w-full text-left rounded px-1.5 py-1 text-[11px] font-medium truncate"
                        style={{
                          backgroundColor: active ? 'var(--color-accent)' : 'var(--color-accent-subtle)',
                          color: active ? '#fff' : 'var(--color-accent)',
                        }}
                        title={courseName(cs.courseId)}
                      >
                        {courseName(cs.courseId)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {session && (
        <SectionCard
          title={`${courseName(session.courseId)} · ${session.sessionDate} · 강사 ${instructorName(session.instructorId)}`}
          action={<button className="btn btn-sm" onClick={() => setSelected(null)}>닫기</button>}
        >
          <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
            {roster.map((student) => {
              const att = store.attendance.find((a) => a.sessionId === session.id && a.studentId === student.id);
              const report = store.sessionReports.find((r) => r.sessionId === session.id && r.studentId === student.id);
              return (
                <div key={student.id} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{student.name}</span>
                    <span className="text-[12px] text-fg-subtle">{student.englishName}</span>
                    {att && <Badge tone={attTone[att.status]}>{attLabel[att.status]}</Badge>}
                    {report && <Badge tone={reportTone[report.status]}>{reportLabel[report.status]}</Badge>}
                  </div>
                  {report?.content ? (
                    <div className="text-[13px] text-fg whitespace-pre-wrap">{report.content}</div>
                  ) : (
                    <div className="text-[13px] text-fg-subtle">작성된 피드백 없음</div>
                  )}
                  {report?.homework && (
                    <div className="text-[12px] text-fg-muted mt-1.5">숙제 · {report.homework}</div>
                  )}
                </div>
              );
            })}
            {roster.length === 0 && <div className="p-4 text-[13px] text-fg-subtle">수강생이 없습니다.</div>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
