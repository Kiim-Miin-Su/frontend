// ──────────────────────────────────────────────────────────────
// 전 도메인 mock 데이터 (단일 소스). lib/store.ts가 이걸로 초기화합니다.
// 실제 API 연동 시 이 파일을 걷어내고 lib/api 호출로 교체하면 됩니다.
// ID 교차참조에 주의해서 수정하세요.
// ──────────────────────────────────────────────────────────────
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
  Transaction,
  Expense,
  InstructorPayout,
  CounselForm,
  CounselRound,
  AcademyEvent,
  Roadmap,
  RoadmapCourse,
} from '@/types';

export const instructors: Instructor[] = [
  { id: 1, name: '박지훈', subjectName: '영어' },
  { id: 2, name: '정유진', subjectName: '수학' },
];

export const subjects: Subject[] = [
  { id: 1, code: 'english', name: '영어' },
  { id: 2, code: 'math', name: '수학' },
];

export const courses: Course[] = [
  { id: 10, name: 'SAT Reading 정규', subjectId: 1, instructorId: 1, price: 480000, hourlyRate: 50000 },
  { id: 11, name: 'AP Calculus BC', subjectId: 2, instructorId: 2, price: 520000, hourlyRate: 60000 },
  { id: 12, name: 'TOEFL 정규', subjectId: 1, instructorId: 1, price: 420000, hourlyRate: 45000 },
];

export const students: Student[] = [
  { id: 1, name: '김서연', englishName: 'Sophia', grade: 11, status: 'active' },
  { id: 2, name: '이준호', englishName: 'Daniel', grade: 12, status: 'active' },
  { id: 3, name: '박지민', englishName: 'Emma', grade: 10, status: 'paused' },
  { id: 4, name: '최민준', englishName: 'Lucas', grade: 11, status: 'active' },
];

export const parents: Parent[] = [
  { id: 1, name: '김미경', phone: '010-1111-2222', kakaoAvailable: true },
  { id: 2, name: '이상철', phone: '010-3333-4444', kakaoAvailable: true },
  { id: 3, name: '최영희', phone: '010-5555-6666', kakaoAvailable: false },
];

export const parentStudents: ParentStudent[] = [
  { id: 1, parentId: 1, studentId: 1, relation: '모', isPayer: true, isPrimary: true },
  { id: 2, parentId: 2, studentId: 2, relation: '부', isPayer: true, isPrimary: true },
  { id: 3, parentId: 3, studentId: 4, relation: '모', isPayer: true, isPrimary: true },
];

export const enrollments: Enrollment[] = [
  // 월 8회 주기 기준 7회 진행 → 재결제 1회 남음(알림 트리거)
  { id: 1, studentId: 1, courseId: 10, status: 'active', totalSessions: 16, completedSessions: 7, enrolledAt: '2026-06-24' },
  { id: 2, studentId: 2, courseId: 11, status: 'active', totalSessions: 20, completedSessions: 6, enrolledAt: '2026-06-23' },
  { id: 3, studentId: 4, courseId: 10, status: 'active', totalSessions: 16, completedSessions: 6, enrolledAt: '2026-06-20' },
  { id: 4, studentId: 1, courseId: 12, status: 'active', totalSessions: 12, completedSessions: 2, enrolledAt: '2026-06-18' },
];

export const classSessions: ClassSession[] = [
  { id: 1, courseId: 10, instructorId: 1, sessionDate: '2026-06-24', startTime: '16:00', durationMinutes: 90, status: 'held', topic: 'Reading: 추론(Inference) 문제 전략' },
  { id: 2, courseId: 11, instructorId: 2, sessionDate: '2026-06-23', startTime: '18:00', durationMinutes: 90, status: 'held', topic: '적분 응용 (부분적분)' },
  { id: 3, courseId: 10, instructorId: 1, sessionDate: '2026-06-26', startTime: '16:00', durationMinutes: 90, status: 'scheduled', topic: 'Vocabulary in context' },
  // 진행됐지만 리포트 미작성(강사 To-do) — 시수가 잡히려면 리포트 작성·승인 필요
  { id: 6, courseId: 12, instructorId: 1, sessionDate: '2026-06-29', startTime: '18:00', durationMinutes: 90, status: 'held', topic: 'TOEFL Writing 통합형' },
  // 오늘 수업(강사 To-do)
  { id: 7, courseId: 10, instructorId: 1, sessionDate: '2026-06-30', startTime: '16:00', durationMinutes: 90, status: 'scheduled', topic: 'Reading: 근거 문장 매칭' },
  // 다가오는 수업
  { id: 8, courseId: 12, instructorId: 1, sessionDate: '2026-07-01', startTime: '18:00', durationMinutes: 90, status: 'scheduled', topic: 'TOEFL Speaking Task 1-2' },
];

