"use client";
// [참조/처리] 스플릿 표 1개 — **독립 컴포넌트**(Lantiv 창 분할 대응, 피드백 2026-07-02).
//  각 표가 자체 리소스 선택(차원: 강사/학생/강의실 + 다중 체크 팝오버)을 가진다 —
//  예: 왼쪽 표=강사 3명, 오른쪽 표=학생 3명을 나란히 보며 배치.
//  세션 데이터·그리드 상호작용(드래그·커서·복제·밴드)은 부모(ScheduleCalendar)가 children으로 주입
//  — 표가 몇 개든 로직은 renderTimeGrid 단일 소스(함수 통일).
import type { ScheduleResources, Room } from "@/types";
import type { SplitDim } from "@/lib/domain/lantiv";
import { MultiPick, type FilterDim } from "./CalendarFilterBar";

export type SplitPaneDef = { uid: number; dim: SplitDim; ids: number[] };

const DIM_LABEL: Record<SplitDim, string> = { instructor: "강사", student: "학생", room: "강의실" };

export function CalendarSplitPane({
  pane, resources, rooms, onChange, onRemove, children,
}: {
  pane: SplitPaneDef;
  resources: ScheduleResources | null;
  rooms: Room[];
  onChange: (patch: Partial<SplitPaneDef>) => void;
  onRemove: () => void;
  children: React.ReactNode; // 부모가 renderTimeGrid(colsFor(pane))로 주입한 그리드
}) {
  const options =
    pane.dim === "instructor"
      ? (resources?.instructors ?? []).map((r) => ({ id: Number(r.id), name: r.name, color: r.color, sub: r.sub }))
      : pane.dim === "student"
        ? (resources?.students ?? []).map((r) => ({ id: Number(r.id), name: r.name, color: r.color, sub: r.sub }))
        : rooms.map((r) => ({ id: Number(r.id), name: r.name, color: r.color }));
  const picked = new Set(pane.ids);
  const names = pane.ids
    .map((id) => options.find((o) => o.id === id)?.name ?? `#${id}`)
    .join(", ");

  return (
    <div className="flex-1 min-w-[320px]">
      {/* 표 헤더: 차원 선택 + 리소스 다중 체크(표별 독립 필터) + 제거 */}
      <div className="flex items-center gap-1.5 mb-1 px-0.5">
        <select
          className="input h-7 w-[76px] text-[12px]"
          value={pane.dim}
          onChange={(e) => onChange({ dim: e.target.value as SplitDim, ids: [] })}
          title="이 표의 기준(강사/학생/강의실)"
        >
          {(Object.keys(DIM_LABEL) as SplitDim[]).map((d) => (
            <option key={d} value={d}>{DIM_LABEL[d]}</option>
          ))}
        </select>
        <MultiPick
          dim={pane.dim as FilterDim}
          options={options}
          picked={picked}
          onToggle={(id) =>
            onChange({ ids: picked.has(id) ? pane.ids.filter((x) => x !== id) : [...pane.ids, id] })
          }
          onClear={() => onChange({ ids: [] })}
        />
        <span className="text-[12px] text-fg-muted truncate flex-1" title={names}>
          {names || `${DIM_LABEL[pane.dim]}을 선택하세요`}
        </span>
        <button className="btn btn-sm h-6 px-1.5" onClick={onRemove} title="이 표 닫기">✕</button>
      </div>
      {pane.ids.length === 0 ? (
        <div className="card grid place-items-center text-[13px] text-fg-subtle" style={{ height: 200 }}>
          위에서 {DIM_LABEL[pane.dim]}을 선택하면 시간표가 표시됩니다.
        </div>
      ) : (
        children
      )}
    </div>
  );
}
