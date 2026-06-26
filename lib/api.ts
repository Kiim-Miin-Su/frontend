// 백엔드(NestJS)와 분리 운영. next.config.ts의 rewrites가 /api/* → API 서버로 프록시.
// 데스크탑 전환 시 BASE만 절대 URL로 바꾸면 됩니다.
import type {
  Student,
  Enrollment,
  Payment,
  CreateStudentInput,
  CreateEnrollmentInput,
  WebIdCheckResult,
} from "@taco/contracts";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; service: string; ts: string }>("/health"),
  students: {
    list: () => request<Student[]>("/students"),
    get: (id: number) => request<Student>(`/students/${id}`),
    create: (body: CreateStudentInput) =>
      request<Student>("/students", { method: "POST", body: JSON.stringify(body) }),
  },
  enrollments: {
    list: (studentId?: number) =>
      request<Enrollment[]>(`/enrollments${studentId ? `?studentId=${studentId}` : ""}`),
    create: (body: CreateEnrollmentInput) =>
      request<Enrollment>("/enrollments", { method: "POST", body: JSON.stringify(body) }),
  },
  payments: {
    list: () => request<Payment[]>("/payments"),
  },
  users: {
    // web id 존재 확인 (등록 폼 "확인하기")
    exists: (webId: string) =>
      request<WebIdCheckResult>(`/users/exists?webId=${encodeURIComponent(webId)}`),
  },
};
