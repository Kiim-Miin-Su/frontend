"use client";
import { memo, useMemo, useState } from "react";
import type { ScheduleResources, ScheduleResource } from "@/types";

type RType = "instructor" | "student" | "room";
const TABS: { key: RType; label: string }[] = [
  { key: "student", label: "학생" },
  { key: "instructor", label: "강사" },
  { key: "room", label: "강의실" },
];
const PAGE = 8;

// 우측 접이식 패널: 유저별 스케줄 — 강사/학생/강의실을 골라 개인 스케줄로 보기(단일 선택).
// 선택한 학생은 좌측 "학생 → 강사 추천"의 기준이 된다.
// React.memo — 부모(ScheduleCalendar)가 드래그 중 자주 리렌더돼도 props(resources/selected/onSelect)가
// 바뀌지 않으면 이 패널은 리렌더하지 않음(주간 뷰 드래그 성능).
function ResourcePanelImpl({
  resources, selected, onSelect,
}: {
  resources: ScheduleResources;
  selected: ScheduleResource | null;
  onSelect: (r: ScheduleResource | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<RType>("student");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const list: ScheduleResource[] =
    tab === "student" ? resources.students : tab === "instructor" ? resources.instructors : resources.rooms;
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? list.filter((x) => x.name.toLowerCase().includes(n)) : list;
  }, [list, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const changeTab = (k: RType) => { setTab(k); setPage(0); setQ(""); };

  return (
    // 폭·고정(sticky)은 부모 우측 컬럼(ScheduleCalendar)이 담당 — 리스트·상세 패널과 세로 스택
    <aside className="w-full card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 h-10 flex items-center justify-between border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <span className="text-[13px] font-semibold">유저별 스케줄</span>
        <span className="text-[12px] text-fg-subtle inline-flex items-center gap-1">
          {selected ? <span className="text-accent truncate max-w-[90px]">{selected.name}</span> : null}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <>
          {selected && (
            <div className="px-2 pt-2">
              <button
                onClick={() => onSelect(null)}
                className="w-full text-left px-2 h-7 rounded text-[12px] text-fg-muted hover:bg-canvas-subtle"
              >
                ← 전체 보기
              </button>
            </div>
          )}
          <div className="flex border-b" style={{ borderColor: "var(--color-line)" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                className={`flex-1 h-9 text-[12px] font-medium ${tab === t.key ? "text-fg border-b-2 border-accent" : "text-fg-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-2">
            <input
              className="input h-8 w-full text-[13px]"
              placeholder={`${TABS.find((t) => t.key === tab)?.label} 검색`}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
            />
          </div>
          <div className="px-2 pb-1 space-y-0.5" style={{ minHeight: PAGE * 34 }}>
            {slice.map((r) => {
              const on = selected?.type === r.type && selected?.id === r.id;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => onSelect(on ? null : r)}
                  className={`w-full flex items-center gap-2 px-2 h-8 rounded text-[13px] ${on ? "bg-neutral-subtle font-semibold" : "hover:bg-canvas-subtle text-fg-muted"}`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color ?? "var(--color-line)" }} />
                  <span className="flex-1 text-left truncate text-fg">{r.name}</span>
                  {r.sub && <span className="text-[11px] text-fg-subtle">{r.sub}</span>}
                </button>
              );
            })}
            {!slice.length && <div className="text-[12px] text-fg-subtle text-center py-6">결과 없음</div>}
          </div>
          <div className="flex items-center justify-between px-3 h-9 border-t text-[12px] text-fg-muted" style={{ borderColor: "var(--color-line)" }}>
            <span>{filtered.length}개</span>
            <div className="flex items-center gap-1.5">
              <button className="btn btn-sm h-6 px-1.5" disabled={cur === 0} onClick={() => setPage(cur - 1)}>◀</button>
              <span className="mono">{cur + 1}/{pages}</span>
              <button className="btn btn-sm h-6 px-1.5" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>▶</button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export const ResourcePanel = memo(ResourcePanelImpl);
