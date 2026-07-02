// 캘린더 → 이미지(PNG·JPEG) 내보내기. (브라우저 다운로드)
// [감사 C, 2026-07-02] xlsx(SheetJS) 내보내기 제거 — npm audit high(ReDoS, 패치 없음) +
//  유일 사용처 WeeklyTable(주간 표)이 캘린더 통합(TBO-03)으로 데드코드였음. 엑셀이 다시
//  필요해지면 exceljs 등 유지보수되는 라이브러리로 서버측(백엔드) 생성 권장.
import { toPng, toJpeg } from "html-to-image";

// 캘린더/표 DOM 노드를 이미지로 캡처해 다운로드(PNG 또는 JPEG).
// 화면에서 칸이 좁아 시간표가 잘 안 보이는 문제 → 캡처 직전 노드를 가로(랜드스케이프)
// 목표 폭으로 잠시 넓혀 컬럼·글자를 키운 뒤 고해상도로 캡처하고, 원래 스타일로 복원한다.
export async function exportNodeAsImage(
  node: HTMLElement,
  filename: string,
  type: "png" | "jpeg" = "png",
  targetWidth = 1680, // 가로 기준 목표 폭(px). 현재 폭이 더 좁을 때만 넓힘.
) {
  // 원래 인라인 스타일 보존(복원용)
  const prev = { width: node.style.width, maxWidth: node.style.maxWidth, padding: node.style.padding };
  const widen = node.scrollWidth < targetWidth;
  if (widen) {
    node.style.width = `${targetWidth}px`;
    node.style.maxWidth = "none";
  }
  node.style.padding = "20px"; // 가장자리 여백으로 답답함 완화
  // 레이아웃 반영 강제(컬럼이 새 폭으로 리플로우되도록)
  void node.offsetWidth;

  try {
    const width = Math.max(node.scrollWidth, node.clientWidth);
    const height = Math.max(node.scrollHeight, node.clientHeight);
    // pixelRatio 3 → 글자/선이 또렷하게(가독성↑). 폭이 충분하면 추가 확대는 불필요.
    const opts = { backgroundColor: "#ffffff", pixelRatio: 3, cacheBust: true, width, height };
    const dataUrl = type === "jpeg"
      ? await toJpeg(node, { ...opts, quality: 0.96 })
      : await toPng(node, opts);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  } finally {
    // 스타일 원복(화면 깜빡임 최소화)
    node.style.width = prev.width;
    node.style.maxWidth = prev.maxWidth;
    node.style.padding = prev.padding;
  }
}
