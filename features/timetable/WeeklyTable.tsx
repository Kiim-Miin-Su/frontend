"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleRow, Room, AvailabilityBlock } from "@/types";
import { api } from "@/lib/api";
import { weekDates, weekdayOf, toMin, teachingHours } from "@/lib/domain/schedule";
import { exportScheduleXlsx } from "@/lib/export";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i); // 09:00 ~ 21:00
const PALETTE = ["#0969da", "#1a7f37", "#8250df", "#bf3989", "#9a6700", "#1b7c83"];

const pad = (n: number) => String(n).padStart(2, "0");
function mondayISO(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return x.toISOString().slice(0, 10);
}
const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hashColor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

type ColorBy = "subject" | "instructor" | "room";

export function WeeklyTable() {
  const [weekStart, setWeekStart] = useState(mondayISO());
  const [instructorId, setInstructorId] = useState<number | "">("");
  const [roomId, setRoomId] = useState<number | "">("");
  const [colorBy, setColorBy] = useState<ColorBy>("subject");

  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const from = dates[0];
  const to = dates[6];

  // 강사/강의실 옵션 (현재 주의 데이터에서 추출)
  const instructors = useMemo(() => {
    const m = new Map<number, string>();
    rows.forEach((r) => m.set(r.instructorId, r.instructorName));
    return [...m.entries()];
  }, [rows]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [sc, rm] = await Promise.all([
        api.schedule.list({ from, to, instructorId: instructorId || undefined, roomId: roomId || undefined }),
        rooms.length ? Promise.resolve(rooms) : api.rooms.list(),
      ]);
      setRows(sc);
      if (!rooms.length) setRooms(rm);
      setBlocks(instructorId ? await api.availability.list("instructor", Number(instructorId)) : []);
      setState("idle");
    } catch {
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, instructorId, roomId]);

  useEffect(() => {
    load();
  }, [load]);

  const colorOf = (r: ScheduleRow) =>
    colorBy === "subject" ? r.color ?? hashColor(r.subjectName)
      : colorBy === "instructor" ? PALETTE[r.instructorId % PALETTE.length]
        : rooms.find((x) => x.id === r.roomId)?.color ?? hashColor(r.roomName ?? "");

  const labelOf = (r: ScheduleRow) =>
    colorBy === "subject" ? r.courseName : colorBy === "instructor" ? r.instructorName : r.roomName ?? "—";

  // 불가시간(Block) 셀 판정 — 강사 선택 시 회색 표시
  const isBlocked = (date: string, hour: number) =>
    blocks.some((b) => b.kind === "unavailable" && b.weekday === weekdayOf(date) &&
      toMin(b.startTime) < (hour + 1) * 60 && hour * 60 < toMin(b.endTime));

  const hrs = teachingHours(rows);

  return (
    <div className="p-6 max-w-[1280px] mx-auto space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">주간 스케줄 (표)</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {from} ~ {to} · 백엔드 실연동 · 수업 {rows.length}건 · 시수 {hrs.hours}h
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-sm" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>◀ 이전주</button>
          <button className="btn btn-sm" onClick={() => setWeekStart(mondayISO())}>이번주</button>
          <button className="btn btn-sm" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>다음주 ▶</button>
          <button className="btn btn-sm btn-primary" disabled={!rows.length}
            onClick={() => exportScheduleXlsx(rows, `timetable_${from}.xlsx`)}>엑셀 내보내기</button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap text-[13px]">
        <label className="flex items-center gap-1.5">색상 기준
          <select className="input w-28 h-7" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="subject">과목</option>
            <option value="instructor">강사</option>
            <option value="room">강의실</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">강사
          <select className="input w-32 h-7" value={instructorId} onChange={(e) => setInstructorId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">전체</option>
            {instructors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">강의실
          <select className="input w-32 h-7" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">전체</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        {instructorId !== "" && (
          <span className="text-[12px] text-fg-subtle inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "var(--color-neutral-subtle)", border: "1px solid var(--color-line)" }} /> 불가시간(Block)
          </span>
        )}
        {state === "error" && <span className="text-[12px] text-danger">백엔드 API에 연결할 수 없습니다. 서버 상태와 API 주소 설정을 확인하세요.</span>}
        {state === "loading" && <span className="text-[12px] text-fg-subtle">불러오는 중…</span>}
      </div>

      {/* 표 */}
      <div className="card overflow-x-auto">
        <table className="table" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 64 }}>시간</th>
              {dates.map((d) => (
                <th key={d} className="text-center">
                  {WD[weekdayOf(d)]}<span className="text-fg-subtle font-normal"> {d.slice(5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td className="mono text-fg-muted align-top">{pad(h)}:00</td>
                {dates.map((d) => {
                  const cell = rows.filter((r) => r.sessionDate === d && r.startTime && toMin(r.startTime) >= h * 60 && toMin(r.startTime) < (h + 1) * 60);
                  const blocked = instructorId !== "" && isBlocked(d, h);
                  return (
                    <td key={d} className="align-top" style={blocked ? { background: "var(--color-neutral-subtle)" } : undefined}>
                      <div className="space-y-1">
                        {cell.map((r) => (
                          <div key={r.id} className="rounded px-1.5 py-1 text-[11px] leading-tight text-white truncate" style={{ background: colorOf(r) }}
                            title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"} · ${r.startTime}-${r.endTime}`}>
                            <div className="font-semibold truncate">{labelOf(r)}</div>
                            <div className="opacity-90 mono">{r.startTime}–{r.endTime} · {r.roomName ?? "-"}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
