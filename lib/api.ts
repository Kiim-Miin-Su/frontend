// 백엔드(NestJS) REST 클라이언트 — Axios.
// next.config.ts의 rewrites가 /api/* → API 서버(3001)로 프록시.
// 데스크탑 전환 시 baseURL만 절대 URL로 바꾸면 됩니다.
import axios from "axios";
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
  ScheduleRow,
  Conflict,
} from "@kms545487/contracts";

export type ScheduleQuery = { from?: string; to?: string; instructorId?: number; roomId?: number };
export type SchedulePatchBody = {
  sessionDate?: string; startTime?: string; endTime?: string; durationMinutes?: number;
  roomId?: number; instructorId?: number; courseId?: number; status?: string; topic?: string;
  // 반복 편집 범위(this=이 일정만 · this_and_following=이후 전부 · all=시리즈 전체). seriesId가 있을 때만 의미.
  scope?: "this" | "this_and_following" | "all"; force?: boolean;
};
export type ConflictCheckBody = {
  sessionDate: string; startTime: string; endTime?: string; durationMinutes?: number;
  instructorId?: number; roomId?: number; ignoreSessionId?: number;
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const http = axios.create({
  baseURL: `${BASE}/api`,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

export const api = {
  health: () => http.get<{ status: string; service: string; ts: string }>("/health").then((r) => r.data),
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
    // 이동·리사이즈·편집 → { row, conflicts }. 충돌 시 409(서버) → force로 재시도.
    update: (id: number, body: SchedulePatchBody) =>
      http.patch<{ row: ScheduleRow; conflicts: Conflict[]; updated: number }>(`/schedule/${id}`, body).then((r) => r.data),
    conflicts: (body: ConflictCheckBody) =>
      http.post<Conflict[]>("/schedule/conflicts", body).then((r) => r.data),
  },
  rooms: {
    list: () => http.get<Room[]>("/rooms").then((r) => r.data),
  },
  availability: {
    list: (ownerType: AvailabilityOwner, ownerId: number) =>
      http
        .get<AvailabilityBlock[]>("/availability", { params: { ownerType, ownerId } })
        .then((r) => r.data),
  },
};
