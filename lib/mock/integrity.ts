import type {
  Student,
  Parent,
  ParentStudent,
  Instructor,
  Subject,
  Course,
  Enrollment,
  ClassSession,
  Attendance,
  SessionReport,
  Payment,
  CounselForm,
  CounselRound,
} from '@/types';

// 참조 무결성 검사 대상 컬렉션
export type IntegrityInput = {
  students: Student[];
  parents: Parent[];
  parentStudents: ParentStudent[];
  instructors: Instructor[];
  subjects: Subject[];
  courses: Course[];
  enrollments: Enrollment[];
  classSessions: ClassSession[];
  attendance: Attendance[];
  sessionReports: SessionReport[];
  payments: Payment[];
  counselForms: CounselForm[];
  counselRounds: CounselRound[];
};

export type Problem = { table: string; id: number; issue: string };

const idset = (rows: { id: number }[]) => new Set(rows.map((r) => r.id));

/**
 * mock 데이터의 참조 무결성을 점검합니다.
 * 예: 삭제된 학생을 가리키는 출석/피드백, 등록되지 않은 학생의 출석 등.
 * 문제 목록을 반환(빈 배열이면 정상).
 */
export function checkIntegrity(s: IntegrityInput): Problem[] {
  const problems: Problem[] = [];
  const add = (table: string, id: number, issue: string) => problems.push({ table, id, issue });

  const studentIds = idset(s.students);
  const parentIds = idset(s.parents);
  const instructorIds = idset(s.instructors);
  const subjectIds = idset(s.subjects);
  const courseIds = idset(s.courses);
  const sessionIds = idset(s.classSessions);
  const enrollmentIds = idset(s.enrollments);
  const counselFormIds = idset(s.counselForms);

  // 코스 → 과목/강사
  for (const c of s.courses) {
    if (!subjectIds.has(c.subjectId)) add('courses', c.id, `subjectId ${c.subjectId} 없음`);
    if (!instructorIds.has(c.instructorId)) add('courses', c.id, `instructorId ${c.instructorId} 없음`);
  }

  // 수강등록 → 학생/코스
  const enrolledPairs = new Set<string>(); // `${courseId}:${studentId}`
  for (const e of s.enrollments) {
    if (!studentIds.has(e.studentId)) add('enrollments', e.id, `studentId ${e.studentId} 없음`);
    if (!courseIds.has(e.courseId)) add('enrollments', e.id, `courseId ${e.courseId} 없음`);
    enrolledPairs.add(`${e.courseId}:${e.studentId}`);
  }

  // 수업 → 코스/강사
  for (const cs of s.classSessions) {
    if (!courseIds.has(cs.courseId)) add('classSessions', cs.id, `courseId ${cs.courseId} 없음`);
    if (!instructorIds.has(cs.instructorId)) add('classSessions', cs.id, `instructorId ${cs.instructorId} 없음`);
  }
  const sessionCourse = new Map(s.classSessions.map((cs) => [cs.id, cs.courseId]));

  // 출석 → 수업/학생 + "그 수업(코스)에 실제 등록된 학생인가"
  for (const a of s.attendance) {
    if (!sessionIds.has(a.sessionId)) add('attendance', a.id, `sessionId ${a.sessionId} 없음`);
    if (!studentIds.has(a.studentId)) add('attendance', a.id, `studentId ${a.studentId} 없음(삭제된 학생?)`);
    const courseId = sessionCourse.get(a.sessionId);
    if (courseId !== undefined && !enrolledPairs.has(`${courseId}:${a.studentId}`)) {
      add('attendance', a.id, `학생 ${a.studentId} 가 코스 ${courseId} 에 미등록`);
    }
  }

  // 피드백 → 수업/학생/강사 + 등록 여부
  for (const r of s.sessionReports) {
    if (!sessionIds.has(r.sessionId)) add('sessionReports', r.id, `sessionId ${r.sessionId} 없음`);
    if (!studentIds.has(r.studentId)) add('sessionReports', r.id, `studentId ${r.studentId} 없음(삭제된 학생?)`);
    if (!instructorIds.has(r.instructorId)) add('sessionReports', r.id, `instructorId ${r.instructorId} 없음`);
    const courseId = sessionCourse.get(r.sessionId);
    if (courseId !== undefined && !enrolledPairs.has(`${courseId}:${r.studentId}`)) {
      add('sessionReports', r.id, `학생 ${r.studentId} 가 코스 ${courseId} 에 미등록`);
    }
  }

  // 학생↔부모 → 부모/학생
  for (const ps of s.parentStudents) {
    if (!parentIds.has(ps.parentId)) add('parentStudents', ps.id, `parentId ${ps.parentId} 없음`);
    if (!studentIds.has(ps.studentId)) add('parentStudents', ps.id, `studentId ${ps.studentId} 없음`);
  }

  // 결제 → 학생/수강등록
  for (const p of s.payments) {
    if (!studentIds.has(p.studentId)) add('payments', p.id, `studentId ${p.studentId} 없음`);
    if (p.enrollmentId !== undefined && !enrollmentIds.has(p.enrollmentId)) {
      add('payments', p.id, `enrollmentId ${p.enrollmentId} 없음`);
    }
  }

  // 상담카드 → (있을 때만) 부모/학생/담당자/과목/코스
  for (const f of s.counselForms) {
    if (f.parentId !== undefined && !parentIds.has(f.parentId)) add('counselForms', f.id, `parentId ${f.parentId} 없음`);
    if (f.studentId !== undefined && !studentIds.has(f.studentId)) add('counselForms', f.id, `studentId ${f.studentId} 없음`);
    if (f.assignedStaffId !== undefined && !instructorIds.has(f.assignedStaffId)) add('counselForms', f.id, `assignedStaffId ${f.assignedStaffId} 없음`);
    if (f.interestSubjectId !== undefined && !subjectIds.has(f.interestSubjectId)) add('counselForms', f.id, `interestSubjectId ${f.interestSubjectId} 없음`);
    if (f.interestCourseId !== undefined && !courseIds.has(f.interestCourseId)) add('counselForms', f.id, `interestCourseId ${f.interestCourseId} 없음`);
  }

  // 상담 회차 → 상담카드/담당자
  for (const r of s.counselRounds) {
    if (!counselFormIds.has(r.counselFormId)) add('counselRounds', r.id, `counselFormId ${r.counselFormId} 없음(삭제된 상담?)`);
    if (r.counselorId !== undefined && !instructorIds.has(r.counselorId)) add('counselRounds', r.id, `counselorId ${r.counselorId} 없음`);
  }

  return problems;
}
