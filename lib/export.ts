// 주간 스케줄 → 엑셀(.xlsx) / 이미지(PNG·JPEG) 내보내기. (브라우저 다운로드)
import * as XLSX from "xlsx";
import { toPng, toJpeg } from "html-to-image";
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
    학생: (r.studentNames ?? []).join(", "),
    상태: r.status,
  }));
}

export function exportScheduleXlsx(rows: ScheduleRow[], filename = "timetable.xlsx") {
  const ws = XLSX.utils.json_to_sheet(toRows(rows));
  ws["!cols"] = [12, 6, 7, 7, 8, 18, 10, 12, 16, 10].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "주간 스케줄");
  XLSX.writeFile(wb, filename);
}

// 캘린더/표 DOM 노드를 이미지로 캡처해 다운로드(PNG 또는 JPEG).
export async function exportNodeAsImage(
  node: HTMLElement,
  filename: string,
  type: "png" | "jpeg" = "png",
) {
  // 가로 스크롤(주/일 그리드)이 잘리지 않도록 전체 스크롤 크기로 캡처.
  const width = Math.max(node.scrollWidth, node.clientWidth);
  const height = Math.max(node.scrollHeight, node.clientHeight);
  const opts = { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true, width, height };
  const dataUrl = type === "jpeg"
    ? await toJpeg(node, { ...opts, quality: 0.95 })
    : await toPng(node, opts);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
