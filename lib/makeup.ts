// ─────────────────────────────────────────────────────────────
// "보강 필요" 단일 정의 — 강사 탭 배지·알림·대시보드가 같은 기준으로 계산한다.
// 취소·노쇼·과거 미진행(펑크) 수업은 시수 부족을 만들므로 보강(makeup) 대상이 된다.
// 원본 세션이 보강 세션(ClassSession.makeupForSessionId)으로 연결되면 "해소"로 본다.
// ─────────────────────────────────────────────────────────────
import type { ClassSession } from "@/types";
import { sessionEndMs } from "@/lib/reports";

export type MakeupSlice = { classSessions: ClassSession[] };

export type MakeupReason = "canceled" | "no_show" | "unheld_past";
export type MakeupNeedItem = {
  session: ClassSession;
  reason: MakeupReason;
  resolved: boolean;
};

export const MAKEUP_REASON_LABEL: Record<MakeupReason, string> = {
  canceled: "취소됨",
  no_show: "노쇼",
  unheld_past: "미진행(펑크)",
};

// 원본 세션이 보강으로 해소되었는가?
//  - makeupForSessionId로 자신을 가리키는 보강 세션이 있으면 해소.
//  - (링크가 없는 데이터 대비) 같은 코스의 'makeup' 세션이 원본 이후 존재하면 해소로 간주.
function isResolved(s: MakeupSlice, original: ClassSession): boolean {
  if (s.classSessions.some((x) => x.makeupForSessionId === original.id)) return true;
  return s.classSessions.some(
    (x) => x.status === "makeup" && x.courseId === original.courseId && x.sessionDate >= original.sessionDate,
  );
}

// 보강이 필요한 사유(취소·노쇼·과거 미진행). 아니면 null.
function makeupReason(ses: ClassSession, nowMs: number): MakeupReason | null {
  if (ses.status === "canceled") return "canceled";
  if (ses.status === "no_show") return "no_show";
  // 진행 예정(scheduled)인데 종료 시각이 지남 = 미진행(펑크). 아직 안 끝난 예정 수업은 제외(강건성).
  if (ses.status === "scheduled" && sessionEndMs(ses) <= nowMs) return "unheld_past";
  return null;
}

// 보강 필요 항목(강사 지정 시 해당 강사만). 보강 세션 자체는 대상에서 제외.
export function makeupNeeds(s: MakeupSlice, instructorId?: number, nowMs: number = Date.now()): MakeupNeedItem[] {
  const out: MakeupNeedItem[] = [];
  for (const ses of s.classSessions) {
    if (instructorId != null && ses.instructorId !== instructorId) continue;
    if (ses.makeupForSessionId != null) continue; // 보강 세션 자체(원본이 아님)
    const reason = makeupReason(ses, nowMs);
    if (!reason) continue;
    out.push({ session: ses, reason, resolved: isResolved(s, ses) });
  }
  return out;
}

// 미해소 보강 필요 건수(배지용).
export function makeupNeededCount(s: MakeupSlice, instructorId?: number, nowMs: number = Date.now()): number {
  return makeupNeeds(s, instructorId, nowMs).filter((m) => !m.resolved).length;
}