// 수업1(코스10) 수강생: 학생 1,4 / 수업2(코스11) 수강생: 학생 2
export const attendance: Attendance[] = [
  { id: 1, sessionId: 1, studentId: 1, status: 'present' },
  { id: 2, sessionId: 1, studentId: 4, status: 'late' },
  { id: 3, sessionId: 2, studentId: 2, status: 'present' },
];

export const sessionReports: SessionReport[] = [
  {
    id: 1,
    sessionId: 1,
    studentId: 1,
    instructorId: 1,
    content: '추론 문제 정답률이 지난주 대비 향상되었습니다. 근거 문장 찾기를 잘 합니다.',
    homework: 'Passage 3-4 복습, 어휘 20개',
    status: 'submitted',
  },
];

export const payments: Payment[] = [
  { id: 1, enrollmentId: 1, studentId: 1, amount: 480000, status: 'paid', paymentMethod: 'card', createdAt: '2026-06-24', paidAt: '2026-06-24' },
  { id: 2, enrollmentId: 2, studentId: 2, amount: 520000, status: 'paid', paymentMethod: 'transfer', createdAt: '2026-06-23', paidAt: '2026-06-23' },
  { id: 3, enrollmentId: 3, studentId: 4, amount: 480000, status: 'pending', createdAt: '2026-06-25', dueAt: '2026-06-30' },
  { id: 4, enrollmentId: 4, studentId: 1, amount: 420000, status: 'pending', createdAt: '2026-06-24', dueAt: '2026-06-28' },
  { id: 5, enrollmentId: 3, studentId: 4, amount: 480000, status: 'paid', paymentMethod: 'card', createdAt: '2026-06-08', paidAt: '2026-06-10' },
  { id: 6, enrollmentId: 4, studentId: 1, amount: 420000, status: 'paid', paymentMethod: 'transfer', createdAt: '2026-05-26', paidAt: '2026-05-28' },
  { id: 7, enrollmentId: 2, studentId: 2, amount: 520000, status: 'paid', paymentMethod: 'card', createdAt: '2026-05-13', paidAt: '2026-05-15' },
];

export const transactions: Transaction[] = [
  { id: 1, direction: 'in', category: 'enrollment', label: '신규 수강 입금 · 김서연', amount: 480000, method: 'card', occurredAt: '2026-06-24' },
  { id: 2, direction: 'out', category: 'instructor_payout', label: '강사 페이 · 6월 1차 정산', amount: 1850000, method: 'transfer', occurredAt: '2026-06-24' },
  { id: 3, direction: 'in', category: 're_enrollment', label: '재수강 입금 · 이준호', amount: 520000, method: 'transfer', occurredAt: '2026-06-23' },
  { id: 4, direction: 'out', category: 'expense', label: '비품 구입 · 화이트보드 외', amount: 86000, method: 'cash', occurredAt: '2026-06-22' },
];

export const expenses: Expense[] = [
  { id: 1, category: 'supplies', title: '화이트보드 마커 외', amount: 86000, spentAt: '2026-06-22', vendor: '오피스디포', status: 'approved' },
  { id: 2, category: 'books', title: 'SAT 교재 30부', amount: 450000, spentAt: '2026-06-18', vendor: '교보문고', status: 'approved' },
  { id: 3, category: 'equipment', title: '빔프로젝터 1대', amount: 680000, spentAt: '2026-06-15', vendor: '전자랜드', status: 'approved' },
  { id: 4, category: 'utility', title: '6월 전기·인터넷', amount: 240000, spentAt: '2026-06-10', status: 'approved' },
  { id: 5, category: 'meal', title: '강사 회식', amount: 180000, spentAt: '2026-06-20', status: 'requested' },
];

// 백엔드 payouts 시드(강사2 지급완료 1건)와 정합 — 배지가 실제 정산 페이지(백엔드)와 어긋나지
// 않도록 paid 1건만 둔다. 미정산 데모는 PayoutsView에서 백엔드로 생성·승인·지급 시연. (단일 소스화는 TBO-07)
export const instructorPayouts: InstructorPayout[] = [
  { id: 1, instructorId: 2, periodStart: '2026-06-16', periodEnd: '2026-06-30', sessionCount: 8, totalMinutes: 720, amount: 1320000, status: 'paid' },
];

