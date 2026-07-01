// 백엔드(NestJS) REST 클라이언트 — Axios.
// baseURL = `${NEXT_PUBLIC_API_URL}/api`. 로컬은 미설정 시 next.config rewrites가 localhost로 프록시,
// 배포(Vercel)는 NEXT_PUBLIC_API_URL을 백엔드 도메인으로 지정하면 직접 호출(백엔드 CORS 허용).
import axios from "axios";
import { logger } from "./log";
import { getToken, clearToken } from "./auth";
import { isPublicRoute } from "./auth-routes";
import type {
  Student,
  Enrollment,
  Payment,
  CreateStudentInput,
  CreateEnrollmentInput,
  WebIdCheckResult,
  Room,
  AvailabilityBlock,
  AvailabilityOwner,
  AvailabilityKind,
  ScheduleRow,
  ScheduleResources,
  Conflict,
} from "@kms545487/contracts";

export type ScheduleQuery = { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number };
export type ScheduleCreateBody = {
  courseId: number; instructorId?: number; roomId?: number; sessionDate: string;
  startTime: string; endTime?: string; durationMinutes?: number; topic?: string; memo?: string; color?: string;
  seriesId?: number; status?: string; force?: boolean;
};
export type AvailabilityUpsertBody = {
  id?: number; ownerType: AvailabilityOwner; ownerId: number; kind?: AvailabilityKind;
  weekday: number; startTime: string; endTime: string; effectiveFrom?: string; effectiveTo?: string;
};
export type SchedulePatchBody = {
  sessionDate?: string; startTime?: string; endTime?: string; durationMinutes?: number;
  roomId?: number; instructorId?: number; courseId?: number; status?: string; topic?: string; memo?: string; color?: string;
  // 반복 편집 범위(this=이 일정만 · this_and_following=이후 전부 · all=시리즈 전체). seriesId가 있을 때만 의미.
  scope?: "this" | "this_and_following" | "all"; force?: boolean;
};
export type ConflictCheckBody = {
  sessionDate: string; startTime: string; endTime?: string; durationMinutes?: number;
  instructorId?: number; roomId?: number; ignoreSessionId?: number;
};

