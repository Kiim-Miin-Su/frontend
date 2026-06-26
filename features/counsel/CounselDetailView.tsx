'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import type {
  CounselStatus,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
  CounselResult,
} from '@/types';
import {
  statusLabel, statusTone, sourceLabel, resultLabel, resultTone,
  STATUSES, RESULTS,
} from './labels';

export function CounselDetailView({ counselId }: { counselId: number }) {
  const store = useTacoStore();
  const form = store.counselForms.find((f) => f.id === counselId);

  const [round, setRound] = useState({ summary: '', detail: '', result: '', nextAction: '' });

  if (!form) {
    return (
      <div className="p-6 max-w-[820px] mx-auto">
        <Link href="/counsel" className="text-[12px] text-fg-muted hover:underline">← 상담 목록</Link>
        <div className="mt-3 text-fg-muted">상담카드를 찾을 수 없습니다. (id: {counselId})</div>
      </div>
    );
  }

  const patch = (p: Parameters<typeof store.updateCounselForm>[1]) => store.updateCounselForm(form.id, p);
  const rounds = store.counselRounds.filter((r) => r.counselFormId === form.id).sort((a, b) => a.roundNo - b.roundNo);

  const addRound = () => {
    if (!round.summary.trim() && !round.detail.trim()) return;
    store.addCounselRound(form.id, {
      counselorId: form.assignedStaffId,
      summary: round.summary.trim() || undefined,
      detail: round.detail.trim() || undefined,
      result: (round.result || undefined) as CounselResult | undefined,
      nextAction: round.nextAction.trim() || undefined,
    });
    setRound({ summary: '', detail: '', result: '', nextAction: '' });
  };

  return (
    <div className="p-6 max-w-[920px] mx-auto space-y-6">
      <div>
        <Link href="/counsel" className="text-[12px] text-fg-muted hover:underline">← 상담 목록</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-[20px] font-semibold">{form.applicantName} 상담카드</h1>
          <Badge tone={statusTone[form.status]}>{statusLabel[form.status]}</Badge>
        </div>
        <p className="text-[13px] text-fg-muted mt-0.5">{sourceLabel[form.source]} · 접수 {form.createdAt}</p>
      </div>

      {/* 편집 가능한 상담카드 */}
      <SectionCard
        title="상담카드 (편집)"
        action={
          <select className="input btn-sm w-28" value={form.status}
            onChange={(e) => store.updateCounselStatus(form.id, e.target.value as CounselStatus)}>
            {STATUSES.map((s) => (<option key={s} value={s}>{statusLabel[s]}</option>))}
          </select>
        }
      >
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="신청자 이름"><input className="input" value={form.applicantName} onChange={(e) => patch({ applicantName: e.target.value })} /></Field>
          <Field label="연락처"><input className="input" value={form.applicantPhone ?? ''} onChange={(e) => patch({ applicantPhone: e.target.value })} /></Field>
          <Field label="다음 상담 예약일">
            <input type="date" className="input" value={form.nextContactAt ?? ''} onChange={(e) => patch({ nextContactAt: e.target.value || undefined })} />
          </Field>
          <Field label="관심 과목">
            <select className="input" value={form.interestSubjectId ?? ''} onChange={(e) => patch({ interestSubjectId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">선택 안 함</option>
              {store.subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="관심 코스">
            <select className="input" value={form.interestCourseId ?? ''} onChange={(e) => patch({ interestCourseId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">선택 안 함</option>
              {store.courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </Field>
          <Field label="희망 시작 시기">
            <select className="input" value={form.desiredStartTime ?? ''} onChange={(e) => patch({ desiredStartTime: (e.target.value || undefined) as DesiredStartTime | undefined })}>
              <option value="">선택 안 함</option>
              <option value="immediately">즉시</option>
              <option value="within_1_month">1개월 내</option>
              <option value="within_2_3_months">2~3개월</option>
              <option value="undecided">미정</option>
            </select>
          </Field>
          <Field label="학습 분위기">
            <select className="input" value={form.learningAtmosphere ?? ''} onChange={(e) => patch({ learningAtmosphere: (e.target.value || undefined) as LearningAtmosphere | undefined })}>
              <option value="">선택 안 함</option>
              <option value="self_directed">자기주도</option>
              <option value="normal">보통</option>
              <option value="needs_management">관리필요</option>
            </select>
          </Field>
          <Field label="학생 의향">
            <select className="input" value={form.studentIntention ?? ''} onChange={(e) => patch({ studentIntention: (e.target.value || undefined) as StudentIntention | undefined })}>
              <option value="">선택 안 함</option>
              <option value="student_wants">학생 희망</option>
              <option value="parent_only">학부모 주도</option>
              <option value="unknown">미상</option>
            </select>
          </Field>
          <Field label="약점"><input className="input" value={form.weakness ?? ''} onChange={(e) => patch({ weakness: e.target.value || undefined })} /></Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="학원에 바라는 점">
              <textarea className="input h-16 py-2" value={form.academyExpectation ?? ''} onChange={(e) => patch({ academyExpectation: e.target.value || undefined })} />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* 상담 회차 (타임라인) */}
      <SectionCard title={`상담 회차 (${rounds.length}회)`}>
        <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
          {rounds.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge badge-neutral">{r.roundNo + 1}차</span>
                <span className="font-medium text-[13px]">{r.summary ?? '(요약 없음)'}</span>
                {r.result && <Badge tone={resultTone[r.result]}>{resultLabel[r.result]}</Badge>}
                <span className="text-[11px] text-fg-subtle ml-auto">{r.completedAt ?? r.scheduledAt ?? ''}</span>
              </div>
              {r.detail && <div className="text-[13px] text-fg-muted whitespace-pre-wrap">{r.detail}</div>}
              {r.nextAction && <div className="text-[12px] text-accent mt-1">다음 액션 · {r.nextAction}</div>}
            </div>
          ))}
          {rounds.length === 0 && <div className="p-4 text-[13px] text-fg-subtle">아직 상담 회차가 없습니다.</div>}
        </div>

        {/* 회차 추가 */}
        <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--color-line)' }}>
          <div className="text-[12px] font-semibold text-fg-muted">상담 회차 추가</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input" placeholder="요약" value={round.summary} onChange={(e) => setRound({ ...round, summary: e.target.value })} />
            <select className="input" value={round.result} onChange={(e) => setRound({ ...round, result: e.target.value })}>
              <option value="">결과 선택</option>
              {RESULTS.map((r) => (<option key={r} value={r}>{resultLabel[r]}</option>))}
            </select>
          </div>
          <textarea className="input h-16 py-2" placeholder="상세 내용" value={round.detail} onChange={(e) => setRound({ ...round, detail: e.target.value })} />
          <div className="flex gap-3">
            <input className="input flex-1" placeholder="다음 액션" value={round.nextAction} onChange={(e) => setRound({ ...round, nextAction: e.target.value })} />
            <button className="btn btn-primary" onClick={addRound}>회차 기록</button>
          </div>
        </div>
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
