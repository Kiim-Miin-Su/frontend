'use client';
import { MonthCalendar } from '@/components/ui';
import { useSchedule, useCourses, useAcademyEvents } from '@/lib/queries';
import { AdminGuard, AdminHeader } from './AdminShell';
import { eventLabel, eventStyle } from './labels';

export function AdminOverview() {
  return (
    <AdminGuard>
      <div className="p-6 max-w-[1100px] mx-auto space-y-6">
        <AdminHeader />
        <AcademyCalendar />
      </div>
    </AdminGuard>
  );
}

function AcademyCalendar() {
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: events = [] } = useAcademyEvents();
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? '수업';

  return (
    <MonthCalendar
      titlePrefix="학원 일정 · "
      renderDay={(dateStr) => (
        <>
          {events
            .filter((e) => dateStr >= e.startDate && dateStr <= e.endDate)
            .map((e) => (
              <div key={`e${e.id}`} className="rounded px-1.5 py-1 text-[11px] font-medium truncate"
                style={{ backgroundColor: eventStyle[e.type].bg, color: eventStyle[e.type].fg }} title={e.title}>
                {e.priority === 'high' ? '★ ' : ''}{eventLabel[e.type]} · {e.title}
              </div>
            ))}
          {classSessions
            .filter((s) => s.sessionDate === dateStr)
            .map((s) => (
              <div key={`s${s.id}`} className="rounded px-1.5 py-1 text-[11px] truncate"
                style={{ backgroundColor: 'var(--color-canvas-subtle)', color: 'var(--color-fg-muted)' }} title={courseName(s.courseId)}>
                {courseName(s.courseId)}
              </div>
            ))}
        </>
      )}
    />
  );
}
