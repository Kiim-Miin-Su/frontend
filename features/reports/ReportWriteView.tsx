'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { DEMO_INSTRUCTOR_ID } from '@/lib/tasks';
import { sessionNeedsReport } from '@/lib/reports';
import type { ClassSession, ReportStatus, Student } from '@/types';

const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };
const sessionTone: Record<string, Tone> = { held: 'success', scheduled: 'accent', canceled: 'danger', no_show: 'danger', makeup: 'attention' };
const sessionLabel: Record<string, string> = { held: '진행완료', scheduled: '예정', canceled: '취소', no_show: '노쇼', makeup: '보강' };

// 한 페이지 리포트 작성 — 강사의 진행중 모든 수업·학생을 좌(목록)/우(인라인 작성)로.
export function ReportWriteView() {
  const store = useTacoStore();
  const instructorId = DEMO_INSTRUCTOR_ID; // 데모: 로그인 강사(추후 세션 user.id)
  const instructorName = store.instructors.find((i) => i.id === instructorId)?.name ?? '강사';
  const courseName = (id: number) => store.courses.find((c) => c.id === id)?.name ?? '수업';

  const sessions = useMemo(
    () =>
      store.classSessions
        .filter((s) => s.instructorId === instructorId)
        .sort((a, b) => (b.sessionDate + (b.startTime ?? '')).localeCompare(a.sessionDate + (a.startTime ?? ''))),
    [store.classSessions, instructorId],
  );

  const rosterOf = (courseId: number): Student[] =>
    store.enrollments
      .filter((e) => e.courseId === courseId)
      .map((e) => store.students.find((s) => s.id === e.studentId))
      .filter((s): s is Student => Boolean(s));

  const reportFor = (sid: number, stid: number) =>
    store.sessionReports.find((r) => r.sessionId === sid && r.studentId === stid);

  const progressOf = (s: ClassSession) => {
    const roster = rosterOf(s.courseId);
    const done = roster.filter((st) => { const r = reportFor(s.id, st.id); return r && r.status !== 'draft'; }).length;
    return { done, total: roster.length };
  };

  // 배지와 동일 기준의 "작성 필요"(held·지난 수업·미작성) 목록. 기본은 이 목록만 노출(배지=리스트 일치).
  // 전체 보기로 전환하면 예정·완료 수업도 열어 편집 가능.
  const needSessions = useMemo(() => sessions.filter((s) => sessionNeedsReport(store, s)), [sessions, store]);
  const [needOnly, setNeedOnly] = useState(true);
  const listSessions = needOnly ? needSessions : sessions;

  // 기본 선택: 리포트가 필요한 첫 진행완료 수업 (단일 소스: lib/reports)
  const firstNeed = needSessions[0];
  const [selId, setSelId] = useState<number | undefined>(firstNeed?.id ?? sessions[0]?.id);
  const selected = sessions.find((s) => s.id === selId);
  const roster = selected ? rosterOf(selected.courseId) : [];

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">리포트 작성</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">{instructorName} 강사 · 진행중인 모든 수업·학생을 한 페이지에서 작성하세요.</p>
        </div>
        <Link href="/reports" className="btn btn-sm">← 캘린더로</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* 좌: 내 수업 목록 — 기본은 배지와 동일 기준(작성 필요)만 */}
        <SectionCard
          title={needOnly ? `작성 필요 (${needSessions.length})` : `내 수업 (${sessions.length})`}
          action={
            <button className="btn btn-sm" onClick={() => setNeedOnly((v) => !v)}>
              {needOnly ? '전체 보기' : '작성 필요만'}
            </button>
          }
        >
          <ul className="divide-y max-h-[68vh] overflow-y-auto" style={{ borderColor: 'var(--color-line-muted)' }}>
            {listSessions.map((s) => {
              const p = progressOf(s);
              const active = s.id === selId;
              const need = sessionNeedsReport(store, s);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelId(s.id)}
                    className={`w-full text-left px-3 py-2.5 ${active ? 'bg-accent-subtle' : 'hover:bg-canvas-subtle'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium truncate flex-1">{courseName(s.courseId)}</span>
                      {need && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-danger)' }} />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-fg-subtle mono">{s.sessionDate} {s.startTime ?? ''}</span>
                      <Badge tone={sessionTone[s.status] ?? 'neutral'}>{sessionLabel[s.status] ?? s.status}</Badge>
                      <span className="text-[11px] text-fg-subtle ml-auto">{p.done}/{p.total}</span>
                    </div>
                  </button>
                </li>
              );
            })}
            {listSessions.length === 0 && (
              <li className="p-4 text-[13px] text-fg-subtle">
                {needOnly ? '작성할 리포트가 없습니다. (진행완료·지난 수업 모두 작성됨)' : '담당 수업이 없습니다.'}
              </li>
            )}
          </ul>
        </SectionCard>

        {/* 우: 선택 수업의 학생별 인라인 작성 */}
        <div className="space-y-3">
          {!selected ? (
            <SectionCard title="작성"><div className="p-4 text-[13px] text-fg-subtle">왼쪽에서 수업을 선택하세요.</div></SectionCard>
          ) : (
            <SectionCard
              title={`${courseName(selected.courseId)} · ${selected.sessionDate} ${selected.startTime ?? ''}`}
              action={<Badge tone={sessionTone[selected.status] ?? 'neutral'}>{sessionLabel[selected.status] ?? selected.status}</Badge>}
            >
              {selected.status !== 'held' && (
                <div className="px-4 pt-3 text-[12px] text-fg-subtle">진행 완료(held) 후 작성한 리포트만 시수로 측정됩니다. (현재: {sessionLabel[selected.status] ?? selected.status})</div>
              )}
              <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
                {roster.map((student) => (
                  <StudentReportRow key={`${selected.id}:${student.id}`} session={selected} student={student} />
                ))}
                {roster.length === 0 && <div className="p-4 text-[13px] text-fg-subtle">수강생이 없습니다.</div>}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

// 학생 1명 인라인 작성 행 — 페이지 이동 없이 저장/제출.
function StudentReportRow({ session, student }: { session: ClassSession; student: Student }) {
  const store = useTacoStore();
  const report = store.sessionReports.find((r) => r.sessionId === session.id && r.studentId === student.id);
  const [content, setContent] = useState(report?.content ?? '');
  const [homework, setHomework] = useState(report?.homework ?? '');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const status: ReportStatus = report?.status ?? 'draft';
  const templates = store.reportTemplates;

  const applyTemplate = (id: number) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setContent((c) => (c.trim() ? c + '\n' + t.content : t.content));
    if (t.homework) setHomework((h) => h || t.homework!);
  };
  const saveAsTemplate = () => {
    if (!content.trim()) return;
    const name = window.prompt('템플릿 이름');
    if (name?.trim()) store.addReportTemplate(name.trim(), content, homework || undefined);
  };

  const save = (submit: boolean) => {
    store.upsertReport(session.id, student.id, session.instructorId, { content, homework });
    if (submit) store.submitReport(session.id, student.id);
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium">{student.name}</span>
        {student.englishName && <span className="text-[12px] text-fg-subtle">{student.englishName}</span>}
        <Badge tone={reportTone[status]}>{reportLabel[status]}</Badge>
        {report?.approvalStatus === 'approved' && <Badge tone="success">승인됨 · 시수 반영</Badge>}
        {report?.approvalStatus === 'rejected' && <Badge tone="danger">반려</Badge>}
        {savedAt && <span className="text-[11px] text-fg-subtle ml-auto">저장됨 {savedAt}</span>}
      </div>
      {report?.approvalStatus === 'rejected' && report.rejectedReason && (
        <div className="mb-2 text-[12px] text-danger">반려 사유: {report.rejectedReason}</div>
      )}
      {/* 템플릿 적용/저장 */}
      <div className="flex items-center gap-2 mb-2">
        <select className="input h-8 w-44 text-[12px]" value="" onChange={(e) => e.target.value && applyTemplate(Number(e.target.value))}>
          <option value="">템플릿 적용…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" className="btn btn-sm" onClick={saveAsTemplate} disabled={!content.trim()}>현재 내용을 템플릿으로</button>
      </div>
      <textarea
        className="input h-24 py-2 leading-relaxed"
        placeholder="오늘 수업 내용·태도·성취 (학부모 발송용)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <input
        className="input mt-2"
        placeholder="숙제 (다음 수업 전까지)"
        value={homework}
        onChange={(e) => setHomework(e.target.value)}
      />
      <div className="flex justify-end gap-2 mt-2">
        <button className="btn btn-sm" onClick={() => save(false)}>임시 저장</button>
        <button className="btn btn-sm btn-primary" disabled={!content.trim()} onClick={() => save(true)}>제출</button>
      </div>
    </div>
  );
}
