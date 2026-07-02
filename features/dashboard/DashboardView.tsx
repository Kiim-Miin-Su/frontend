'use client';
import {
  Badge,
  StatCard,
  SectionCard,
  StatusDot,
  IconUsers,
  type Tone,
} from '@/components/ui';
import Link from 'next/link';
import { won, shortDate } from '@/lib/format';
import { useTacoStore } from '@/lib/store';
import { isCEO, isAdmin, roleLabel } from '@/lib/roles';
import { buildTasks, type TaskItem } from '@/lib/tasks';
import { BackendPanel } from '@/features/system/BackendPanel';
import type { EnrollmentStatus } from '@/types';

// To-do 항목 리스트 — 알림/대시보드 공용 표현. 항목 클릭 시 해당 화면으로.
function TaskList({ items, empty }: { items: TaskItem[]; empty: string }) {
  if (items.length === 0) return <div className="p-4 text-[13px] text-fg-subtle">{empty}</div>;
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
      {items.map((t) => (
        <li key={t.id}>
          <Link href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas-subtle">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `var(--color-${t.tone === 'neutral' ? 'fg-subtle' : t.tone})` }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg truncate">{t.title}</span>
              {t.detail && <span className="block text-[12px] text-fg-subtle truncate">{t.detail}</span>}
            </span>
            <span className="text-fg-subtle text-[13px]">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const statusTone: Record<EnrollmentStatus, Tone> = {
  active: 'success',
  paused: 'attention',
  completed: 'done',
  canceled: 'danger',
};
const statusLabel: Record<EnrollmentStatus, string> = {
  active: '수강중',
  paused: '일시정지',
  completed: '수료',
  canceled: '취소',
};

export function DashboardView() {
  const store = useTacoStore();
  const role = store.currentRole;
  const ceo = isCEO(role); // 경영 지표(총액·미수금·원장)
  const admin = isAdmin(role); // 운영 데이터
  const { items: tasks, count: taskCount } = buildTasks(store, role);

  // 강사: 내 수업·리포트 중심 To-do 대시보드
  if (role === 'instructor') {
    const reportTasks = tasks.filter((t) => t.group === 'report');
    const classTasks = tasks.filter((t) => t.group === 'class');
    return (
      <div className="p-6 max-w-[860px] mx-auto space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[20px] font-semibold">내 할 일</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">오늘·다가오는 수업과 작성할 리포트를 확인하세요.</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
            <span className="dot" style={{ backgroundColor: 'var(--color-success)' }} />
            {roleLabel[role]} · 대기 {taskCount}건
          </div>
        </div>

        <SectionCard title={`리포트 미작성 (${reportTasks.length})`} action={<a href="/reports" className="btn btn-sm">리포트 작성</a>}>
          <TaskList items={reportTasks} empty="작성할 리포트가 없습니다. 진행한 수업의 리포트가 모두 제출되었습니다." />
        </SectionCard>

        <SectionCard title={`오늘 · 다가오는 수업 (${classTasks.length})`} action={<a href="/schedule" className="btn btn-sm">캘린더</a>}>
          <TaskList items={classTasks} empty="예정된 수업이 없습니다." />
        </SectionCard>

        <p className="text-[12px] text-fg-subtle">진행한 수업은 <b>리포트를 작성·승인</b>받아야 시수로 측정되고 페이가 산정됩니다.</p>
      </div>
    );
  }

  // 학생/학부모는 운영 대시보드 대신 본인 일정으로 안내
  if (!admin) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <h1 className="text-[20px] font-semibold">안녕하세요 ({roleLabel[role]})</h1>
        <p className="text-[13px] text-fg-muted mt-1 mb-5">학원 일정과 내 수업을 캘린더에서 확인하세요.</p>
        <SectionCard title="바로가기">
          <div className="p-4 flex gap-2">
            <a href="/schedule" className="btn btn-primary">학원 캘린더 보기</a>
            <a href="/reports" className="btn">수업 피드백</a>
          </div>
        </SectionCard>
      </div>
    );
  }

  const recent = store.enrollments
    .slice()
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))
    .slice(0, 5)
    .map((e) => {
      const student = store.students.find((s) => s.id === e.studentId);
      const course = store.courses.find((c) => c.id === e.courseId);
      return { id: e.id, student, course, status: e.status, amount: course?.price ?? 0, at: e.enrolledAt };
    });

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold">대시보드</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">2026년 6월 · 이번 달 운영 현황</p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
          {ceo && <Link href="/insights" className="btn btn-sm">경영 지표 →</Link>}
          <span className="dot" style={{ backgroundColor: 'var(--color-success)' }} />
          {roleLabel[role]} · {ceo ? '경영 지표는 별도 탭' : '운영 화면'}
        </div>
      </div>

      {/* 관리자/매니저 할 일 — 회계상 분리: 결제·수납(입금) / 강사 페이·지출(출금) / 상담 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-semibold">할 일 · 처리 대기 <span className="text-fg-subtle font-normal">({taskCount})</span></h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title={`결제 · 수납 (${tasks.filter((t) => t.group === 'payment').length})`} action={<a href="/payments" className="btn btn-sm">결제 관리</a>}>
            <TaskList items={tasks.filter((t) => t.group === 'payment')} empty="재결제 임박·미수 건이 없습니다." />
          </SectionCard>
          <SectionCard title={`강사 페이 (${tasks.filter((t) => t.group === 'pay').length})`} action={<a href="/payouts" className="btn btn-sm">강사 페이</a>}>
            <TaskList items={tasks.filter((t) => t.group === 'pay')} empty="승인·지급 대기 정산이 없습니다." />
          </SectionCard>
          <SectionCard title={`지출 승인 (${tasks.filter((t) => t.group === 'expense').length})`} action={<a href="/admin/approvals" className="btn btn-sm">승인 센터</a>}>
            <TaskList items={tasks.filter((t) => t.group === 'expense')} empty="승인 대기 지출이 없습니다." />
          </SectionCard>
          <SectionCard title={`상담 배정 (${tasks.filter((t) => t.group === 'counsel').length})`} action={<a href="/counsel" className="btn btn-sm">상담</a>}>
            <TaskList items={tasks.filter((t) => t.group === 'counsel')} empty="배정 대기(날짜 미정) 상담이 없습니다." />
          </SectionCard>
        </div>
      </div>

      {/* 경영 지표(수입·지출 그래프·원장)는 /insights 탭으로 분리. 대시보드는 운영 처리 대기에 집중. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="수강 등록" value={`${store.enrollments.length}건`} tone="accent" icon={<IconUsers />} sub={`학생 ${store.students.length}명`} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
          <SectionCard title="최근 수강 등록" action={<a href="/students" className="btn btn-sm">학생 관리</a>}>
            <table className="table">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>코스</th>
                  <th>상태</th>
                  <th className="text-right">금액</th>
                  <th className="text-right">등록일</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium">{e.student?.name ?? '—'}</div>
                      <div className="text-[12px] text-fg-subtle">{e.student?.englishName}</div>
                    </td>
                    <td className="text-fg-muted">{e.course?.name ?? '—'}</td>
                    <td>
                      <Badge tone={statusTone[e.status]}>
                        <StatusDot tone={statusTone[e.status]} label={statusLabel[e.status]} />
                      </Badge>
                    </td>
                    <td className="text-right mono">{won(e.amount)}</td>
                    <td className="text-right text-fg-muted mono">{shortDate(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>
      </div>

      <div className="mt-6">
        <BackendPanel />
      </div>
    </div>
  );
}
