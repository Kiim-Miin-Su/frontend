// ──────────────────────────────────────────────────────────────
// 학생 도메인 규칙 (순수 함수). UI·스토어와 분리해 백엔드 서비스와 1:1 매핑.
//
// 책임 분리 의도:
//  - 본 파일 = "무엇이 활성 학생인가 / 퇴원은 어떤 상태 전이인가" 라는 비즈니스 규칙.
//  - lib/store.ts = 그 규칙을 in-memory(mock)에 적용하는 어댑터.
//  - 추후 backend(NestJS) StudentsService 가 동일 규칙을 서버에서 재현 →
//    프론트는 store 액션을 api 호출로 갈아끼우기만 하면 됨(규칙 중복 없음).
// ──────────────────────────────────────────────────────────────
import type { Student, StudentStatus, Enrollment } from '@/types';

// 운영 목록·일정에서 제외되는 "비활성" 상태.
// 퇴원(소프트삭제)은 student/enrollment 를 지우지 않고 이 상태로 전이한다.
// 백엔드 매핑: `WHERE status NOT IN (...)`  (목록 조회 기본 스코프)
export const INACTIVE_STUDENT_STATUSES: readonly StudentStatus[] = ['canceled'];

export const isActiveStudent = (s: Student): boolean =>
  !INACTIVE_STUDENT_STATUSES.includes(s.status);

/** 활성 학생만 반환 (퇴원/비활성 제외) — 모든 운영 화면의 기본 스코프 */
export const activeStudents = (list: Student[]): Student[] => list.filter(isActiveStudent);

export type DropStudentResult = { students: Student[]; enrollments: Enrollment[] };

// 퇴원(소프트삭제) 트랜잭션.
//  - 학생: status → 'canceled' (레코드 보존)
//  - 수강등록: status → 'canceled' (스케줄/Join에서 자연 제외, 이력 보존)
//  - 보존 대상(건드리지 않음): 출석·수업보고서(학점)·상담·결제·부모연결
// 백엔드 매핑: PATCH /students/:id { status:'canceled' } 단일 트랜잭션으로 동일 처리.
export function dropStudent(
  students: Student[],
  enrollments: Enrollment[],
  id: number,
): DropStudentResult {
  return {
    students: students.map((s) => (s.id === id ? { ...s, status: 'canceled' } : s)),
    enrollments: enrollments.map((e) =>
      e.studentId === id ? { ...e, status: 'canceled' } : e,
    ),
  };
}
