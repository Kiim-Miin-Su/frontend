'use client';
import { useCallback, useEffect, useState } from 'react';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { isAdmin } from '@/lib/roles';
import { won } from '@/lib/format';
import { api, type MeasureResult, type PayoutRow, type PayoutRowStatus } from '@/lib/api';

const statusLabel: Record<PayoutRowStatus, string> = {
  pending: '승인대기', confirmed: '승인됨', paid: '지급완료', rejected: '반려',
};
const statusTone: Record<PayoutRowStatus, Tone> = {
  pending: 'attention', confirmed: 'accent', paid: 'success', rejected: 'danger',
};
const hours = (min?: number) => `${((min ?? 0) / 60).toFixed(1)}h`;

type Conn = 'checking' | 'online' | 'offline';

export function PayoutsView() {
  const role = useTacoStore((s) => s.currentRole);
  const admin = isAdmin(role);

  const [conn, setConn] = useState<Conn>('checking');
  const [instructors, setInstructors] = useState<{ id: number; name: string }[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [instructorId, setInstructorId] = useState('');
  const [start, setStart] = useState('2026-06-01');
  const [end, setEnd] = useState('2026-06-30');
  const [preview, setPreview] = useState<MeasureResult | null>(null);

  const instructorName = useCallback(
    (id: number) => instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`,
    [instructors],
  );

  const loadPayouts = useCallback(async () => {
    setPayouts(await api.payouts.list());
  }, []);

  // 초기 로드 — 자원(강사)·정산 목록 + 연결 상태
  useEffect(() => {
    (async () => {
      try {
        const res = await api.schedule.resources();
        setInstructors(res.instructors.map((i) => ({ id: i.id, name: i.name })));
        await loadPayouts();
        setConn('online');
      } catch {
        setConn('offline');
      }
    })();
  }, [loadPayouts]);

  // 강사·기간 변경 시 산정 미리보기(읽기전용)
  useEffect(() => {
    if (conn !== 'online' || !instructorId) { setPreview(null); return; }
    let alive = true;
    (async () => {
      try {
        const m = await api.payouts.preview(Number(instructorId), start, end);
        if (alive) setPreview(m);
      } catch {
        if (alive) setPreview(null);
      }
    })();
    return () => { alive = false; };
  }, [conn, instructorId, start, end]);

  const refreshPreview = useCallback(async () => {
    if (!instructorId) return;
    try { setPreview(await api.payouts.preview(Number(instructorId), start, end)); } catch { setPreview(null); }
  }, [instructorId, start, end]);

  // 액션 래퍼 — 공통 busy/에러/리로드
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await loadPayouts();
      await refreshPreview();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(`처리 실패: ${msg ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const generate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructorId) return;
    act(() => api.payouts.generate(Number(instructorId), start, end));
  };
  const adjust = (p: PayoutRow) => {
    const raw = window.prompt(`급여 수정 — 실효 지급액(원)\n자동 산정액: ${won(p.computedAmount)}`, String(p.amount));
    if (raw == null) return;
    const amount = Number(raw.replace(/[^\d]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) { alert('금액이 올바르지 않습니다'); return; }
    const reason = window.prompt('수정 사유(선택)', p.adjustReason ?? '') ?? undefined;
    act(() => api.payouts.adjust(p.id, amount, reason));
  };
  const reject = (p: PayoutRow) => {
    const reason = window.prompt('반려 사유', p.rejectedReason ?? '') ?? undefined;
    act(() => api.payouts.reject(p.id, reason));
  };

  if (conn === 'offline') {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <h1 className="text-[20px] font-semibold">강사 페이</h1>
        <div className="mt-4 p-4 rounded-lg border text-[13px] text-fg-muted" style={{ borderColor: 'var(--color-line-muted)' }}>
          백엔드 API에 연결할 수 없습니다. 로컬은 <span className="mono">cd backend &amp;&amp; npm run dev</span>, 배포는 <span className="mono">NEXT_PUBLIC_API_URL</span>를 확인하세요.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">강사 페이</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">시수 × 코스 시급으로 산정(진행 완료 + 보고서 승인분만) · 생성 → 승인 → 지급</p>
        </div>
        <Badge tone={conn === 'online' ? 'success' : 'neutral'}>{conn === 'online' ? '실시간 API' : '확인 중…'}</Badge>
      </div>

      <SectionCard title="정산 산정 · 정산서 생성">
        <form onSubmit={generate} className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="강사 *">
            <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              <option value="">선택</option>
              {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
            </select>
          </Field>
          <Field label="시작일"><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="종료일"><input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <button type="submit" className="btn btn-primary h-8" disabled={!instructorId || busy || !preview?.sessionCount}>정산서 생성</button>
          {instructorId && (
            <div className="sm:col-span-4 text-[13px] text-fg-muted">
              {preview && preview.sessionCount > 0 ? (
                <>미리보기 — 적격 수업 <b>{preview.sessionCount}</b>회 · 시수 <b>{hours(preview.totalMinutes)}</b> · 산정액 <b className="text-fg">{won(preview.computedAmount)}</b></>
              ) : (
                <span className="text-fg-subtle">해당 기간에 정산 대상(진행 완료 + 승인 보고서)이 없습니다.</span>
              )}
            </div>
          )}
        </form>
      </SectionCard>

      {preview && preview.sessionCount > 0 && (
        <SectionCard title={`적격 수업 내역 (${preview.lines.length}건)`}>
          <table className="table">
            <thead>
              <tr><th>날짜</th><th>코스</th><th className="text-right">시수</th><th className="text-right">시급</th><th className="text-right">페이</th></tr>
            </thead>
            <tbody>
              {preview.lines.map((r) => (
                <tr key={r.sessionId}>
                  <td className="mono">{r.sessionDate}</td>
                  <td className="font-medium">{r.courseName}</td>
                  <td className="text-right mono">{(r.durationMinutes / 60).toFixed(1)}h</td>
                  <td className="text-right mono text-fg-muted">{won(r.hourlyRate)}</td>
                  <td className="text-right mono">{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard title="정산 목록">
        <table className="table">
          <thead>
            <tr>
              <th>강사</th><th>기간</th><th className="text-right">시수</th><th className="text-right">금액</th><th>상태</th><th className="text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-[13px] text-fg-subtle">정산서가 없습니다. 위에서 강사·기간을 선택해 생성하세요.</td></tr>
            )}
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{instructorName(p.instructorId)}</td>
                <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                <td className="text-right mono">{hours(p.totalMinutes)} · {p.sessionCount}회</td>
                <td className="text-right mono">
                  {won(p.amount)}
                  {p.adjustedAmount != null && p.adjustedAmount !== p.computedAmount && (
                    <div className="text-[11px] text-fg-subtle">산정 {won(p.computedAmount)}</div>
                  )}
                </td>
                <td>
                  <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
                  {p.status === 'rejected' && p.rejectedReason && (
                    <div className="text-[11px] text-fg-subtle mt-0.5">{p.rejectedReason}</div>
                  )}
                </td>
                <td className="text-right">
                  {!admin ? (
                    <span className="text-[12px] text-fg-subtle">{p.status === 'pending' ? '관리자 승인 대기' : '—'}</span>
                  ) : (
                    <div className="inline-flex gap-1.5 justify-end flex-wrap">
                      {p.status === 'pending' && (
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => api.payouts.confirm(p.id))}>승인</button>
                      )}
                      {p.status === 'confirmed' && (
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => api.payouts.pay(p.id))}>지급</button>
                      )}
                      {(p.status === 'pending' || p.status === 'confirmed') && (
                        <>
                          <button className="btn btn-sm" disabled={busy} onClick={() => adjust(p)}>급여수정</button>
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => reject(p)}>반려</button>
                        </>
                      )}
                      {(p.status === 'paid' || p.status === 'rejected') && (
                        <span className="text-[12px] text-fg-subtle mono">{p.paidAt ? p.paidAt.slice(0, 10) : '—'}</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">
        시수는 <b>진행 완료(held) + 보고서 승인</b>분만 채워지며, 세션은 한 정산서에만 연결됩니다(이중 계상 방지).
        지급 시 출금 거래 원장과 대시보드에 반영됩니다.
        {!admin && ' 승인·지급·수정은 관리자(대표) 역할에서 가능합니다.'}
      </p>
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
