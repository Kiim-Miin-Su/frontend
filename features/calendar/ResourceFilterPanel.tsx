"use client";
import { useMemo, useState } from "react";
import type { ScheduleResources } from "@/types";

type TabKey = "instructor" | "student" | "room" | "subject";
type Item = { key: string | number; label: string; color?: string; sub?: string };

const TABS: { key: TabKey; label: string }[] = [
  { key: "instructor", label: "강사" },
  { key: "student", label: "학생" },
  { key: "room", label: "강의실" },
  { key: "subject", label: "과목" },
];
const PAGE = 8;

// 우측 상시 필터 패널 — 자원이 많아져도 탭·검색·페이지네이션으로 탐색.
// 다중 선택은 부모의 필터 Set과 직접 연동(체크 토글).
export function ResourceFilterPanel({
  resources,
  fInstructors, onToggleInstructor,
  fStudents, onToggleStudent,
  fRooms, onToggleRoom,
  fSubjects, onToggleSubject,
  onClear, anyFilter,
}: {
  resources: ScheduleResources;
  fInstructors: Set<number>; onToggleInstructor: (id: number) => void;
  fStudents: Set<number>; onToggleStudent: (id: number) => void;
  fRooms: Set<number>; onToggleRoom: (id: number) => void;
  fSubjects: Set<string>; onToggleSubject: (name: string) => void;
  onClear: () => void; anyFilter: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("instructor");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  // 과목: 코스에서 유니크 추출
  const subjects = useMemo(() => {
    const m = new Map<string, string | undefined>();
    resources.courses.forEach((c) => { if (c.subjectName) m.set(c.subjectName, c.color); });
    return [...m.entries()].map(([name, color]) => ({ key: name, label: name, color }));
  }, [resources]);

  const allItems: Item[] =
    tab === "instructor" ? resources.instructors.map((i) => ({ key: i.id, label: i.name, color: i.color, sub: i.sub }))
      : tab === "student" ? resources.students.map((s) => ({ key: s.id, label: s.name, color: s.color, sub: s.sub }))
        : tab === "room" ? resources.rooms.map((r) => ({ key: r.id, label: r.name, color: r.color, sub: r.sub }))
          : subjects;

  const isOn = (it: Item) =>
    tab === "instructor" ? fInstructors.has(it.key as number)
      : tab === "student" ? fStudents.has(it.key as number)
        : tab === "room" ? fRooms.has(it.key as number)
          : fSubjects.has(it.key as string);
  const toggle = (it: Item) =>
    tab === "instructor" ? onToggleInstructor(it.key as number)
      : tab === "student" ? onToggleStudent(it.key as number)
        : tab === "room" ? onToggleRoom(it.key as number)
          : onToggleSubject(it.key as string);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? allItems.filter((it) => it.label.toLowerCase().includes(n)) : allItems;
  }, [allItems, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  // 선택 요약(현재 탭 기준 개수)
  const selCount =
    tab === "instructor" ? fInstructors.size
      : tab === "student" ? fStudents.size
        : tab === "room" ? fRooms.size
          : fSubjects.size;

  const changeTab = (k: TabKey) => { setTab(k); setPage(0); setQ(""); };

  return (
    <aside className="w-60 shrink-0 card overflow-hidden self-start sticky top-4">
      <div className="px-3 h-10 flex items-center justify-between border-b" style={{ borderColor: "var(--color-line)" }}>
        <span className="text-[13px] font-semibold">필터</span>
        {anyFilter && (
          <button className="text-[12px] text-fg-muted hover:text-danger" onClick={onClear}>초기화</button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b" style={{ borderColor: "var(--color-line)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => changeTab(t.key)}
            className={`flex-1 h-9 text-[12px] font-medium ${tab === t.key ? "text-fg border-b-2 border-accent" : "text-fg-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="p-2">
        <input className="input h-8 w-full text-[13px]" placeholder={`${TABS.find((t) => t.key === tab)?.label} 검색`}
          value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>

      {/* 목록 */}
      <div className="px-2 pb-1 space-y-0.5" style={{ minHeight: PAGE * 34 }}>
        {slice.map((it) => {
          const on = isOn(it);
          return (
            <button key={it.key} onClick={() => toggle(it)}
              className={`w-full flex items-center gap-2 px-2 h-8 rounded text-[13px] ${on ? "bg-neutral-subtle font-semibold" : "hover:bg-canvas-subtle text-fg-muted"}`}>
              <span className="inline-grid place-items-center w-4 h-4 rounded border shrink-0"
                style={{ borderColor: on ? "var(--color-accent)" : "var(--color-line)", background: on ? "var(--color-accent)" : "transparent" }}>
                {on && <span className="text-white text-[10px] leading-none">✓</span>}
              </span>
              {it.color && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color }} />}
              <span className="flex-1 text-left truncate text-fg">{it.label}</span>
              {it.sub && <span className="text-[11px] text-fg-subtle">{it.sub}</span>}
            </button>
          );
        })}
        {!slice.length && <div className="text-[12px] text-fg-subtle text-center py-6">결과 없음</div>}
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between px-3 h-9 border-t text-[12px] text-fg-muted" style={{ borderColor: "var(--color-line)" }}>
        <span>{selCount > 0 ? `선택 ${selCount}` : `${filtered.length}개`}</span>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-sm h-6 px-1.5" disabled={cur === 0} onClick={() => setPage(cur - 1)}>◀</button>
          <span className="mono">{cur + 1}/{pages}</span>
          <button className="btn btn-sm h-6 px-1.5" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>▶</button>
        </div>
      </div>
    </aside>
  );
}
