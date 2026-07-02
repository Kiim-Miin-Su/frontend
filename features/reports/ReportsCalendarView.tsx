// [참조/처리] 수업 보고서 캘린더/리스트 — 읽기 전용. 모든 서버 데이터는 TanStack Query 단일 소스
//  (useSchedule·useCourses·useInstructors·useEnrollments·useStudents·useReports·useAttendance).
//  sessionNeedsReport(lib/reports)는 {classSessions,enrollments,sessionReports} slice를 받으므로 조립해 넘긴다.
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import {
  useSchedule, useCourses, useInstructors, useEnrollments, useStudents, useReports, useAttendance,
} from '@/lib/queries';
import { pendingReportSummary, rosterStudentIds } from '@/lib/reports';
import { useTacoStore } from '@/lib/store';
import { DEMO_INSTRUCTOR_ID } from '@/lib/tasks';
import type { AttendanceStatus, ReportStatus } from '@/types';

const attLabel: Record<AttendanceStatus, string> = { present: '출석', late: '지각', absent: '결석', excused: '인정결석' };
const attTone: Record<AttendanceStatus, Tone> = { present: 'success', late: 'attention', absent: 'danger', excused: 'done' };
const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };
import { WEEKDAYS_KO as WEEK, pad2 as pad } from '@/lib/domain/schedule';

export function ReportsCalendarView() {
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: instructors = [] } = useInstructors();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: sessionReports = [] } = useReports();
  const { data: attendance = [] } = useAttendance();
  // slice(단일 소스 조립) — 배지(navBadges)와 같은 pendingReportSummary 모집단을 쓴다.
  const reportSlice = { classSessions, enrollments, sessionReports };
  // 역할 스코프: 강사는 본인 수업만(배지와 동일). 관리자·매니저는 전체.
  const role = useTacoStore((s) => s.currentRole);
  const scopeInstructorId = role === 'instructor' ? DEMO_INSTRUCTOR_ID : undefined;
  // 배지와 동일 모집단(전체 기간 + 역할 스코프): sessions=목록, itemCount=배지 숫자.
  const pending = pendingReportSummary(reportSlice, scopeInstructorId);
  const pendingIds = new Set(pending.sessions.map((s) => s.id));
  // 초기 달 = 오늘(과거 하드코딩 금지 — 2026-06 고정으로 배지·리스트가 어긋나 보이던 원인 중 하나)
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<number | null>(null);
  const [needOnly, setNeedOnly] = useState(true); // 기본: 배지와 동일 기준(작성 필요)만

  const startWeekday = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStr = `${ym.y}-${pad(ym.m + 1)}`;
  const sessionsOn = (day: number) =>
    classSessions.filter((cs) => cs.sessionDate === `${monthStr}-${pad(day)}`);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const move = (delta: number) => {
    const dt = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
    setSelected(null);
  };

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? '수업';
  const instructorName = (id: number) => instructors.find((i) => i.id === id)?.name ?? '—';

  const session = selected != null ? classSessions.find((s) => s.id === selected) : undefined;
  // 로스터 = lib/reports.rosterStudentIds(활성 수강만) — 미작성 집계·배지와 동일 모집단(단일 소스).
  const roster = session
    ? rosterStudentIds({ enrollments }, session.courseId)
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
    : [];

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">수업 보고서</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">캘린더·리스트에서 수업을 선택해 확인하거나, 한 페이지에서 바로 작성하세요.</p>
        </div>
        <Link href="/reports/write" className="btn btn-primary">리포트 작성하기</Link>
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
                        title={courseName(cs.courseId) + (pendingIds.has(cs.id) ? ' · 리포트 미작성' : '')}
                      >
                        {/* 미작성(배지 모집단) 수업은 빨간 점으로 표시 — 리스트·배지와 같은 기준 */}
                        {pendingIds.has(cs.id) && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: 'var(--color-danger)' }} />
                        )}
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

      {/* 수업 리스트 — 캘린더와 별도 컴포넌트(리포트 진행률·바로 작성) */}
      {(() => {
        const inMonth = classSessions
          .filter((cs) => cs.sessionDate.startsWith(monthStr))
          .sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? '')));
        // "작성 필요" = 배지와 완전히 같은 모집단(전체 기간·역할 스코프, 월 필터 없음) → 숫자 불일치 원천 차단.
        //  전체 보기 = 선택한 달의 수업 리스트(기존 동작).
        const monthSessions = needOnly
          ? [...pending.sessions].sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? '')))
          : inMonth;
        return (
          <SectionCard
            title={
              needOnly
                ? `작성 필요 — 수업 ${pending.sessionCount}개 · 보고서 ${pending.itemCount}건 (배지 기준)`
                : `수업 리스트 (${monthSessions.length}) — ${ym.y}년 ${ym.m + 1}월`
            }
            action={
              <button className="btn btn-sm" onClick={() => setNeedOnly((v) => !v)}>
                {needOnly ? '전체 보기' : '작성 필요만'}
              </button>
            }
          >
            {monthSessions.length === 0 ? (
              <div className="p-4 text-[13px] text-fg-subtle">{needOnly ? '이 달 작성할 리포트가 없습니다.' : '이 달 수업이 없습니다.'}</div>
            ) : (
              <table className="table">
                <thead><tr><th>날짜</th><th>수업</th><th>강사</th><th className="text-right">리포트</th><th></th></tr></thead>
                <tbody>
                  {monthSessions.map((s) => {
                    const ids = rosterStudentIds({ enrollments }, s.courseId); // 활성 수강만(단일 소스)
                    const done = sessionReports.filter((r) => r.sessionId === s.id && ids.includes(r.studentId) && r.status !== 'draft').length;
                    return (
                      <tr key={s.id} className={s.id === selected ? 'bg-accent-subtle' : ''}>
                        <td className="mono text-fg-muted">{s.sessionDate} {s.startTime ?? ''}</td>
                        <td className="font-medium">{courseName(s.courseId)}</td>
                        <td className="text-fg-muted">{instructorName(s.instructorId)}</td>
                        <td className="text-right mono">{done}/{ids.length}</td>
                        <td className="text-right whitespace-nowrap">
                          <button className="btn btn-sm mr-1" onClick={() => setSelected(s.id)}>보기</button>
                          <Link href="/reports/write" className="btn btn-sm btn-primary">작성</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        );
      })()}

      {session && (
        <SectionCard
          title={`${courseName(session.courseId)} · ${session.sessionDate} · 강사 ${instructorName(session.instructorId)}`}
          action={<button className="btn btn-sm" onClick={() => setSelected(null)}>닫기</button>}
        >
          <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
            {roster.map((student) => {
              const att = attendance.find((a) => a.sessionId === session.id && a.studentId === student.id);
              const report = sessionReports.find((r) => r.sessionId === session.id && r.studentId === student.id);
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
