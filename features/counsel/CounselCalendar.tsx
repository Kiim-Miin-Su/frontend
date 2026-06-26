'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

export function CounselCalendar() {
  const forms = useTacoStore((s) => s.counselForms);
  const rounds = useTacoStore((s) => s.counselRounds);
  const [ym, setYm] = useState({ y: 2026, m: 5 });

  const startWeekday = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStr = `${ym.y}-${pad(ym.m + 1)}`;
  const nameOf = (formId: number) => forms.find((f) => f.id === formId)?.applicantName ?? '상담';

  const move = (delta: number) => {
    const dt = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <SectionCard
      title={`상담 캘린더 · ${ym.y}년 ${ym.m + 1}월`}
      action={
        <div className="flex gap-1.5">
          <button className="btn btn-sm" onClick={() => move(-1)}>← 이전</button>
          <button className="btn btn-sm" onClick={() => move(1)}>다음 →</button>
        </div>
      }
    >
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--color-line)' }}>
        {WEEK.map((w, i) => (
          <div key={w} className={`px-3 py-2 text-[12px] font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-accent' : 'text-fg-muted'}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const dateStr = day ? `${monthStr}-${pad(day)}` : '';
          const history = day ? rounds.filter((r) => r.completedAt === dateStr) : [];
          const reservations = day ? forms.filter((f) => f.nextContactAt === dateStr) : [];
          return (
            <div key={idx} className="min-h-[92px] border-b border-r p-1.5" style={{ borderColor: 'var(--color-line-muted)' }}>
              {day && <div className="text-[12px] text-fg-subtle mb-1 px-1">{day}</div>}
              <div className="space-y-1">
                {reservations.map((f) => (
                  <Link key={`r${f.id}`} href={`/counsel/${f.id}`}
                    className="block rounded px-1.5 py-1 text-[11px] font-medium truncate"
                    style={{ backgroundColor: 'var(--color-attention-subtle)', color: 'var(--color-attention)' }}
                    title="상담 예약">
                    📅 {f.applicantName} 예약
                  </Link>
                ))}
                {history.map((r) => (
                  <Link key={`h${r.id}`} href={`/counsel/${r.counselFormId}`}
                    className="block rounded px-1.5 py-1 text-[11px] font-medium truncate"
                    style={{ backgroundColor: 'var(--color-canvas-subtle)', color: 'var(--color-fg-muted)' }}
                    title="상담 내역">
                    {nameOf(r.counselFormId)} {r.roundNo + 1}차
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
