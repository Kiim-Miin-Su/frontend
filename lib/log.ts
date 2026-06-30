// ─────────────────────────────────────────────────────────────
// 프론트엔드 공용 로거 — 네임스페이스(영역)별로 일관된 콘솔 출력.
//
// 왜? 문제가 생겼을 때 "어느 영역에서, 무슨 일이" 났는지 콘솔에서 바로 보이게.
// 사용:  const log = logger("calendar");  log.info("세션 생성", { id });
// 출력:  [TACO:calendar] 세션 생성 { id: 12 }
//
// 켜고 끄기:
//  - 개발(NODE_ENV!=="production")에서는 debug까지 전부 출력.
//  - 운영에서는 warn·error만 출력. 운영에서도 전부 보려면 브라우저 콘솔에서
//      localStorage.setItem("taco_debug","1")  (끄려면 "0")
// 문제 진단 가이드: docs/logging.md
// ─────────────────────────────────────────────────────────────
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  if (typeof window !== "undefined") {
    const f = window.localStorage.getItem("taco_debug");
    if (f === "1") return ORDER.debug;
    if (f === "0") return ORDER.warn;
  }
  return process.env.NODE_ENV === "production" ? ORDER.warn : ORDER.debug;
}

const COLOR: Record<Level, string> = {
  debug: "color:#6e7681",
  info: "color:#0e7490;font-weight:bold",
  warn: "color:#9a6700;font-weight:bold",
  error: "color:#cf222e;font-weight:bold",
};

export type Logger = Record<Level, (...args: unknown[]) => void>;

export function logger(ns: string): Logger {
  const make = (level: Level) => (...args: unknown[]) => {
    if (ORDER[level] < minLevel()) return;
    const fn = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
    fn(`%c[TACO:${ns}]`, COLOR[level], ...args);
  };
  return { debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error") };
}