// ── 상담 (counsel_form / counsel_rounds) ──
export const counselForms: CounselForm[] = [
  // 진행중(pending) — 학부모가 내부 폼으로 신청, 라운드 2회
  {
    id: 1,
    applicantName: '한서진',
    applicantPhone: '010-7777-1212',
    assignedStaffId: 1,
    status: 'pending',
    source: 'internal_form',
    interestSubjectId: 1,
    academyExpectation: '내신·수능 영어 전반 보완, 독해 속도 개선',
    desiredStartTime: 'within_1_month',
    learningAtmosphere: 'needs_management',
    studentIntention: 'parent_only',
    weakness: '독해 속도, 어휘량 부족',
    nextContactAt: '2026-06-29',
    createdAt: '2026-06-18',
  },
  // 등록완료(registered) — 네이버 폼 유입, 라운드 2회 후 등록 전환
  {
    id: 2,
    applicantName: '오민재',
    applicantPhone: '010-8888-3434',
    assignedStaffId: 1,
    status: 'registered',
    source: 'naver_form',
    interestCourseId: 11,
    interestSubjectId: 2,
    academyExpectation: 'AP Calculus 대비',
    desiredStartTime: 'immediately',
    learningAtmosphere: 'self_directed',
    studentIntention: 'student_wants',
    weakness: '서술형 풀이 과정',
    createdAt: '2026-06-12',
  },
  // 신규 접수(requested) — 상담실장 수기 접수, 라운드 없음
  {
    id: 3,
    applicantName: '신유나',
    applicantPhone: '010-9999-5656',
    status: 'requested',
    source: 'manual',
    interestSubjectId: 1,
    desiredStartTime: 'undecided',
    studentIntention: 'unknown',
    createdAt: '2026-06-25',
  },
];

export const counselRounds: CounselRound[] = [
  // form 1 (pending)
  {
    id: 1, counselFormId: 1, roundNo: 0, counselorId: 1,
    completedAt: '2026-06-19', isCompleted: true,
    summary: '초기 전화 상담', detail: '현 성적·목표 파악. 레벨테스트 권유.',
    result: 'neutral', nextAction: '레벨테스트 일정 조율', nextContactAt: '2026-06-23',
  },
  {
    id: 2, counselFormId: 1, roundNo: 1, counselorId: 1,
    completedAt: '2026-06-24', isCompleted: true,
    summary: '레벨테스트 후 대면 상담', detail: '독해 보강 필요. SAT Reading 정규 제안.',
    result: 'positive', nextAction: '수강 등록 안내', nextContactAt: '2026-06-29',
  },
  // form 2 (registered)
  {
    id: 3, counselFormId: 2, roundNo: 0, counselorId: 1,
    completedAt: '2026-06-13', isCompleted: true,
    summary: '온라인 상담', detail: 'AP 일정 및 커리큘럼 안내.',
    result: 'positive', nextAction: '시간표 확정',
  },
  {
    id: 4, counselFormId: 2, roundNo: 1, counselorId: 1,
    completedAt: '2026-06-16', isCompleted: true,
    summary: '등록 확정 상담', detail: 'AP Calculus BC 등록 결정.',
    result: 'registered', nextAction: '결제 및 반 배정',
  },
];

// ── 학원 이벤트 (admin 발행) ──
export const academyEvents: AcademyEvent[] = [
  { id: 1, title: '여름 특강 등록 시작', type: 'notice', priority: 'high', startDate: '2026-06-25', endDate: '2026-06-30' },
  { id: 2, title: 'SAT 모의고사', type: 'exam', priority: 'high', startDate: '2026-06-28', endDate: '2026-06-28', allDay: true },
  { id: 3, title: '창립기념일 휴원', type: 'holiday', priority: 'high', startDate: '2026-07-01', endDate: '2026-07-01', allDay: true },
  { id: 4, title: '자습실 연장 운영', type: 'notice', priority: 'normal', startDate: '2026-06-26', endDate: '2026-06-30' },
];

// ── 로드맵 (코스 묶음) + 코스 M:N 연결 ──
export const roadmaps: Roadmap[] = [
  { id: 1, title: 'SAT 종합 로드맵', description: 'Reading→TOEFL 병행 코스 묶음', targetGrade: 11, durationWeeks: 24, isActive: true },
];
export const roadmapCourses: RoadmapCourse[] = [
  { id: 1, roadmapId: 1, courseId: 10, sortOrder: 0 },
  { id: 2, roadmapId: 1, courseId: 12, sortOrder: 1 },
];
