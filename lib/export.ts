// 주간 스케줄 → 엑셀(.xlsx) / CSV 내보내기. (브라우저 다운로드)
import * as XLSX from "xlsx";
import type { ScheduleRow } from "@/types";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

function toRows(rows: ScheduleRow[]) {
  return rows.map((r) => ({
    날짜: r.sessionDate,
    요일: WD[r.weekday] ?? "",
    시작: r.startTime ?? "",
    종료: r.endTime ?? "",
    과목: r.subjectName,
    수업: r.courseName,
    강사: r.instructorName,
    강의실: r.roomName ?? "",
    상태: r.status,
  }));
}

export function exportScheduleXlsx(rows: ScheduleRow[], filename = "timetable.xlsx") {
  const ws = XLSX.utils.json_to_sheet(toRows(rows));
  ws["!cols"] = [12, 6, 7, 7, 8, 18, 10, 12, 10].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "주간 스케줄");
  XLSX.writeFile(wb, filename);
}

export function exportScheduleCsv(rows: ScheduleRow[], filename = "timetable.csv") {
  const data = toRows(rows);
  const head = ["날짜", "요일", "시작", "종료", "과목", "수업", "강사", "강의실", "상태"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.join(","), ...data.map((d) => head.map((h) => esc((d as Record<string, unknown>)[h])).join(","))];
  // BOM 추가(엑셀 한글 깨짐 방지)
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
