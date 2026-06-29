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
} from "@kms545487/contracts";

export type ScheduleQuery = { from?: string; to?: string; instructorId?: number; roomId?: number };

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
