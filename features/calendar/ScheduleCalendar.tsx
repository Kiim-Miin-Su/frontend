"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScheduleRow, Room, Conflict, ScheduleResources, ScheduleResource, AvailabilityBlock } from "@/types";
import { api, type SchedulePatchBody, type ScheduleCreateBody, type AvailabilityUpsertBody } from "@/lib/api";
import { weekDates, weekdayOf, layoutLanes, teachingHours, toMin as toMinD } from "@/lib/domain/schedule";
import { exportScheduleXlsx, exportNodeAsImage } from "@/lib/export";
import { useTacoStore } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import { StudentMatchPanel } from "./StudentMatchPanel";
import { ResourcePanel } from "./ResourcePanel";
import { TableView } from "./TableView";

// ── 그리드 상수 (애플/구글 캘린더 스타일: 넓고 시간 단위가 또렷하게) ──
const START_H = 8,
  END_H = 22,
  HOUR_H = 60,
  SNAP = 15;
const HEADER_H = 52; // 요일/강의실 헤더 높이
const GUTTER_W = 64; // 시간 거터 너비
const COL_MIN = 128; // 컬럼 최소 너비
const GRID_MIN = START_H * 60;
const GRID_H = (END_H - START_H) * HOUR_H;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const PALETTE = ["#0969da", "#1a7f37", "#8250df", "#bf3989", "#9a6700", "#1b7c83"];
const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  held: "진행",
  canceled: "취소",
  no_show: "노쇼",
  makeup: "보강",
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (mm: number) => `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;
const clampMin = (mm: number) => Math.max(GRID_MIN, Math.min(END_H * 60, mm));
const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
  const [selEvent, setSelEvent] = useState<number | null>(null); // 단일 클릭 선택(애플식 — 리사이즈 핸들 노출)
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<{ id: number; start: number; end: number } | null>(null);
  const [msg, setMsg] = useState("");

  // ── 자원(레일)·가용 ──
  const [resources, setResources] = useState<ScheduleResources | null>(null);
  const [selected, setSelected] = useState<ScheduleResource | null>(null);
  const [selBlocks, setSelBlocks] = useState<AvailabilityBlock[]>([]); // 선택 자원의 불가시간(밴드 표시)

  // 이미지(PNG/JPEG) 내보내기
  const captureRef = useRef<HTMLDivElement>(null);
  const [busyImg, setBusyImg] = useState(false);

  // 관리자(데모 역할) — 스케줄 직접 추가
  const role = useTacoStore((s) => s.currentRole);
  const canManage = isAdmin(role); // 대표/매니저/관리자 — 모든 스케줄 추가
  const isInstructor = role === "instructor"; // 강사 — 본인 스케줄만 추가
  // 데모 본인 강사 식별(실제로는 JWT sub) — 사이드바와 동일하게 첫 강사를 '나'로 간주
  const myInstructorId = isInstructor ? resources?.instructors[0]?.id : undefined;
  const canAdd = canManage || (isInstructor && myInstructorId != null);
  const [creating, setCreating] = useState<{ date: string } | null>(null);

  // ── 필터(Lantiv형) ──
  const [q, setQ] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("subject");
  const [fInstructors, setFInstructors] = useState<Set<number>>(new Set());
  const [fSubjects, setFSubjects] = useState<Set<string>>(new Set());
  const [fRooms, setFRooms] = useState<Set<number>>(new Set());
  const [fStudents, setFStudents] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    load();
  }, [load]);

  // 자원 목록(1회)
  useEffect(() => {
    api.schedule
      .resources()
      .then(setResources)
      .catch(() => {});
  }, []);

  // 선택 자원의 불가시간(밴드)
  useEffect(() => {
    if (!selected) {
      setSelBlocks([]);
      return;
    }
    api.availability
      .list(selected.type, selected.id)
      .then(setSelBlocks)
      .catch(() => setSelBlocks([]));
  }, [selected]);

  // ── 색/라벨 ──
  const colorOf = useCallback(
    (r: ScheduleRow) =>
      colorBy === "subject"
        ? (r.color ?? hashColor(r.subjectName))
        : colorBy === "instructor"
          ? PALETTE[r.instructorId % PALETTE.length]
          : colorBy === "room"
            ? (rooms.find((x) => x.id === r.roomId)?.color ?? hashColor(r.roomName ?? "—"))
            : hashColor((r.studentNames ?? []).join(",") || "—"),
    [colorBy, rooms],
  );
  const labelOf = useCallback(
    (r: ScheduleRow) =>
      colorBy === "subject"
        ? r.courseName
        : colorBy === "instructor"
          ? r.instructorName
          : colorBy === "room"
            ? (r.roomName ?? "—")
            : (r.studentNames ?? []).join(", ") || r.courseName,
    [colorBy],
  );

  // ── 필터 적용 ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fInstructors.size && !fInstructors.has(r.instructorId)) return false;
      if (fSubjects.size && !fSubjects.has(r.subjectName)) return false;
      if (fRooms.size && !(r.roomId != null && fRooms.has(r.roomId))) return false;
      if (fStudents.size && !(r.studentIds ?? []).some((id) => fStudents.has(id))) return false;
      if (needle) {
        const hay =
          `${r.courseName} ${r.subjectName} ${r.instructorName} ${r.roomName ?? ""} ${(r.studentNames ?? []).join(" ")} ${r.topic ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, fInstructors, fSubjects, fRooms, fStudents]);

  const anyFilter = q.trim() !== "" || fInstructors.size || fSubjects.size || fRooms.size || fStudents.size;
  const clearFilters = () => {
    setQ("");
    setFInstructors(new Set());
    setFSubjects(new Set());
    setFRooms(new Set());
    setFStudents(new Set());
  };

  const hrs = teachingHours(filtered);

  // 컬럼: week/table=날짜, day=강의실
  const columns: { key: string; label: string; sub?: string; date: string; roomId?: number }[] =
    view === "day"
      ? rooms.map((r) => ({ key: `r${r.id}`, label: r.name, date: anchor, roomId: r.id }))
      : dates.map((d) => ({ key: d, label: WD[weekdayOf(d)], sub: d.slice(5), date: d }));

  const rowsOfColumn = (c: { date: string; roomId?: number }) =>
    filtered.filter((r) => r.sessionDate === c.date && (c.roomId == null || r.roomId === c.roomId));

  // 가용/불가(Block) 밴드 — 선택 자원 기준. week=요일 매칭 모든 컬럼, day=룸이면 해당 컬럼만/그 외 전체.
  const bandsOfColumn = (c: { date: string; roomId?: number }): { id: number; kind: string; startMin: number; endMin: number; top: number; h: number }[] => {
    if (!selBlocks.length) return [];
    const wd = weekdayOf(c.date);
    return selBlocks
      .filter(
        (b) => b.weekday === wd && (selected?.type !== "room" || c.roomId == null || c.roomId === selected.id),
      )
      .map((b) => {
        const s = clampMin(toMinD(b.startTime)),
          e = clampMin(toMinD(b.endTime));
        return { id: b.id, kind: b.kind, startMin: s, endMin: e, top: ((s - GRID_MIN) / 60) * HOUR_H, h: Math.max(6, ((e - s) / 60) * HOUR_H) };
      });
  };

  // ── 가용/불가(Block) — 밴드 표시 + 클릭 삭제. 생성은 "스케줄 추가" 모달의 '가용·불가' 탭에서. ──
  const reloadSelBlocks = useCallback(() => {
    if (selected) api.availability.list(selected.type, selected.id).then(setSelBlocks).catch(() => {});
  }, [selected]);

  // 가용/불가 블록 생성(모달에서 호출)
  async function createBlock(body: AvailabilityUpsertBody) {
    try {
      await api.availability.upsert(body);
      setCreating(null);
      if (selected && selected.type === body.ownerType && selected.id === body.ownerId) reloadSelBlocks();
    } catch {
      setMsg("가용/불가 저장 실패");
    }
  }
  async function deleteBlock(id: number) {
    if (!confirm("이 시간 블록을 삭제할까요?")) return;
    try { await api.availability.remove(id); reloadSelBlocks(); } catch { setMsg("삭제 실패"); }
  }

  // ── 불가/가용 밴드를 스케줄처럼 관리: 클릭=선택 · 끝 드래그=리사이즈 · ✕=삭제 ──
  const [selBand, setSelBand] = useState<number | null>(null);
  const [bDraft, setBDraft] = useState<{ colKey: string; start: number; end: number; kind: string } | null>(null);
  const bDragRef = useRef<{
    colKey: string; date: string; kind: AvailabilityBlock["kind"]; id: number; edge: "top" | "bottom";
    startClientY: number; origStart: number; origEnd: number; start: number; end: number;
  } | null>(null);

  const bMove = (e: PointerEvent) => {
    const d = bDragRef.current; if (!d) return;
    const delta = snap(((e.clientY - d.startClientY) / HOUR_H) * 60);
    if (d.edge === "top") d.start = Math.min(d.origEnd - SNAP, clampMin(d.origStart + delta));
    else d.end = Math.max(d.origStart + SNAP, clampMin(d.origEnd + delta));
    setBDraft({ colKey: d.colKey, start: d.start, end: d.end, kind: d.kind });
  };
  const bUp = () => {
    window.removeEventListener("pointermove", bMove);
    const d = bDragRef.current; bDragRef.current = null; setBDraft(null);
    if (!d || !selected || d.end <= d.start) return;
    if (d.start === d.origStart && d.end === d.origEnd) return;
    createBlock({
      id: d.id, ownerType: selected.type, ownerId: selected.id, kind: d.kind,
      weekday: weekdayOf(d.date), startTime: fromMin(d.start), endTime: fromMin(d.end),
    });
  };
  const bDownResize = (e: React.PointerEvent, c: { key: string; date: string }, b: { id: number; kind: string; startMin: number; endMin: number }, edge: "top" | "bottom") => {
    e.stopPropagation();
    bDragRef.current = {
      colKey: c.key, date: c.date, kind: b.kind as AvailabilityBlock["kind"], id: b.id, edge,
      startClientY: e.clientY, origStart: b.startMin, origEnd: b.endMin, start: b.startMin, end: b.endMin,
    };
    setBDraft({ colKey: c.key, start: b.startMin, end: b.endMin, kind: b.kind });
    window.addEventListener("pointermove", bMove);
    window.addEventListener("pointerup", bUp, { once: true });
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

  // 세션 생성(추가). 강사는 본인(myInstructorId)으로 강제 — 권한 게이팅(데모; 실제는 백엔드 가드).
  async function createSession(body: ScheduleCreateBody) {
    const safe: ScheduleCreateBody = isInstructor && myInstructorId != null ? { ...body, instructorId: myInstructorId } : body;
    try {
      await api.schedule.create(safe);
      setCreating(null);
      await load();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        if (confirm(`충돌 ${cs.length}건. 그래도 추가할까요?`)) {
          await api.schedule.create({ ...safe, force: true });
          setCreating(null);
          await load();
        }
      } else setMsg("스케줄 추가 실패");
    }
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

  // ── 드래그 이동(포인터 기반 라이브 프리뷰, 30분 스냅 — 구글/애플 캘린더식) ──
  const SNAP_MOVE = 30;
  const snapMove = (m: number) => Math.round(m / SNAP_MOVE) * SNAP_MOVE;
  const [moveDrag, setMoveDrag] = useState<{ id: number; colKey: string; start: number; dur: number; color: string } | null>(null);
  const moveRef = useRef<{
    id: number; row: ScheduleRow; dur: number; grab: number; startClientY: number; moved: boolean;
    colKey: string; date: string; roomId?: number; start: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const onMovePointer = (e: PointerEvent) => {
    const d = moveRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.startClientY) < 4) return;
    d.moved = true;
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-colcell]");
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const start = clampMin(snapMove(GRID_MIN + ((e.clientY - rect.top) / HOUR_H) * 60 - d.grab));
    d.colKey = cell.dataset.colkey ?? d.colKey;
    d.date = cell.dataset.date ?? d.date;
    d.roomId = cell.dataset.roomid ? Number(cell.dataset.roomid) : undefined;
    d.start = start;
    setMoveDrag({ id: d.id, colKey: d.colKey, start, dur: d.dur, color: colorOf(d.row) });
  };
  const onMoveUp = () => {
    window.removeEventListener("pointermove", onMovePointer);
    const d = moveRef.current;
    moveRef.current = null;
    setMoveDrag(null);
    if (!d || !d.moved) return;
    suppressClickRef.current = true;
    const r = d.row;
    const newRoom = d.roomId ?? r.roomId;
    if (d.date === r.sessionDate && d.start === startMinOf(r) && newRoom === r.roomId) return;
    requestChange(
      r,
      { sessionDate: d.date, startTime: fromMin(d.start), durationMinutes: d.dur, roomId: newRoom },
      `${fromMin(d.start)}로 이동`,
    );
  };
  const onEventDown = (e: React.PointerEvent, r: ScheduleRow) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grab = ((e.clientY - rect.top) / HOUR_H) * 60;
    moveRef.current = {
      id: r.id, row: r, dur: r.durationMinutes, grab, startClientY: e.clientY, moved: false,
      colKey: "", date: r.sessionDate, roomId: r.roomId, start: startMinOf(r),
    };
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", onMoveUp, { once: true });
  };

  // ── 리사이즈(시작/끝 핸들) ──
  const onResizeMove = (e: PointerEvent) => {
    const rz = resizingRef.current;
    if (!rz) return;
    const delta = snap(((e.clientY - rz.startClientY) / HOUR_H) * 60);
    let start = rz.origStart,
      end = rz.origEnd;
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
    requestChange(
      r,
      { startTime: fromMin(pv.start), endTime: fromMin(pv.end) },
      `${fromMin(pv.start)}–${fromMin(pv.end)}로 시간 조정`,
    );
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
  const periodLabel =
    view === "month"
      ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`
      : view === "day"
        ? anchor
        : `${dates[0]} ~ ${dates[6]}`;
  const isGrid = view === "week" || view === "day";
  // 현재 시각 인디케이터(빨간 선)용 — 오늘 컬럼에 표시
  const _now = new Date();
  const nowMin = _now.getHours() * 60 + _now.getMinutes();
  const nowTop = ((nowMin - GRID_MIN) / 60) * HOUR_H;
  const showNow = nowMin >= GRID_MIN && nowMin <= END_H * 60;

  return (
    <div className="p-6 max-w-[1360px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-semibold">스케줄 캘린더</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            드래그 이동 · 끝을 끌어 시간 조절 · 클릭 상세 · {periodLabel}
            <span className="text-fg-subtle">
              {" "}
              · {filtered.length}건{anyFilter ? ` / 전체 ${rows.length}` : ""} · 시수 {hrs.hours}h
            </span>
            {selected && <span className="text-accent"> · {selected.name} 개인 스케줄</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
            {(["month", "week", "day", "table"] as View[]).map((v) => (
              <button
                key={v}
                className={`btn btn-sm rounded-none border-0 ${view === v ? "badge-accent" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "month" ? "월간" : v === "week" ? "주간" : v === "day" ? "일간(강의실)" : "표"}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => nav(-1)}>
            ◀
          </button>
          <button className="btn btn-sm" onClick={() => setAnchor(todayISO())}>
            오늘
          </button>
          <button className="btn btn-sm" onClick={() => nav(1)}>
            ▶
          </button>
          {view === "day" && (
            <input type="date" className="input h-7 w-36" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          )}
          {canAdd && resources && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setCreating({ date: view === "day" ? anchor : (dates.find((d) => d === todayISO()) ?? dates[0]) })}
            >
              + 스케줄 추가{isInstructor ? " (내 수업)" : ""}
            </button>
          )}
          {view === "table" && (
            <button
              className="btn btn-sm btn-primary"
              disabled={!filtered.length}
              onClick={() => exportScheduleXlsx(filtered, `timetable_${dates[0]}.xlsx`)}
            >
              엑셀
            </button>
          )}
          <button className="btn btn-sm" disabled={busyImg} onClick={() => saveImage("png")} title="현재 화면을 PNG로 저장">
            PNG
          </button>
          <button className="btn btn-sm" disabled={busyImg} onClick={() => saveImage("jpeg")} title="현재 화면을 JPEG로 저장">
            JPEG
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* 좌측: 학생 → 강사 추천(오른쪽에서 고른 학생 기준) */}
        {resources && (
          <StudentMatchPanel
            resources={resources}
            weekStart={weekStart}
            sessions={rows}
            selected={selected}
            onAssign={createSession}
          />
        )}

        {/* 본문 */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* ── 필터 바(검색 + 라벨 토글 + 색상기준) ── */}
          <div className="card card-pad space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="input h-8 w-56"
                placeholder="검색 (수업·강사·강의실·학생·주제)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                {" "}
                기준
                <select className="input h-8 w-24" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
                  <option value="subject">과목</option>
                  <option value="instructor">강사</option>
                  <option value="room">강의실</option>
                  <option value="student">학생</option>
                </select>
              </label>
              {selected && selBlocks.length > 0 && (
                <span className="text-[12px] text-fg-subtle inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(26,127,55,.18)", borderLeft: "2px solid var(--color-success)" }} /> 가용
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg, rgba(110,118,129,.18) 0 3px, rgba(110,118,129,.3) 3px 6px)" }} /> 불가
                  </span>
                </span>
              )}
              {selected && selBlocks.length > 0 && <span className="text-[12px] text-fg-subtle">밴드 클릭=선택 · 끝 드래그=시간 조절 · ✕=삭제</span>}
              {anyFilter ? (
                <button className="btn btn-sm" onClick={clearFilters}>
                  필터 초기화
                </button>
              ) : null}
            </div>
          </div>

          {msg && <div className="text-[12px] text-danger">{msg}</div>}

          <div ref={captureRef} className="bg-canvas">
            {view === "month" ? (
              <MonthGrid
                anchor={anchor}
                rows={filtered}
                colorOf={colorOf}
                onPick={(r) => setEditing(r)}
                onPickDay={(d) => {
                  setAnchor(d);
                  setView("day");
                }}
              />
            ) : view === "table" ? (
              <TableView
                dates={dates}
                rows={filtered}
                blocks={selBlocks}
                colorOf={colorOf}
                labelOf={labelOf}
                onPick={(r) => setEditing(r)}
              />
            ) : (
              <div className="card overflow-x-auto">
                <div className="flex" style={{ minWidth: GUTTER_W + columns.length * COL_MIN }}>
                  {/* 시간 거터 */}
                  <div className="shrink-0 sticky left-0 z-10 bg-canvas" style={{ width: GUTTER_W }}>
                    <div style={{ height: HEADER_H }} />
                    <div className="relative" style={{ height: GRID_H }}>
                      {Array.from({ length: END_H - START_H + 1 }, (_, i) => (
                        <span
                          key={i}
                          className="absolute right-2 text-[11px] text-fg-subtle mono"
                          style={{ top: i * HOUR_H - 7 }}
                        >
                          {i < END_H - START_H ? `${pad(START_H + i)}:00` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* 컬럼들 */}
                  <div className="flex-1 flex">
                    {columns.map((c) => {
                      const colRows = rowsOfColumn(c);
                      const sOf = (r: ScheduleRow) => (preview && preview.id === r.id ? preview.start : startMinOf(r));
                      const eOf = (r: ScheduleRow) => (preview && preview.id === r.id ? preview.end : endMinOf(r));
                      const lanes = layoutLanes(colRows.map((r) => ({ id: r.id, start: sOf(r), end: eOf(r) })));
                      const bands = bandsOfColumn(c);
                      const isToday = c.date === todayISO();
                      return (
                        <div
                          key={c.key}
                          className="flex-1 border-l"
                          style={{ borderColor: "var(--color-line-muted)", minWidth: COL_MIN }}
                        >
                          {/* 헤더: 주간=요일+날짜(오늘 강조), 일간=강의실 */}
                          <div
                            className="flex flex-col items-center justify-center gap-0.5 border-b"
                            style={{ height: HEADER_H, borderColor: "var(--color-line)" }}
                          >
                            {view === "week" ? (
                              <>
                                <span className={`text-[11px] ${isToday ? "text-accent font-semibold" : "text-fg-subtle"}`}>
                                  {c.label}
                                </span>
                                <span
                                  className={`grid place-items-center text-[15px] font-semibold rounded-full ${isToday ? "text-white" : "text-fg"}`}
                                  style={{ width: 28, height: 28, background: isToday ? "var(--color-accent)" : "transparent" }}
                                >
                                  {Number(c.date.slice(8))}
                                </span>
                              </>
                            ) : (
                              <span className="text-[13px] font-semibold truncate px-1">{c.label}</span>
                            )}
                          </div>
                          <div
                            className="relative"
                            data-colcell
                            data-colkey={c.key}
                            data-date={c.date}
                            data-roomid={c.roomId ?? ""}
                            style={{
                              height: GRID_H,
                              backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0, var(--color-line) 1px, transparent 1px, transparent ${HOUR_H}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_H / 2}px, var(--color-line-muted) ${HOUR_H / 2}px, var(--color-line-muted) ${HOUR_H / 2 + 1}px, transparent ${HOUR_H / 2 + 1}px, transparent ${HOUR_H}px)`,
                            }}
                            onClick={(e) => { if (e.target === e.currentTarget) { setSelEvent(null); setSelBand(null); } }}
                          >
                            {/* 가용(초록)/불가(회색) 밴드 — 클릭=선택 · 끝 드래그=시간 조절 · ✕=삭제 (스케줄처럼 관리) */}
                            {bands.map((b) => {
                              const on = selBand === b.id;
                              return (
                              <div
                                key={`b${b.id}`}
                                onClick={(e) => { if (selected) { e.stopPropagation(); setSelBand(on ? null : b.id); setSelEvent(null); } }}
                                title={b.kind === "unavailable" ? "불가시간 — 클릭 선택" : "가용시간 — 클릭 선택"}
                                className={`absolute left-0 right-0 ${selected ? "cursor-pointer" : "pointer-events-none"}`}
                                style={
                                  b.kind === "unavailable"
                                    ? {
                                        top: b.top, height: b.h,
                                        background:
                                          "repeating-linear-gradient(45deg, rgba(110,118,129,.16) 0 6px, rgba(110,118,129,.28) 6px 12px)",
                                        outline: on ? "2px solid var(--color-fg-muted)" : undefined,
                                      }
                                    : {
                                        top: b.top, height: b.h,
                                        background: "rgba(26,127,55,.10)",
                                        borderLeft: "2px solid var(--color-success)",
                                        outline: on ? "2px solid var(--color-success)" : undefined,
                                      }
                                }
                              >
                                {on && (
                                  <>
                                    <div onPointerDown={(e) => bDownResize(e, c, b, "top")} className="absolute left-1/2 -translate-x-1/2 top-0 w-6 h-2 rounded-b cursor-ns-resize" style={{ background: "var(--color-fg-muted)" }} />
                                    <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }} className="absolute right-0.5 top-0.5 w-4 h-4 grid place-items-center rounded text-[10px] text-white" style={{ background: "var(--color-danger)" }} title="삭제">✕</button>
                                    <div onPointerDown={(e) => bDownResize(e, c, b, "bottom")} className="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-2 rounded-t cursor-ns-resize" style={{ background: "var(--color-fg-muted)" }} />
                                  </>
                                )}
                              </div>
                              );
                            })}
                            {/* 밴드 리사이즈 미리보기 */}
                            {bDraft && bDraft.colKey === c.key && (
                              <div className="absolute left-0 right-0 pointer-events-none" style={{
                                top: ((bDraft.start - GRID_MIN) / 60) * HOUR_H,
                                height: Math.max(2, ((bDraft.end - bDraft.start) / 60) * HOUR_H),
                                background: "rgba(110,118,129,.30)", border: "1px dashed var(--color-fg-subtle)",
                              }} />
                            )}
                            {/* 이벤트 이동 라이브 고스트(30분 스냅) */}
                            {moveDrag && moveDrag.colKey === c.key && (
                              <div className="absolute left-0.5 right-0.5 z-30 pointer-events-none rounded-lg text-white text-[11px] px-1.5 py-1 ring-2 ring-white" style={{
                                top: ((moveDrag.start - GRID_MIN) / 60) * HOUR_H + 1,
                                height: Math.max(22, (moveDrag.dur / 60) * HOUR_H) - 2,
                                background: moveDrag.color, opacity: 0.9,
                              }}>
                                <div className="font-semibold mono">{fromMin(moveDrag.start)}–{fromMin(moveDrag.start + moveDrag.dur)}</div>
                              </div>
                            )}
                            {/* 현재 시각 인디케이터 */}
                            {showNow && isToday && (
                              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                                <div className="h-px" style={{ background: "var(--color-danger)" }} />
                                <div
                                  className="absolute rounded-full"
                                  style={{ width: 8, height: 8, left: -4, top: -4, background: "var(--color-danger)" }}
                                />
                              </div>
                            )}
                            {colRows.map((r) => {
                              const s = sOf(r),
                                en = eOf(r);
                              const top = ((s - GRID_MIN) / 60) * HOUR_H;
                              const h = Math.max(22, ((en - s) / 60) * HOUR_H);
                              const ln = lanes[r.id] ?? { lane: 0, lanes: 1 };
                              const wPct = 100 / ln.lanes;
                              return (
                                <div
                                  key={r.id}
                                  onPointerDown={(e) => onEventDown(e, r)}
                                  onClick={(e) => { e.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return; } setSelEvent(r.id); setSelBand(null); }}
                                  onDoubleClick={(e) => { e.stopPropagation(); setEditing(r); }}
                                  title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"}${r.memo ? " · " + r.memo : ""} — 클릭=선택 · 드래그=이동 · 더블클릭=상세`}
                                  className={`absolute rounded-lg text-white text-[11px] leading-tight px-1.5 py-1 cursor-grab overflow-hidden shadow-sm hover:brightness-105 transition ${selEvent === r.id ? "ring-2 ring-white" : "ring-1 ring-black/5"}`}
                                  style={{
                                    top: top + 1,
                                    height: h - 2,
                                    left: `calc(${ln.lane * wPct}% + 2px)`,
                                    width: `calc(${wPct}% - 4px)`,
                                    background: colorOf(r),
                                    opacity: moveDrag?.id === r.id ? 0.35 : 1,
                                    outline: selEvent === r.id ? "2px solid var(--color-accent)" : undefined,
                                    outlineOffset: selEvent === r.id ? "1px" : undefined,
                                  }}
                                >
                                  {selEvent === r.id && (
                                    <div onPointerDown={(e) => onResizeDown(e, r, "top")} className="absolute left-1/2 -translate-x-1/2 top-0 w-6 h-2 rounded-b bg-white/90 cursor-ns-resize" />
                                  )}
                                  <div className="font-semibold truncate">{labelOf(r)}</div>
                                  <div className="opacity-90 mono truncate">
                                    {fromMin(s)}–{fromMin(en)}
                                  </div>
                                  <div className="opacity-80 truncate">
                                    {r.memo ? r.memo : view === "week" ? (r.roomName ?? "") : r.instructorName}
                                  </div>
                                  {selEvent === r.id && (
                                    <div onPointerDown={(e) => onResizeDown(e, r, "bottom")} className="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-2 rounded-t bg-white/90 cursor-ns-resize" />
                                  )}
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
            <p className="text-[12px] text-fg-subtle">
              개인 스케줄: {selected.name} · {filtered.length}개 수업 · 시수 {hrs.hours}h
            </p>
          )}
        </div>

        {/* 우측 접이식: 유저별 스케줄(강사/학생/강의실 선택 → 개인 스케줄). 선택 학생은 좌측 추천의 기준. */}
        {resources && <ResourcePanel resources={resources} selected={selected} onSelect={setSelected} />}
      </div>

      {editing && (
        <DetailModal
          row={editing}
          rooms={rooms}
          colorOf={colorOf}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            setEditing(null);
            await applyPatch(editing.id, patch);
          }}
        />
      )}

      {pending && (
        <RecurrencePrompt
          label={pending.label}
          onCancel={() => {
            setPending(null);
            load();
          }}
          onPick={(scope) => {
            const p = pending;
            setPending(null);
            applyPatch(p.row.id, { ...p.patch, scope });
          }}
        />
      )}

      {creating && resources && (
        <CreateModal
          resources={resources}
          rooms={rooms}
          defaultDate={creating.date}
          lockInstructorId={isInstructor ? myInstructorId : undefined}
          defaultOwner={selected}
          onClose={() => setCreating(null)}
          onCreate={createSession}
          onCreateBlock={createBlock}
        />
      )}
    </div>
  );
}


// ── 월간 그리드 ──
function MonthGrid({
  anchor,
  rows,
  colorOf,
  onPick,
  onPickDay,
}: {
  anchor: string;
  rows: ScheduleRow[];
  colorOf: (r: ScheduleRow) => string;
  onPick: (r: ScheduleRow) => void;
  onPickDay: (date: string) => void;
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
    rows.forEach((r) => {
      const a = m.get(r.sessionDate) ?? [];
      a.push(r);
      m.set(r.sessionDate, a);
    });
    m.forEach((a) => a.sort((x, y) => (x.startTime ?? "").localeCompare(y.startTime ?? "")));
    return m;
  }, [rows]);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--color-line)" }}>
        {WD.map((w, i) => (
          <div
            key={w}
            className={`px-3 py-2 text-[12px] font-semibold ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-fg-muted"}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, idx) => (
          <div key={idx} className="min-h-[104px] border-b border-r p-1.5" style={{ borderColor: "var(--color-line-muted)" }}>
            {date && (
              <button
                className={`text-[12px] mb-1 px-1 rounded hover:bg-canvas-subtle ${date === todayISO() ? "font-bold text-accent" : "text-fg-subtle"}`}
                onClick={() => onPickDay(date)}
                title="일간 보기"
              >
                {Number(date.slice(8))}
              </button>
            )}
            <div className="space-y-1">
              {(date ? (byDay.get(date) ?? []) : []).slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onPick(r)}
                  className="block w-full text-left rounded px-1.5 py-0.5 text-[11px] text-white truncate"
                  style={{ background: colorOf(r) }}
                  title={`${r.startTime ?? ""}–${r.endTime ?? ""} ${r.courseName} · ${r.instructorName}`}
                >
                  <span className="mono">
                    {r.startTime ?? ""}–{r.endTime ?? ""}
                  </span>{" "}
                  {r.courseName}
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
function DetailModal({
  row,
  rooms,
  colorOf,
  onClose,
  onSave,
}: {
  row: ScheduleRow;
  rooms: Room[];
  colorOf: (r: ScheduleRow) => string;
  onClose: () => void;
  onSave: (patch: SchedulePatchBody) => void;
}) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const [date, setDate] = useState(row.sessionDate);
  const [start, setStart] = useState(row.startTime ?? "16:00");
  const [end, setEnd] = useState(row.endTime ?? fromMin(toMin(row.startTime ?? "16:00") + row.durationMinutes));
  const [roomId, setRoomId] = useState<number | "">(row.roomId ?? "");
  const [status, setStatus] = useState(row.status);
  const [memo, setMemo] = useState(row.memo ?? "");
  const [scope, setScope] = useState<"this" | "this_and_following" | "all">("this");
  const isSeries = row.seriesId != null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[440px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <span className="inline-block w-3 h-3 rounded-sm mt-1.5 shrink-0" style={{ background: colorOf(row) }} />
          <div className="flex-1">
            <div className="font-semibold">{row.courseName}</div>
            <div className="text-fg-subtle text-[12px]">
              {row.subjectName} · {row.instructorName}
              {row.studentNames?.length ? ` · ${row.studentNames.join(", ")}` : ""}
            </div>
          </div>
          {isSeries && <span className="badge badge-accent">반복</span>}
        </div>

        {mode === "detail" ? (
          <>
            <dl className="grid grid-cols-[64px_1fr] gap-y-1.5 text-[13px]">
              <Dt>날짜</Dt>
              <dd>
                {row.sessionDate} ({WD[weekdayOf(row.sessionDate)]})
              </dd>
              <Dt>시간</Dt>
              <dd className="mono">
                {row.startTime ?? "-"} – {row.endTime ?? "-"} ({row.durationMinutes}분)
              </dd>
              <Dt>강의실</Dt>
              <dd>{row.roomName ?? "미지정"}</dd>
              <Dt>학생</Dt>
              <dd>{row.studentNames?.length ? row.studentNames.join(", ") : "—"}</dd>
              <Dt>상태</Dt>
              <dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
              {row.topic && (
                <>
                  <Dt>주제</Dt>
                  <dd>{row.topic}</dd>
                </>
              )}
              <Dt>메모</Dt>
              <dd className="whitespace-pre-wrap">{row.memo ? row.memo : <span className="text-fg-subtle">—</span>}</dd>
            </dl>
            <div className="flex justify-between gap-2 pt-1">
              <Link href={`/sessions/${row.id}`} className="btn btn-sm">
                강의 상세 페이지 →
              </Link>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={onClose}>
                  닫기
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setMode("edit")}>
                  편집
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="날짜">
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작">
                <input type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="종료">
                <input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <Field label="강의실">
              <select
                className="input"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">미지정</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="상태">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ScheduleRow["status"])}>
                {Object.keys(STATUS_LABEL).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="메모">
              <textarea className="input min-h-[64px] py-1.5" rows={3} placeholder="자유 메모 (학생 특이사항·준비물 등)"
                value={memo} onChange={(e) => setMemo(e.target.value)} />
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
              <button className="btn" onClick={() => setMode("detail")}>
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  onSave({
                    sessionDate: date,
                    startTime: start,
                    endTime: end,
                    roomId: roomId || undefined,
                    status,
                    memo,
                    scope: isSeries ? scope : undefined,
                  })
                }
              >
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
function RecurrencePrompt({
  label,
  onPick,
  onCancel,
}: {
  label: string;
  onPick: (scope: "this" | "this_and_following" | "all") => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onCancel}>
      <div className="card card-pad w-[360px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">반복 일정 수정</div>
        <p className="text-[13px] text-fg-muted">{label} — 어디까지 적용할까요?</p>
        <div className="grid gap-2">
          <button className="btn" onClick={() => onPick("this")}>
            이 일정만
          </button>
          <button className="btn" onClick={() => onPick("this_and_following")}>
            이 일정 및 이후 전부
          </button>
          <button className="btn" onClick={() => onPick("all")}>
            시리즈 전체
          </button>
        </div>
        <div className="flex justify-end pt-1">
          <button className="btn btn-sm" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 관리자: 스케줄 추가 모달 ──
function CreateModal({
  resources,
  rooms,
  defaultDate,
  lockInstructorId,
  defaultOwner,
  onClose,
  onCreate,
  onCreateBlock,
}: {
  resources: ScheduleResources;
  rooms: Room[];
  defaultDate: string;
  lockInstructorId?: number; // 강사 본인만 추가 가능할 때 — 본인 ID로 고정
  defaultOwner?: ScheduleResource | null;
  onClose: () => void;
  onCreate: (body: ScheduleCreateBody) => void;
  onCreateBlock: (body: AvailabilityUpsertBody) => void;
}) {
  const [tab, setTab] = useState<"session" | "block">("session");

  // ── 수업 탭 ──
  const myCourses = lockInstructorId != null ? resources.courses.filter((c) => c.instructorId === lockInstructorId) : resources.courses;
  const [courseId, setCourseId] = useState<number>(myCourses[0]?.id ?? 0);
  const course = resources.courses.find((c) => c.id === courseId);
  const [instructorId, setInstructorId] = useState<number | "">(lockInstructorId ?? course?.instructorId ?? "");
  const [roomId, setRoomId] = useState<number | "">("");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("16:00");
  // 진행시간은 코스(실제 수업) 데이터에서 — 종료시각 자동 계산(편집 가능)
  const courseDur = course?.durationMinutes ?? 90;
  const [end, setEnd] = useState(fromMin(toMin("16:00") + (myCourses[0]?.durationMinutes ?? 90)));
  const [memo, setMemo] = useState("");
  const lockedInstructorName = lockInstructorId != null ? resources.instructors.find((i) => i.id === lockInstructorId)?.name : undefined;
  function pickCourse(id: number) {
    setCourseId(id);
    const c = resources.courses.find((x) => x.id === id);
    if (c) {
      if (lockInstructorId == null) setInstructorId(c.instructorId);
      setEnd(fromMin(toMin(start) + c.durationMinutes)); // 코스 진행시간으로 종료 자동
    }
  }
  function changeStart(v: string) {
    setStart(v);
    setEnd(fromMin(toMin(v) + courseDur)); // 진행시간 유지
  }
  const sessionValid = courseId && date && start < end;

  // ── 가용·불가 탭 ──
  const lockOwner = lockInstructorId != null;
  const [bType, setBType] = useState<"instructor" | "student" | "room">(lockOwner ? "instructor" : (defaultOwner?.type ?? "instructor"));
  const [bId, setBId] = useState<number | "">(lockOwner ? lockInstructorId! : (defaultOwner?.id ?? ""));
  const [bKind, setBKind] = useState<"available" | "unavailable">("unavailable");
  const [bWeekday, setBWeekday] = useState<number>(weekdayOf(defaultDate));
  const [bStart, setBStart] = useState("12:00");
  const [bEnd, setBEnd] = useState("13:00");
  const ownerList = bType === "instructor" ? resources.instructors : bType === "student" ? resources.students : rooms.map((r) => ({ id: r.id, name: r.name }));
  const blockValid = bId !== "" && bStart < bEnd;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[440px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
          <button className={`btn btn-sm flex-1 rounded-none border-0 ${tab === "session" ? "badge-accent" : ""}`} onClick={() => setTab("session")}>수업</button>
          <button className={`btn btn-sm flex-1 rounded-none border-0 ${tab === "block" ? "badge-accent" : ""}`} onClick={() => setTab("block")}>가용 · 불가</button>
        </div>

        {tab === "session" ? (
          <>
            {lockedInstructorName && <div className="text-[12px] text-fg-muted">{lockedInstructorName} (내 수업)</div>}
            <Field label="코스">
              <select className="input" value={courseId} onChange={(e) => pickCourse(Number(e.target.value))}>
                {myCourses.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.subjectName}</option>)}
              </select>
            </Field>
            <Field label="강사">
              {lockInstructorId == null ? (
                <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value ? Number(e.target.value) : "")}>
                  {resources.instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              ) : (
                <input className="input" value={lockedInstructorName ?? "본인"} disabled readOnly />
              )}
            </Field>
            <Field label="강의실">
              <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">미지정</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="날짜"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작"><input type="time" step={900} className="input" value={start} onChange={(e) => changeStart(e.target.value)} /></Field>
              <Field label={`종료 (진행 ${courseDur}분)`}><input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            </div>
            <Field label="메모"><textarea className="input min-h-[52px] py-1.5" rows={2} placeholder="선택 — 메모" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn" onClick={onClose}>취소</button>
              <button className="btn btn-primary" disabled={!sessionValid}
                onClick={() => onCreate({ courseId, instructorId: lockInstructorId ?? (instructorId || undefined), roomId: roomId || undefined, sessionDate: date, startTime: start, endTime: end, memo: memo || undefined })}>
                수업 추가
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-fg-muted">주간 반복 가용/불가 시간을 설정합니다. (요일 단위)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="대상">
                <select className="input" value={bType} disabled={lockOwner}
                  onChange={(e) => { setBType(e.target.value as typeof bType); setBId(""); }}>
                  <option value="instructor">강사</option>
                  <option value="student">학생</option>
                  <option value="room">강의실</option>
                </select>
              </Field>
              <Field label={bType === "instructor" ? "강사" : bType === "student" ? "학생" : "강의실"}>
                <select className="input" value={bId} disabled={lockOwner} onChange={(e) => setBId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">선택</option>
                  {ownerList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="종류">
                <select className="input" value={bKind} onChange={(e) => setBKind(e.target.value as typeof bKind)}>
                  <option value="unavailable">불가(차단)</option>
                  <option value="available">가용</option>
                </select>
              </Field>
              <Field label="요일">
                <select className="input" value={bWeekday} onChange={(e) => setBWeekday(Number(e.target.value))}>
                  {WD.map((w, i) => <option key={i} value={i}>{w}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작"><input type="time" step={900} className="input" value={bStart} onChange={(e) => setBStart(e.target.value)} /></Field>
              <Field label="종료"><input type="time" step={900} className="input" value={bEnd} onChange={(e) => setBEnd(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn" onClick={onClose}>취소</button>
              <button className="btn btn-primary" disabled={!blockValid}
                onClick={() => onCreateBlock({ ownerType: bType, ownerId: Number(bId), kind: bKind, weekday: bWeekday, startTime: bStart, endTime: bEnd })}>
                {bKind === "unavailable" ? "불가시간" : "가용시간"} 추가
              </button>
            </div>
          </>
        )}
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