// ── TBO-05 시수·페이 정산 타입(백엔드 reports/payouts 모듈 응답) ──
export type ReportStatus = "draft" | "submitted" | "approved" | "rejected";
export type SessionReport = {
  id: number; sessionId: number; studentId: number; instructorId: number; subjectId?: number;
  content: string; homework?: string; status: ReportStatus;
  submittedAt?: string; approvedAt?: string; approvedBy?: number; rejectedReason?: string;
  createdAt: string; updatedAt: string;
};
// 정산 라인(세션 1건 산정 스냅샷)
export type PayoutLine = {
  sessionId: number; courseId: number; courseName: string; sessionDate: string;
  durationMinutes: number; hourlyRate: number; amount: number;
};
// 산정 미리보기(읽기전용)
export type MeasureResult = {
  instructorId: number; periodStart: string; periodEnd: string;
  sessionCount: number; totalMinutes: number; computedAmount: number; lines: PayoutLine[];
};
export type PayoutRowStatus = "pending" | "confirmed" | "paid" | "rejected";
export type PayoutRow = {
  id: number; instructorId: number; periodStart: string; periodEnd: string;
  sessionCount: number; totalMinutes: number; computedAmount: number;
  adjustedAmount?: number; adjustReason?: string; amount: number;
  status: PayoutRowStatus; lines: PayoutLine[]; rejectedReason?: string;
  paidAt?: string; confirmedAt?: string; createdAt: string; updatedAt: string;
};
export type LedgerTx = {
  id: number; direction: "in" | "out"; category: string; label: string;
  amount: number; occurredAt: string; payoutId?: number;
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const http = axios.create({
  baseURL: `${BASE}/api`,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

// 모든 API 요청/응답/에러를 한 곳에서 로깅 — 문제 발생 시 콘솔에서 어떤 호출이 실패했는지 즉시 확인.
// (브라우저 콘솔에서 [TACO:api] 로 필터. 끄려면 localStorage taco_debug="0")
const apiLog = logger("api");
http.interceptors.request.use((cfg) => {
  // 로그인 토큰이 있으면 모든 요청에 Bearer로 첨부 → 백엔드 RBAC 가드 대비(권한 체크 일관).
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  apiLog.debug(`→ ${cfg.method?.toUpperCase()} ${cfg.url}`, cfg.params ?? cfg.data ?? "");
  return cfg;
});
http.interceptors.response.use(
  (res) => {
    apiLog.debug(`← ${res.status} ${res.config.url}`);
    return res;
  },
  (err) => {
    const status = err?.response?.status ?? "ERR";
    apiLog.error(`✗ ${status} ${err?.config?.method?.toUpperCase() ?? ""} ${err?.config?.url ?? ""}`, err?.response?.data ?? err?.message);
    // 401(토큰 없음/만료): 조용히 실패하지 않고 로그인으로 유도 — 세션이 끊긴 걸 사용자에게 알림.
    // 단, 로그인 시도 자체의 401(잘못된 자격)이나 공개 경로에선 리다이렉트하지 않음.
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !isPublicRoute(window.location.pathname) &&
      !String(err?.config?.url ?? "").includes("/auth/login")
    ) {
      clearToken();
      window.location.href = "/login?expired=1";
    }
    return Promise.reject(err);
  },
);

export type LoginBody = { webId: string; password?: string };
export type LoginResult = { accessToken: string; account: { id: number; name: string; role: string } };
export type SignupBody = { webId: string; name: string; email: string; password: string; role?: string };
export type SignupResult = { ok: boolean; message: string; account: { id: number; webId: string; name: string; role: string; status: string }; devVerifyLink?: string };
export type PendingAccount = { id: number; webId: string; name: string; email: string; role: string; status: string; emailVerified: boolean; createdAt: string };

const authHeader = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const api = {
  health: () => http.get<{ status: string; service: string; ts: string }>("/health").then((r) => r.data),
  auth: {
    // 로그인 — webId+비밀번호(해시 검증) → 토큰 발급
    login: (body: LoginBody) => http.post<LoginResult>("/auth/login", body).then((r) => r.data),
    // 가입 신청(대표 승인 대기) → 인증 메일 발송
    signup: (body: SignupBody) => http.post<SignupResult>("/auth/signup", body).then((r) => r.data),
    // 이메일 인증(메일 링크 token)
    verifyEmail: (token: string) =>
      http.get<{ ok: boolean; message: string }>("/auth/verify-email", { params: { token } }).then((r) => r.data),
    // 토큰 검증(서버에서 claims 반환)
    me: (token: string) =>
      http.get<{ sub: number; name: string; roles: string[] }>("/auth/me", authHeader(token)).then((r) => r.data),
    // 대표(super_admin) 전용 — 승인 대기 목록·승인·반려
    pending: (token: string) => http.get<PendingAccount[]>("/auth/pending", authHeader(token)).then((r) => r.data),
    approve: (token: string, id: number, role?: string) =>
      http.post<PendingAccount>(`/auth/approve/${id}`, { role }, authHeader(token)).then((r) => r.data),
    reject: (token: string, id: number) =>
      http.post<PendingAccount>(`/auth/reject/${id}`, {}, authHeader(token)).then((r) => r.data),
  },
  students: {
    list: () => http.get<Student[]>("/students").then((r) => r.data),
    get: (id: number) => http.get<Student>(`/students/${id}`).then((r) => r.data),
    create: (body: CreateStudentInput) => http.post<Student>("/students", body).then((r) => r.data),
  },
  enrollments: {
    list: (studentId?: number) =>
      http.get<Enrollment[]>("/enrollments", { params: studentId ? { studentId } : undefined }).then((r) => r.data),
    create: (body: CreateEnrollmentInput) => http.post<Enrollment>("/enrollments", body).then((r) => r.data),
  },
  payments: {
    list: () => http.get<Payment[]>("/payments").then((r) => r.data),
  },
  users: {
    // web id 존재 확인 (등록 폼 "확인하기")
    exists: (webId: string) =>
      http.get<WebIdCheckResult>("/users/exists", { params: { webId } }).then((r) => r.data),
  },
  // ── 스케줄(v5) ──
  schedule: {
    list: (q: ScheduleQuery = {}) =>
      http.get<ScheduleRow[]>("/schedule", { params: q }).then((r) => r.data),
    // 자원 피커(강사·강의실·학생)
    resources: () => http.get<ScheduleResources>("/schedule/resources").then((r) => r.data),
    // 추천→배정·수동 추가 → { row, conflicts }. 충돌 시 409 → force로 재시도.
    create: (body: ScheduleCreateBody) =>
      http.post<{ row: ScheduleRow; conflicts: Conflict[] }>("/schedule", body).then((r) => r.data),
    // 이동·리사이즈·편집 → { row, conflicts }. 충돌 시 409(서버) → force로 재시도.
    update: (id: number, body: SchedulePatchBody) =>
      http.patch<{ row: ScheduleRow; conflicts: Conflict[]; updated: number }>(`/schedule/${id}`, body).then((r) => r.data),
    conflicts: (body: ConflictCheckBody) =>
      http.post<Conflict[]>("/schedule/conflicts", body).then((r) => r.data),
    // 세션 삭제
    remove: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/schedule/${id}`).then((r) => r.data),
  },
  rooms: {
    list: () => http.get<Room[]>("/rooms").then((r) => r.data),
  },
  availability: {
    list: (ownerType: AvailabilityOwner, ownerId: number) =>
      http
        .get<AvailabilityBlock[]>("/availability", { params: { ownerType, ownerId } })
        .then((r) => r.data),
    // 전체 블록(추천 컨텍스트용 — 학생+강사+강의실 가용/불가 한 번에)
    all: () => http.get<AvailabilityBlock[]>("/availability").then((r) => r.data),
    // 가용/불가(Block) 생성·수정(id 있으면 수정)
    upsert: (body: AvailabilityUpsertBody) =>
      http.put<AvailabilityBlock>("/availability", body).then((r) => r.data),
    remove: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/availability/${id}`).then((r) => r.data),
  },
  // ── 수업 보고서(TBO-05) — 강사 제출 → 관리자 승인/반려 ──
  reports: {
    list: (sessionId?: number) =>
      http.get<SessionReport[]>("/reports", { params: sessionId ? { sessionId } : undefined }).then((r) => r.data),
    create: (body: { sessionId: number; studentId: number; instructorId?: number; content: string; homework?: string; status?: "draft" | "submitted" }) =>
      http.post<SessionReport>("/reports", body).then((r) => r.data),
    submit: (id: number) => http.post<SessionReport>(`/reports/${id}/submit`, {}).then((r) => r.data),
    approve: (id: number, approvedBy?: number) =>
      http.post<SessionReport>(`/reports/${id}/approve`, { approvedBy }).then((r) => r.data),
    reject: (id: number, reason?: string) =>
      http.post<SessionReport>(`/reports/${id}/reject`, { reason }).then((r) => r.data),
  },
  // ── 강사 페이 정산(TBO-05) — 시수×시급 산정 → 승인 → 지급 ──
  payouts: {
    list: () => http.get<PayoutRow[]>("/payouts").then((r) => r.data),
    get: (id: number) => http.get<PayoutRow>(`/payouts/${id}`).then((r) => r.data),
    // 읽기전용 산정 미리보기(정산서 생성 없음). 적격: held + 승인 보고서.
    preview: (instructorId: number, from: string, to: string) =>
      http.get<MeasureResult>("/payouts/preview", { params: { instructorId, from, to } }).then((r) => r.data),
    // 정산서 생성(pending) + 세션 연결(이중 계상 방지)
    generate: (instructorId: number, from: string, to: string) =>
      http.post<PayoutRow>("/payouts/generate", { instructorId, from, to }).then((r) => r.data),
    confirm: (id: number) => http.post<PayoutRow>(`/payouts/${id}/confirm`, {}).then((r) => r.data),
    // 관리자 급여 수정(실효 지급액 덮어쓰기, 자동 산정액 보존)
    adjust: (id: number, amount: number, reason?: string) =>
      http.post<PayoutRow>(`/payouts/${id}/adjust`, { amount, reason }).then((r) => r.data),
    reject: (id: number, reason?: string) =>
      http.post<PayoutRow>(`/payouts/${id}/reject`, { reason }).then((r) => r.data),
    // 지급 완료(confirmed → paid) + 통합 원장 출금 기록
    pay: (id: number) =>
      http.post<{ payout: PayoutRow; transaction: LedgerTx }>(`/payouts/${id}/pay`, {}).then((r) => r.data),
  },
};
