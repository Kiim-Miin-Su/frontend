"use client";
// [참조/처리] Lantiv형 상단 필터 바.
//  - 리소스 다중선택(강사 👓 / 학생 🎓 / 강의실 🚪): 체크박스 팝오버(검색 + 색 스와치) — Lantiv 'Name' 드롭다운 대응.
//  - 상태 필터 4종(출석/지각/결강/보강, lib/domain/lantiv.sessionStates 기준) · "그룹 수업만" · 기간(from/to).
//  - 선택 상태는 부모(ScheduleCalendar)가 소유(단일 소스). 이 컴포넌트는 표시·토글 콜백만 담당(서버 fetch 없음).
//  - 리소스 후보 = GET /schedule/resources(강사·학생) + GET /rooms(강의실) — FK 유니버스와 동일.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Room, ScheduleResources } from "@/types";
import { MAX_SPLIT, STATUS_FILTERS, STATUS_FILTER_LABEL, type StatusFilter } from "@/lib/domain/lantiv";

export type FilterDim = "instructor" | "student" | "room";
export type ColorBy = "subject" | "instructor" | "room" | "student";
export type Period = { from: string; to: string };

const DIM_META: Record<FilterDim, { icon: string; label: string }> = {
  instructor: { icon: "👓", label: "강사" },
  student: { icon: "🎓", label: "학생" },
  room: { icon: "🚪", label: "강의실" },
};

type Option = { id: number; name: string; color?: string; sub?: string };

