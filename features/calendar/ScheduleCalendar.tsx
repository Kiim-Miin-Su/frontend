"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScheduleRow, Room, Conflict, ScheduleResources, ScheduleResource, AvailabilityBlock } from "@/types";
import { api, type SchedulePatchBody } from "@/lib/api";
import { weekDates, weekdayOf, layoutLanes, teachingHours, toMin as toMinD } from "@/lib/domain/schedule";
import { exportScheduleXlsx, exportNodeAsImage } from "@/lib/export";
import { ResourceRail } from "./ResourceRail";
import { AvailabilityPanel } from "./AvailabilityPanel";
import { TableView } from "./TableView";

// ── 그리드 상수 ──
const START_H = 9, END_H = 21, HOUR_H = 46, SNAP = 15;
const GRID_MIN = START_H * 60;
const GRID_H = (END_H - START_H) * HOUR_H;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const PALETTE = ["#0969da", "#1a7f37", "#8250df", "#bf3989", "#9a6700", "#1b7c83"];
const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정", held: "진행", canceled: "취소", no_show: "노쇼", makeup: "보강",
};

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (mm: number) => `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;
const clampMin = (mm: number) => Math.max(GRID_MIN, Math.min(END_H * 60, mm));
const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
// 해당 날짜가 속한 주의 월요일
const mondayOf = (iso: string) => addDaysISO(iso, weekdayOf(iso) === 0 ? -6 : 1 - weekdayOf(iso));
const hashColor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

const startMinOf = (r: ScheduleRow) => toMin(r.startTime ?? "09:00");
const endMinOf = (r: ScheduleRow) => (r.endTime ? toMin(r.endTime) : startMinOf(r) + r.durationMinutes);

type View = "month" | "week" | "day" | "table";
type ColorBy = "subject" | "instructor" | "room" | "student";
type Resizing = { id: number; edge: "top" | "bottom"; startClientY: number; origStart: number; origEnd: number };
type Pending = { row: ScheduleRow; patch: SchedulePatchBody; label: string };

export function ScheduleCalendar() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<{ id: number; start: number; end: number } | null>(null);
  const [msg, setMsg] = useState("");

  // ── 자원(레일)·가용 ──
  const [resources, setResources] = useState<ScheduleResources | null>(null);
  const [selected, setSelected] = useState<ScheduleResource | null>(null);
  const [selBlocks, setSelBlocks] = useState<AvailabilityBlock[]>([]); // 선택 자원의 불가시간(밴드 표시)
  const [showAvail, setShowAvail] = useState(false);

  // 이미지(PNG/JPEG) 내보내기
  const captureRef = useRef<HTMLDivElement>(null);
  const [busyImg, setBusyImg] = useState(false);

  // ── 필터(Lantiv형) ──
  const [q, setQ] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("subject");
  const [fInstructors, setFInstructors] = useState<Set<number>>(new Set());
  const [fSubjects, setFSubjects] = useState<Set<string>>(new Set());
  const [fRooms, setFRooms] = useState<Set<number>>(new Set());
  const [fStudents, setFStudents] = useState<Set<number>>(new Set());
  const [fStatuses, setFStatuses] = useState<Set<string>>(new Set());

  const grabOffsetRef = useRef(0);
  const resizingRef = useRef<Resizing | null>(null);
  const previewRef = useRef<{ id: number; start: number; end: number } | null>(null);

  const weekStart = useMemo(() => mondayOf(anchor), [anchor]);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  // 조회 기간(월/주/일/표). 표는 주간 기준.
  const range = useMemo(() => {
    if (view === "month") {
      const ym = anchor.slice(0, 7);
      const last = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)).getUTCDate();
      return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
    }
    if (view === "day") return { from: anchor, to: anchor };
    return { from: dates[0], to: dates[6] };
  }, [view, anchor, dates]);

  // 선택 자원 → 서버 필터(개인 스케줄)
  const selQuery = useMemo(() => {
    if (!selected) return {};
    if (selected.type === "instructor") return { instructorId: selected.id };
    if (selected.type === "room") return { roomId: selected.id };
    return { studentId: selected.id };
  }, [selected]);

  const load = useCallback(async () => {
    try {
      const [sc, rm] = await Promise.all([
        api.schedule.list({ ...range, ...selQuery }),
        rooms.length ? Promise.resolve(rooms) : api.rooms.list(),
      ]);
      setRows(sc);
      if (!rooms.length) setRooms(rm);
      setMsg("");
    } catch {
      setMsg("백엔드 API에 연결할 수 없습니다. 서버 상태와 API 주소(NEXT_PUBLIC_API_URL) 설정을 확인하세요.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, selQuery]);

  useEffect(() => { load(); }, [load]);

  // 자원 목록(1회)
  useEffect(() => { api.schedule.resources().then(setResources).catch(() => {}); }, []);

  // 선택 자원의 불가시간(밴드)
  useEffect(() => {
    if (!selected) { setSelBlocks([]); return; }
    api.availability.list(selected.type, selected.id).then(setSelBlocks).catch(() => setSelBlocks([]));
  }, [selected]);

  // ── 필터 옵션(현재 조회 데이터에서 추출) ──
  const instructorOpts = useMemo(() => {
    const m = new Map<number, string>();
    rows.forEach((r) => m.set(r.instructorId, r.instructorName));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const subjectOpts = useMemo(() => {
    const m = new Map<string, string>(); // name → color
    rows.forEach((r) => { if (r.subjectName) m.set(r.subjectName, r.color ?? hashColor(r.subjectName)); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const studentOpts = useMemo(() => {
    const m = new Map<number, string>();
    rows.forEach((r) => (r.studentIds ?? []).forEach((id, i) => m.set(id, r.studentNames?.[i] ?? `학생 ${id}`)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // ── 색/라벨 ──
  const colorOf = useCallback((r: ScheduleRow) =>
    colorBy === "subject" ? r.color ?? hashColor(r.subjectName)
      : colorBy === "instructor" ? PALETTE[r.instructorId % PALETTE.length]
        : colorBy === "room" ? rooms.find((x) => x.id === r.roomId)?.color ?? hashColor(r.roomName ?? "—")
          : hashColor((r.studentNames ?? []).join(",") || "—"),
    [colorBy, rooms]);
  const labelOf = useCallback((r: ScheduleRow) =>
    colorBy === "subject" ? r.courseName
      : colorBy === "instructor" ? r.instructorName
        : colorBy === "room" ? r.roomName ?? "—"
          : (r.studentNames ?? []).join(", ") || r.courseName,
    [colorBy]);

  // ── 필터 적용 ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fInstructors.size && !fInstructors.has(r.instructorId)) return false;
      if (fSubjects.size && !fSubjects.has(r.subjectName)) return false;
      if (fRooms.size && !(r.roomId != null && fRooms.has(r.roomId))) return false;
      if (fStudents.size && !(r.studentIds ?? []).some((id) => fStudents.has(id))) return false;
      if (fStatuses.size && !fStatuses.has(r.status)) return false;
      if (needle) {
        const hay = `${r.courseName} ${r.subjectName} ${r.instructorName} ${r.roomName ?? ""} ${(r.studentNames ?? []).join(" ")} ${r.topic ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, fInstructors, fSubjects, fRooms, fStudents, fStatuses]);

  const anyFilter = q.trim() !== "" || fInstructors.size || fSubjects.size || fRooms.size || fStudents.size || fStatuses.size;
  const clearFilters = () => { setQ(""); setFInstructors(new Set()); setFSubjects(new Set()); setFRooms(new Set()); setFStudents(new Set()); setFStatuses(new Set()); };

  const hrs = teachingHours(filtered);

  // 컬럼: week/table=날짜, day=강의실
  const columns: { key: string; label: string; sub?: string; date: string; roomId?: number }[] =
    view === "day"
      ? rooms.map((r) => ({ key: `r${r.id}`, label: r.name, date: anchor, roomId: r.id }))
      : dates.map((d) => ({ key: d, label: WD[weekdayOf(d)], sub: d.slice(5), date: d }));

  const rowsOfColumn = (c: { date: string; roomId?: number }) =>
    filtered.filter((r) => r.sessionDate === c.date && (c.roomId == null || r.roomId === c.roomId));

  // 불가시간(Block) 밴드 — 선택 자원 기준. week=요일 매칭 모든 컬럼, day=룸이면 해당 컬럼만/그 외 전체.
  const bandsOfColumn = (c: { date: string; roomId?: number }): { top: number; h: number }[] => {
    if (!selBlocks.length) return [];
    const wd = weekdayOf(c.date);
    return selBlocks
      .filter((b) => b.kind === "unavailable" && b.weekday === wd &&
        (selected?.type !== "room" || c.roomId == null || c.roomId === selected.id))
      .map((b) => {
        const s = clampMin(toMinD(b.startTime)), e = clampMin(toMinD(b.endTime));
        return { top: ((s - GRID_MIN) / 60) * HOUR_H, h: Math.max(6, ((e - s) / 60) * HOUR_H) };
      });
  };

  // ── PATCH 적용(충돌 시 확인 후 force) ──
  async function applyPatch(id: number, patch: SchedulePatchBody) {
    try {
      const res = await api.schedule.update(id, patch);
      if (res.updated > 1) setMsg(`반복 일정 ${res.updated}건 함께 수정되었습니다.`);
      await load();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        const types = cs.map((c) => `${c.resource ?? ""} ${c.type}`).join(", ");
        if (confirm(`충돌 ${cs.length}건 (${types}).\n그래도 적용할까요?`)) {
          await api.schedule.update(id, { ...patch, force: true });
        }
        await load();
      } else {
        setMsg("수정 실패");
        await load();
      }
    }
  }

  function requestChange(r: ScheduleRow, patch: SchedulePatchBody, label: string) {
    if (r.seriesId != null) setPending({ row: r, patch, label });
    else applyPatch(r.id, patch);
  }

  // 현재 뷰(캘린더/표)를 이미지로 저장
  async function saveImage(type: "png" | "jpeg") {
    if (!captureRef.current) return;
    setBusyImg(true);
    try {
      const label = view === "month" ? anchor.slice(0, 7) : view === "day" ? anchor : `${dates[0]}_${dates[6]}`;
      await exportNodeAsImage(captureRef.current, `schedule_${view}_${label}.${type === "jpeg" ? "jpg" : "png"}`, type);
    } catch {
      setMsg("이미지 내보내기 실패");
    } finally {
      setBusyImg(false);
    }
  }

  // ── 드래그 이동 ──
  const onDragStart = (e: React.DragEvent, r: ScheduleRow) => {
    if (resizingRef.current) { e.preventDefault(); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    grabOffsetRef.current = ((e.clientY - rect.top) / HOUR_H) * 60;
    e.dataTransfer.setData("text/plain", String(r.id));
    e.dataTransfer.effectAllowed = "move";
  };
  const onColumnDrop = (e: React.DragEvent, c: { date: string; roomId?: number }) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const colRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relMin = ((e.clientY - colRect.top) / HOUR_H) * 60 - grabOffsetRef.current;
    const newStart = clampMin(snap(GRID_MIN + relMin));
    if (c.date === r.sessionDate && newStart === startMinOf(r) && (c.roomId ?? r.roomId) === r.roomId) return;
    requestChange(r,
      { sessionDate: c.date, startTime: fromMin(newStart), durationMinutes: r.durationMinutes, roomId: c.roomId ?? r.roomId },
      `${fromMin(newStart)}로 이동`);
  };

  // ── 리사이즈(시작/끝 핸들) ──
  const onResizeMove = (e: PointerEvent) => {
    const rz = resizingRef.current; if (!rz) return;
    const delta = snap(((e.clientY - rz.startClientY) / HOUR_H) * 60);
    let start = rz.origStart, end = rz.origEnd;
    if (rz.edge === "bottom") end = Math.max(rz.origStart + SNAP, clampMin(rz.origEnd + delta));
    else start = Math.min(rz.origEnd - SNAP, clampMin(rz.origStart + delta));
    const pv = { id: rz.id, start, end };
    previewRef.current = pv;
    setPreview(pv);
  };
  const onResizeUp = () => {
    window.removeEventListener("pointermove", onResizeMove);
    const rz = resizingRef.current;
    const pv = previewRef.current;
    resizingRef.current = null;
    previewRef.current = null;
    setPreview(null);
    if (!rz || !pv || pv.id !== rz.id) return;
    if (pv.start === rz.origStart && pv.end === rz.origEnd) return;
    const r = rows.find((x) => x.id === rz.id);
    if (!r) return;
    requestChange(r, { startTime: fromMin(pv.start), endTime: fromMin(pv.end) }, `${fromMin(pv.start)}–${fromMin(pv.end)}로 시간 조정`);
  };
  const onResizeDown = (e: React.PointerEvent, r: ScheduleRow, edge: "top" | "bottom") => {
    e.stopPropagation();
    resizingRef.current = { id: r.id, edge, startClientY: e.clientY, origStart: startMinOf(r), origEnd: endMinOf(r) };
    previewRef.current = { id: r.id, start: startMinOf(r), end: endMinOf(r) };
    setPreview(previewRef.current);
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp, { once: true });
  };

  // ── 기간 이동 ──
  const nav = (dir: number) => {
    if (view === "month") {
      const d = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + dir, 1));
      setAnchor(d.toISOString().slice(0, 10));
    } else setAnchor(addDaysISO(anchor, (view === "day" ? 1 : 7) * dir));
  };
  const periodLabel = view === "month" ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`
    : view === "day" ? anchor : `${dates[0]} ~ ${dates[6]}`;
  const isGrid = view === "week" || view === "day";

  return (
    <div className="p-6 max-w-[1360px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-semibold">스케줄 캘린더</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            드래그 이동 · 끝을 끌어 시간 조절 · 클릭 상세 · {periodLabel}
            <span className="text-fg-subtle"> · {filtered.length}건{anyFilter ? ` / 전체 ${rows.length}` : ""} · 시수 {hrs.hours}h</span>
            {selected && <span className="text-accent"> · {selected.name} 개인 스케줄</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
            {(["month", "week", "day", "table"] as View[]).map((v) => (
              <button key={v} className={`btn btn-sm rounded-none border-0 ${view === v ? "badge-accent" : ""}`} onClick={() => setView(v)}>
                {v === "month" ? "월간" : v === "week" ? "주간" : v === "day" ? "일간(강의실)" : "표"}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => nav(-1)}>◀</button>
          <button className="btn btn-sm" onClick={() => setAnchor(todayISO())}>오늘</button>
          <button className="btn btn-sm" onClick={() => nav(1)}>▶</button>
          {view === "day" && (
            <input type="date" className="input h-7 w-36" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          )}
          {view === "table" && (
            <button className="btn btn-sm btn-primary" disabled={!filtered.length}
              onClick={() => exportScheduleXlsx(filtered, `timetable_${dates[0]}.xlsx`)}>엑셀</button>
          )}
          <button className="btn btn-sm" disabled={busyImg}
            onClick={() => saveImage("png")} title="현재 화면을 PNG로 저장">PNG</button>
          <button className="btn btn-sm" disabled={busyImg}
            onClick={() => saveImage("jpeg")} title="현재 화면을 JPEG로 저장">JPEG</button>
          {selected && <button className="btn btn-sm" onClick={() => setShowAvail(true)}>가용 · 추천</button>}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* 좌측 자원 레일 */}
        <ResourceRail resources={resources} selected={selected} onSelect={setSelected} />

        {/* 본문 */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* ── 필터 바(검색 + 라벨 토글 + 색상기준) ── */}
          <div className="card card-pad space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input h-8 w-56" placeholder="검색 (수업·강사·강의실·학생·주제)" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">색상
                <select className="input h-8 w-24" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
                  <option value="subject">과목</option>
                  <option value="instructor">강사</option>
                  <option value="room">강의실</option>
                  <option value="student">학생</option>
                </select>
              </label>
              {selBlocks.some((b) => b.kind === "unavailable") && (
                <span className="text-[12px] text-fg-subtle inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "var(--color-neutral-subtle)", border: "1px solid var(--color-line)" }} /> 불가시간
                </span>
              )}
              {anyFilter ? <button className="btn btn-sm" onClick={clearFilters}>필터 초기화</button> : null}
            </div>
            <ChipRow label="강사" items={instructorOpts.map(([id, name]) => ({ key: id, label: name, on: fInstructors.has(id) }))}
              onToggle={(k) => setFInstructors(toggle(fInstructors, k as number))} />
            <ChipRow label="과목" items={subjectOpts.map(([name, color]) => ({ key: name, label: name, color, on: fSubjects.has(name) }))}
              onToggle={(k) => setFSubjects(toggle(fSubjects, k as string))} />
            <ChipRow label="학생" items={studentOpts.map(([id, name]) => ({ key: id, label: name, on: fStudents.has(id) }))}
              onToggle={(k) => setFStudents(toggle(fStudents, k as number))} />
            <ChipRow label="강의실" items={rooms.map((r) => ({ key: r.id, label: r.name, color: r.color, on: fRooms.has(r.id) }))}
              onToggle={(k) => setFRooms(toggle(fRooms, k as number))} />
            <ChipRow label="상태" items={Object.keys(STATUS_LABEL).map((s) => ({ key: s, label: STATUS_LABEL[s], on: fStatuses.has(s) }))}
              onToggle={(k) => setFStatuses(toggle(fStatuses, k as string))} />
          </div>

          {msg && <div className="text-[12px] text-danger">{msg}</div>}

          <div ref={captureRef} className="bg-canvas">
          {view === "month" ? (
            <MonthGrid anchor={anchor} rows={filtered} colorOf={colorOf}
              onPick={(r) => setEditing(r)} onPickDay={(d) => { setAnchor(d); setView("day"); }} />
          ) : view === "table" ? (
            <TableView dates={dates} rows={filtered} blocks={selBlocks} colorOf={colorOf} labelOf={labelOf} onPick={(r) => setEditing(r)} />
          ) : (
            <div className="card overflow-x-auto">
              <div className="flex min-w-[760px]">
                {/* 시간 거터 */}
                <div className="shrink-0" style={{ width: 56 }}>
                  <div style={{ height: 34 }} />
                  {Array.from({ length: END_H - START_H }, (_, i) => (
                    <div key={i} className="text-[11px] text-fg-subtle mono text-right pr-2" style={{ height: HOUR_H }}>
                      {pad(START_H + i)}:00
                    </div>
                  ))}
                </div>
                {/* 컬럼들 */}
                <div className="flex-1 flex">
                  {columns.map((c) => {
                    const colRows = rowsOfColumn(c);
                    const sOf = (r: ScheduleRow) => (preview && preview.id === r.id ? preview.start : startMinOf(r));
                    const eOf = (r: ScheduleRow) => (preview && preview.id === r.id ? preview.end : endMinOf(r));
                    const lanes = layoutLanes(colRows.map((r) => ({ id: r.id, start: sOf(r), end: eOf(r) })));
                    const bands = bandsOfColumn(c);
                    return (
                      <div key={c.key} className="flex-1 border-l" style={{ borderColor: "var(--color-line-muted)", minWidth: 90 }}>
                        <div className="text-center text-[12px] font-semibold py-1.5 border-b truncate" style={{ height: 34, borderColor: "var(--color-line)" }}>
                          {c.label}{c.sub && <span className="text-fg-subtle font-normal"> {c.sub}</span>}
                        </div>
                        <div
                          className="relative"
                          style={{
                            height: GRID_H,
                            backgroundImage: `repeating-linear-gradient(var(--color-line-muted) 0 1px, transparent 1px ${HOUR_H}px)`,
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => onColumnDrop(e, c)}
                        >
                          {/* 불가시간 밴드 */}
                          {bands.map((b, i) => (
                            <div key={`b${i}`} className="absolute left-0 right-0 pointer-events-none"
                              style={{ top: b.top, height: b.h, background: "repeating-linear-gradient(45deg, rgba(110,118,129,.18) 0 6px, rgba(110,118,129,.30) 6px 12px)" }} />
                          ))}
                          {colRows.map((r) => {
                            const s = sOf(r), en = eOf(r);
                            const top = ((s - GRID_MIN) / 60) * HOUR_H;
                            const h = Math.max(18, ((en - s) / 60) * HOUR_H);
                            const ln = lanes[r.id] ?? { lane: 0, lanes: 1 };
                            const wPct = 100 / ln.lanes;
                            return (
                              <div
                                key={r.id}
                                draggable
                                onDragStart={(e) => onDragStart(e, r)}
                                onClick={() => setEditing(r)}
                                title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"}${r.studentNames?.length ? " · " + r.studentNames.join(", ") : ""}`}
                                className="absolute rounded text-white text-[10px] leading-tight px-1 py-0.5 cursor-grab overflow-hidden ring-1 ring-white/30"
                                style={{ top, height: h, left: `calc(${ln.lane * wPct}% + 1px)`, width: `calc(${wPct}% - 2px)`, background: colorOf(r) }}
                              >
                                <div onPointerDown={(e) => onResizeDown(e, r, "top")} className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize" />
                                <div className="font-semibold truncate">{fromMin(s)} {labelOf(r)}</div>
                                <div className="opacity-90 truncate">{view === "week" ? (r.roomName ?? "") : r.instructorName}</div>
                                <div onPointerDown={(e) => onResizeDown(e, r, "bottom")} className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          </div>
          {isGrid && selected?.type === "instructor" && (
            <p className="text-[12px] text-fg-subtle">개인 스케줄: {selected.name} · {filtered.length}개 수업 · 시수 {hrs.hours}h</p>
          )}
        </div>
      </div>

      {editing && (
        <DetailModal
          row={editing}
          rooms={rooms}
          colorOf={colorOf}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { setEditing(null); await applyPatch(editing.id, patch); }}
        />
      )}

      {pending && (
        <RecurrencePrompt
          label={pending.label}
          onCancel={() => { setPending(null); load(); }}
          onPick={(scope) => { const p = pending; setPending(null); applyPatch(p.row.id, { ...p.patch, scope }); }}
        />
      )}

      {showAvail && selected && resources && (
        <AvailabilityPanel
          selected={selected}
          resources={resources}
          weekStart={weekStart}
          sessions={rows}
          onClose={() => setShowAvail(false)}
          onChanged={() => { load(); if (selected) api.availability.list(selected.type, selected.id).then(setSelBlocks).catch(() => {}); }}
        />
      )}
    </div>
  );
}

