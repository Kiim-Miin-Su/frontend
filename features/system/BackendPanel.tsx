'use client';
import { useEffect, useState } from 'react';
import { Badge, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import type { Student } from '@/types';

// 실제 백엔드(NestJS) API와의 연동을 보여주는 패널 (mock 스토어와 별개).
export function BackendPanel() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      await api.health();
      setStudents(await api.students.list());
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.students.create({ name: name.trim() });
      setName('');
      await load();
    } catch (e) {
      alert(`등록 실패: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="백엔드 연동 (실시간 API)"
      action={
        <Badge tone={status === 'online' ? 'success' : status === 'offline' ? 'danger' : 'neutral'}>
          {status === 'online' ? '연결됨' : status === 'offline' ? '오프라인' : '확인 중…'}
        </Badge>
      }
    >
      {status === 'offline' ? (
        <div className="p-4 text-[13px] text-fg-muted">
          백엔드 API에 연결할 수 없습니다. <span className="mono">cd backend &amp;&amp; npm run dev</span> 로 서버(3001)를 띄워주세요.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="API로 학생 등록 (이름)" value={name}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn btn-primary shrink-0" disabled={busy} onClick={add}>API 등록</button>
          </div>
          <div className="text-[12px] text-fg-subtle">API 학생 {students.length}명</div>
          <ul className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
            {students.slice(-5).reverse().map((s) => (
              <li key={s.id} className="py-2 text-[13px] flex justify-between">
                <span className="font-medium">{s.name}</span>
                <span className="text-fg-subtle mono">#{s.id} · {s.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
