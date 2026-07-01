// TanStack Query 키 레지스트리 — 매직 문자열 대신 한곳에서 관리(무효화 일관성).
// 예) queryClient.invalidateQueries({ queryKey: qk.schedule.all })
import type { ScheduleQuery } from "@/lib/api";
import type { AvailabilityOwner } from "@/types";

export const qk = {
  schedule: {
    all: ["schedule"] as const,
    list: (q: ScheduleQuery) => ["schedule", "list", q] as const,
    resources: () => ["schedule", "resources"] as const,
  },
  availability: {
    all: ["availability"] as const,
    list: (ownerType: AvailabilityOwner, ownerId: number) => ["availability", ownerType, ownerId] as const,
    everything: () => ["availability", "all"] as const,
  },
  rooms: { all: () => ["rooms"] as const },
  payouts: {
    all: ["payouts"] as const,
    list: () => ["payouts", "list"] as const,
    preview: (instructorId: number, from: string, to: string) => ["payouts", "preview", instructorId, from, to] as const,
  },
  reports: { all: ["reports"] as const, list: (sessionId?: number) => ["reports", "list", sessionId ?? null] as const },
  students: { all: ["students"] as const, list: () => ["students", "list"] as const },
  payments: { all: ["payments"] as const, list: () => ["payments", "list"] as const },
  expenses: { all: ["expenses"] as const, list: () => ["expenses", "list"] as const },
  courses: { all: ["courses"] as const, list: () => ["courses", "list"] as const },
  subjects: { all: ["subjects"] as const, list: () => ["subjects", "list"] as const },
  enrollments: { all: ["enrollments"] as const, list: (studentId?: number) => ["enrollments", "list", studentId ?? null] as const },
} as const;