function toggle<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  next.has(key) ? next.delete(key) : next.add(key);
  return next;
}

function ChipRow({ label, items, onToggle }: {
  label: string;
  items: { key: string | number; label: string; color?: string; on: boolean }[];
  onToggle: (key: string | number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-[12px] font-medium text-fg-muted w-12 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button key={it.key} onClick={() => onToggle(it.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[12px] ${it.on ? "font-semibold" : "text-fg-muted"}`}
            style={{
              borderColor: it.on ? (it.color ?? "var(--color-accent)") : "var(--color-line)",
              background: it.on ? (it.color ? `${it.color}1a` : "var(--color-accent-subtle)") : "transparent",
            }}>
            {it.color && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: it.color }} />}
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 월간 그리드 ──
function MonthGrid({ anchor, rows, colorOf, onPick, onPickDay }: {
  anchor: string; rows: ScheduleRow[]; colorOf: (r: ScheduleRow) => string;
  onPick: (r: ScheduleRow) => void; onPickDay: (date: string) => void;
}) {
  const ym = anchor.slice(0, 7);
  const firstWd = weekdayOf(`${ym}-01`);
  const last = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(firstWd).fill(null),
    ...Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`),
  ];
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    rows.forEach((r) => { const a = m.get(r.sessionDate) ?? []; a.push(r); m.set(r.sessionDate, a); });
    m.forEach((a) => a.sort((x, y) => (x.startTime ?? "").localeCompare(y.startTime ?? "")));
    return m;
  }, [rows]);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--color-line)" }}>
        {WD.map((w, i) => (
          <div key={w} className={`px-3 py-2 text-[12px] font-semibold ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-fg-muted"}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, idx) => (
          <div key={idx} className="min-h-[104px] border-b border-r p-1.5" style={{ borderColor: "var(--color-line-muted)" }}>
            {date && (
              <button className={`text-[12px] mb-1 px-1 rounded hover:bg-canvas-subtle ${date === todayISO() ? "font-bold text-accent" : "text-fg-subtle"}`}
                onClick={() => onPickDay(date)} title="일간 보기">
                {Number(date.slice(8))}
              </button>
            )}
            <div className="space-y-1">
              {(date ? byDay.get(date) ?? [] : []).slice(0, 4).map((r) => (
                <button key={r.id} onClick={() => onPick(r)}
                  className="block w-full text-left rounded px-1.5 py-0.5 text-[11px] text-white truncate"
                  style={{ background: colorOf(r) }} title={`${r.startTime ?? ""} ${r.courseName} · ${r.instructorName}`}>
                  <span className="mono">{r.startTime ?? ""}</span> {r.courseName}
                </button>
              ))}
              {date && (byDay.get(date)?.length ?? 0) > 4 && (
                <button className="text-[11px] text-fg-muted hover:underline px-1" onClick={() => onPickDay(date)}>
                  +{(byDay.get(date)?.length ?? 0) - 4} 더보기
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 상세 + 편집 모달 ──
function DetailModal({ row, rooms, colorOf, onClose, onSave }: {
  row: ScheduleRow; rooms: Room[]; colorOf: (r: ScheduleRow) => string;
  onClose: () => void; onSave: (patch: SchedulePatchBody) => void;
}) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const [date, setDate] = useState(row.sessionDate);
  const [start, setStart] = useState(row.startTime ?? "16:00");
  const [end, setEnd] = useState(row.endTime ?? fromMin(toMin(row.startTime ?? "16:00") + row.durationMinutes));
  const [roomId, setRoomId] = useState<number | "">(row.roomId ?? "");
  const [status, setStatus] = useState(row.status);
  const [scope, setScope] = useState<"this" | "this_and_following" | "all">("this");
  const isSeries = row.seriesId != null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[440px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <span className="inline-block w-3 h-3 rounded-sm mt-1.5 shrink-0" style={{ background: colorOf(row) }} />
          <div className="flex-1">
            <div className="font-semibold">{row.courseName}</div>
            <div className="text-fg-subtle text-[12px]">{row.subjectName} · {row.instructorName}{row.studentNames?.length ? ` · ${row.studentNames.join(", ")}` : ""}</div>
          </div>
          {isSeries && <span className="badge badge-accent">반복</span>}
        </div>

        {mode === "detail" ? (
          <>
            <dl className="grid grid-cols-[64px_1fr] gap-y-1.5 text-[13px]">
              <Dt>날짜</Dt><dd>{row.sessionDate} ({WD[weekdayOf(row.sessionDate)]})</dd>
              <Dt>시간</Dt><dd className="mono">{row.startTime ?? "-"} – {row.endTime ?? "-"} ({row.durationMinutes}분)</dd>
              <Dt>강의실</Dt><dd>{row.roomName ?? "미지정"}</dd>
              <Dt>학생</Dt><dd>{row.studentNames?.length ? row.studentNames.join(", ") : "—"}</dd>
              <Dt>상태</Dt><dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
              {row.topic && (<><Dt>주제</Dt><dd>{row.topic}</dd></>)}
            </dl>
            <div className="flex justify-between gap-2 pt-1">
              <Link href={`/sessions/${row.id}`} className="btn btn-sm">강의 상세 페이지 →</Link>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={onClose}>닫기</button>
                <button className="btn btn-sm btn-primary" onClick={() => setMode("edit")}>편집</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="날짜"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작"><input type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="종료"><input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            </div>
            <Field label="강의실">
              <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">미지정</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="상태">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ScheduleRow["status"])}>
                {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            {isSeries && (
              <Field label="반복 적용 범위">
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                  <option value="this">이 일정만</option>
                  <option value="this_and_following">이 일정 및 이후 전부</option>
                  <option value="all">시리즈 전체</option>
                </select>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn" onClick={() => setMode("detail")}>취소</button>
              <button className="btn btn-primary"
                onClick={() => onSave({ sessionDate: date, startTime: start, endTime: end, roomId: roomId || undefined, status, scope: isSeries ? scope : undefined })}>
                저장
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 반복 일정 변경 범위 묻기(드래그·리사이즈 후) ──
function RecurrencePrompt({ label, onPick, onCancel }: {
  label: string; onPick: (scope: "this" | "this_and_following" | "all") => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onCancel}>
      <div className="card card-pad w-[360px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">반복 일정 수정</div>
        <p className="text-[13px] text-fg-muted">{label} — 어디까지 적용할까요?</p>
        <div className="grid gap-2">
          <button className="btn" onClick={() => onPick("this")}>이 일정만</button>
          <button className="btn" onClick={() => onPick("this_and_following")}>이 일정 및 이후 전부</button>
          <button className="btn" onClick={() => onPick("all")}>시리즈 전체</button>
        </div>
        <div className="flex justify-end pt-1"><button className="btn btn-sm" onClick={onCancel}>취소</button></div>
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-fg-muted">{children}</dt>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