// ── 체크박스 팝오버(검색 + 다중선택 + 색 스와치) — Lantiv 리소스 드롭다운 ──
export function MultiPick({
  dim, options, picked, onToggle, onClear,
}: {
  dim: FilterDim;
  options: Option[];
  picked: Set<number>;
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [open]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.name.toLowerCase().includes(n)) : options;
  }, [options, q]);
  const meta = DIM_META[dim];
  return (
    <div className="relative" ref={ref}>
      <button
        className={`btn btn-sm ${picked.size ? "badge-accent" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={`${meta.label} 다중선택 — 2명 이상 선택하면 스플릿 뷰`}
      >
        {meta.icon} {meta.label}
        {picked.size > 0 && <span className="ml-1 mono">{picked.size}</span>}
        <span className="ml-1 text-[10px]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-40 card shadow-lg w-60 overflow-hidden"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <input
              className="input h-7 w-full text-[12px]"
              placeholder={`${meta.label} 검색`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.map((o) => {
              const on = picked.has(o.id);
              return (
                <label
                  key={o.id}
                  className={`flex items-center gap-2 px-2 h-8 rounded cursor-pointer text-[13px] ${on ? "bg-neutral-subtle" : "hover:bg-canvas-subtle"}`}
                >
                  <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} />
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: o.color ?? "var(--color-line)" }} />
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.sub && <span className="text-[11px] text-fg-subtle">{o.sub}</span>}
                </label>
              );
            })}
            {!filtered.length && <div className="text-[12px] text-fg-subtle text-center py-4">결과 없음</div>}
          </div>
          <div className="flex items-center justify-between px-2 h-8 border-t text-[12px]" style={{ borderColor: "var(--color-line)" }}>
            <span className="text-fg-subtle">
              {picked.size}/{options.length} 선택
              {picked.size > MAX_SPLIT ? ` · 스플릿은 ${MAX_SPLIT}개까지` : ""}
            </span>
            <button className="btn btn-sm h-6 px-1.5" disabled={!picked.size} onClick={onClear}>
              해제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CalendarFilterBar({
  resources, rooms,
  q, onQ, colorBy, onColorBy,
  fInstructors, fStudents, fRooms, onToggleId, onClearDim,
  fStatuses, onToggleStatus,
  groupOnly, onGroupOnly,
  period, onPeriod,
  anyFilter, onClearAll,
}: {
  resources: ScheduleResources | null;
  rooms: Room[];
  q: string;
  onQ: (v: string) => void;
  colorBy: ColorBy;
  onColorBy: (v: ColorBy) => void;
  fInstructors: Set<number>;
  fStudents: Set<number>;
  fRooms: Set<number>;
  onToggleId: (dim: FilterDim, id: number) => void;
  onClearDim: (dim: FilterDim) => void;
  fStatuses: Set<StatusFilter>;
  onToggleStatus: (s: StatusFilter) => void;
  groupOnly: boolean;
  onGroupOnly: (v: boolean) => void;
  period: Period | null;
  onPeriod: (p: Period | null) => void;
  anyFilter: boolean;
  onClearAll: () => void;
}) {
  const optionsOf = (dim: FilterDim): Option[] =>
    dim === "instructor"
      ? (resources?.instructors ?? []).map((r) => ({ id: Number(r.id), name: r.name, color: r.color, sub: r.sub }))
      : dim === "student"
        ? (resources?.students ?? []).map((r) => ({ id: Number(r.id), name: r.name, color: r.color, sub: r.sub }))
        : rooms.map((r) => ({ id: Number(r.id), name: r.name, color: r.color }));
  const pickedOf = (dim: FilterDim) => (dim === "instructor" ? fInstructors : dim === "student" ? fStudents : fRooms);

  // 선택 칩(이름 역참조 — FK가 리소스 목록에 없으면 #id 폴백, 조인 누락을 숨기지 않음)
  const chips = useMemo(() => {
    const out: { dim: FilterDim; id: number; name: string }[] = [];
    (["instructor", "student", "room"] as FilterDim[]).forEach((dim) => {
      const opts = optionsOf(dim);
      pickedOf(dim).forEach((id) =>
        out.push({ dim, id, name: opts.find((o) => o.id === id)?.name ?? `${DIM_META[dim].label}#${id}` }),
      );
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, rooms, fInstructors, fStudents, fRooms]);

  return (
    <div className="card card-pad space-y-2">
      {/* 1행: 리소스 다중선택 + 상태/그룹 + 기간 */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["instructor", "student", "room"] as FilterDim[]).map((dim) => (
          <MultiPick
            key={dim}
            dim={dim}
            options={optionsOf(dim)}
            picked={pickedOf(dim)}
            onToggle={(id) => onToggleId(dim, id)}
            onClear={() => onClearDim(dim)}
          />
        ))}
        <span className="w-px h-5" style={{ background: "var(--color-line)" }} />
        {/* 상태 필터: [전체] + 출석/지각/결강/보강 — 전체=상태 무관(기본), 복수 선택=합집합(피드백: 옵션별 전체 란) */}
        <button
          className={`btn btn-sm ${fStatuses.size === 0 ? "badge-accent" : ""}`}
          onClick={() => STATUS_FILTERS.forEach((s) => fStatuses.has(s) && onToggleStatus(s))}
          title="상태 무관 전체 보기"
        >
          전체
        </button>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${fStatuses.has(s) ? "badge-accent" : ""}`}
            onClick={() => onToggleStatus(s)}
            title={`${STATUS_FILTER_LABEL[s]}인 수업만 (복수 선택 = 합집합)`}
          >
            {STATUS_FILTER_LABEL[s]}
          </button>
        ))}
        <span className="w-px h-5" style={{ background: "var(--color-line)" }} />
        {/* 수업 유형: [전체] / [그룹 수업만] */}
        <button
          className={`btn btn-sm ${!groupOnly ? "badge-accent" : ""}`}
          onClick={() => onGroupOnly(false)}
          title="1:1·그룹 모두"
        >
          전체
        </button>
        <button
          className={`btn btn-sm ${groupOnly ? "badge-accent" : ""}`}
          onClick={() => onGroupOnly(true)}
          title="수강생 2명 이상인 그룹 수업만"
        >
          그룹 수업만
        </button>
        <span className="w-px h-5" style={{ background: "var(--color-line)" }} />
        {/* 기간: 우측 리스트·조회 범위 확장(뷰 기간 대신 사용) */}
        <label className="flex items-center gap-1 text-[12px] text-fg-muted">
          기간
          <input
            type="date"
            className="input h-8 w-[130px]"
            value={period?.from ?? ""}
            onChange={(e) => {
              const from = e.target.value;
              if (!from) return onPeriod(null);
              onPeriod({ from, to: period?.to && period.to >= from ? period.to : from });
            }}
          />
          ~
          <input
            type="date"
            className="input h-8 w-[130px]"
            value={period?.to ?? ""}
            min={period?.from}
            onChange={(e) => {
              const to = e.target.value;
              if (!to || !period) return;
              onPeriod({ from: period.from, to: to >= period.from ? to : period.from });
            }}
            disabled={!period}
          />
          {period && (
            <button className="btn btn-sm h-6 px-1.5" onClick={() => onPeriod(null)} title="기간 해제(뷰 기간으로)">
              ✕
            </button>
          )}
        </label>
      </div>
      {/* 2행: 검색 + 색 기준 + 선택 칩 */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="input h-8 w-56"
          placeholder="검색 (수업·강사·강의실·학생·주제)"
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          색 기준
          <select className="input h-8 w-24" value={colorBy} onChange={(e) => onColorBy(e.target.value as ColorBy)}>
            <option value="subject">과목</option>
            <option value="instructor">강사</option>
            <option value="room">강의실</option>
            <option value="student">학생</option>
          </select>
        </label>
        {chips.map((c) => (
          <span key={`${c.dim}${c.id}`} className="badge inline-flex items-center gap-1">
            {DIM_META[c.dim].icon} {c.name}
            <button className="opacity-70 hover:opacity-100" onClick={() => onToggleId(c.dim, c.id)} aria-label="제거">
              ✕
            </button>
          </span>
        ))}
        {anyFilter && (
          <button className="btn btn-sm" onClick={onClearAll}>
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
}
