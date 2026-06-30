import { create } from 'zustand';
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
  AttendanceStatus,
  SessionReport,
  Payment,
  Transaction,
  Expense,
  InstructorPayout,
  AcademyEvent,
  AccountRole,
  CounselForm,
  CounselRound,
  CounselStatus,
  Roadmap,
  RoadmapCourse,
  // 요청 DTO (단일 소스 @kms545487/contracts) — store/mock 매개변수도 동일 타입 사용
  CreateStudentInput,
  ParentLinkInput,
  CreateSubjectInput,
  CreateCourseInput,
  CreateRoadmapInput,
  CreateClassSessionInput,
  CreateRecurringInput,
  CreatePaymentInput,
  CreateExpenseInput,
  CreatePayoutInput,
  CreateEventInput,
  CreateCounselInput,
  CreateCounselRoundInput,
} from '@/types';
import * as seed from './mock/seed';
import { computeInstructorPay } from './payroll';
import { dropStudent as dropStudentTx } from './domain/students';

const nextId = (rows: { id: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

const today = () => new Date().toISOString().slice(0, 10);

// 학생 등록은 복합 폼 → 여러 엔드포인트로 분해되므로 단일 DTO로 합치지 않고
// 계약 DTO의 "조합(command)"으로 표현한다(UI 폼 책임 ≠ API 요청 책임).
//   student  → POST /students
//   parent   → POST /parents (신규 학생에 연결)
//   courseId → POST /enrollments
export type RegisterStudentCommand = {
  student: CreateStudentInput;
  parent?: ParentLinkInput;
  courseId?: number;
};

type TacoState = {
  // collections (in-memory mock DB)
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
  transactions: Transaction[];
  expenses: Expense[];
  instructorPayouts: InstructorPayout[];
  counselForms: CounselForm[];
  counselRounds: CounselRound[];
  academyEvents: AcademyEvent[];
  roadmaps: Roadmap[];
  roadmapCourses: RoadmapCourse[];

  // 데모용 현재 사용자(권한/본인 식별)
  currentRole: AccountRole;
  currentStudentId: number;
  setCurrentRole: (role: AccountRole) => void;
  setCurrentStudentId: (id: number) => void;

  // actions — 입력 payload는 계약 DTO(@kms545487/contracts)와 동일(단일 소스)
  addStudent: (input: RegisterStudentCommand) => Student; // 복합 폼: DTO 조합
  dropStudent: (id: number) => void; // 퇴원(소프트삭제): 비활성 전이, 데이터 보존
  addCounselForm: (input: CreateCounselInput) => CounselForm;
  updateCounselForm: (formId: number, patch: Partial<CounselForm>) => void;
  updateCounselStatus: (formId: number, status: CounselStatus) => void;
  addCounselRound: (formId: number, input: CreateCounselRoundInput) => void;
  addClassSession: (input: CreateClassSessionInput) => ClassSession;
  addRecurringClassSessions: (input: CreateRecurringInput) => number;
  addPayment: (input: CreatePaymentInput) => Payment;
  markPaymentPaid: (paymentId: number) => void;
  updatePayment: (id: number, patch: Partial<Payment>) => void;
  addExpense: (input: CreateExpenseInput) => Expense; // status=requested (승인 대기)
  approveExpense: (id: number) => void; // super_admin
  rejectExpense: (id: number) => void; // super_admin
  addInstructorPayout: (input: CreatePayoutInput) => InstructorPayout; // status=pending(요청)
  approvePayout: (id: number) => void; // super_admin → confirmed
  markPayoutPaid: (id: number) => void; // confirmed → paid (출금)
  addSubject: (input: CreateSubjectInput) => Subject;
  addCourse: (input: CreateCourseInput) => Course;
  addRoadmap: (input: CreateRoadmapInput) => Roadmap;
  addAcademyEvent: (input: CreateEventInput) => AcademyEvent;
  setAttendance: (sessionId: number, studentId: number, status: AttendanceStatus) => void;
  upsertReport: (
    sessionId: number,
    studentId: number,
    instructorId: number,
    patch: { content?: string; homework?: string },
  ) => void;
  submitReport: (sessionId: number, studentId: number) => void;
};

export const useTacoStore = create<TacoState>((set) => ({
  students: [...seed.students],
  parents: [...seed.parents],
  parentStudents: [...seed.parentStudents],
  instructors: [...seed.instructors],
  subjects: [...seed.subjects],
  courses: [...seed.courses],
  enrollments: [...seed.enrollments],
  classSessions: [...seed.classSessions],
  attendance: [...seed.attendance],
  sessionReports: [...seed.sessionReports],
  payments: [...seed.payments],
  transactions: [...seed.transactions],
  expenses: [...seed.expenses],
  instructorPayouts: [...seed.instructorPayouts],
  counselForms: [...seed.counselForms],
  counselRounds: [...seed.counselRounds],
  academyEvents: [...seed.academyEvents],
  roadmaps: [...seed.roadmaps],
  roadmapCourses: [...seed.roadmapCourses],

  currentRole: 'super_admin',
  currentStudentId: 1,
  setCurrentRole: (role) => set({ currentRole: role }),
  setCurrentStudentId: (id) => set({ currentStudentId: id }),

  addStudent: (input) => {
    const { student: s0, parent: p0, courseId } = input;
    const student: Student = {
      id: 0,
      name: s0.name,
      englishName: s0.englishName,
      grade: s0.grade,
      phone: s0.phone,
      status: s0.status ?? (courseId ? 'active' : 'lead'), // 코스 등록까지 하면 active
      webId: s0.webId,
    };
    set((s) => {
      student.id = nextId(s.students);
      const patch: Partial<TacoState> = { students: [student, ...s.students] };

      // 학부모(선택) → parents + 학생-부모 연결
      if (p0?.name) {
        const parent: Parent = {
          id: nextId(s.parents),
          name: p0.name,
          phone: p0.phone ?? '',
          kakaoAvailable: false,
          webId: p0.webId,
        };
        patch.parents = [...s.parents, parent];
        patch.parentStudents = [
          ...s.parentStudents,
          {
            id: nextId(s.parentStudents),
            parentId: parent.id,
            studentId: student.id,
            relation: p0.relation,
            isPayer: p0.isPayer ?? true,
            isPrimary: p0.isPrimary ?? true,
          },
        ];
      }

      // 등록 코스(선택) → enrollment 생성
      if (courseId) {
        patch.enrollments = [
          ...s.enrollments,
          {
            id: nextId(s.enrollments),
            studentId: student.id,
            courseId,
            status: 'active',
            completedSessions: 0,
            enrolledAt: today(),
          },
        ];
      }
      return patch;
    });
    return student;
  },

  // 퇴원(소프트삭제): 학생/수강을 비활성 전이만 하고 레코드는 보존.
  // 상담·수업보고서(학점)·결제·부모연결·출석 이력은 그대로 둔다(자산화).
  // 규칙은 도메인 레이어(lib/domain/students)에 위임 → 백엔드 동일 재현.
  dropStudent: (id) =>
    set((s) => dropStudentTx(s.students, s.enrollments, id)),

  setAttendance: (sessionId, studentId, status) =>
    set((s) => {
      const existing = s.attendance.find(
        (a) => a.sessionId === sessionId && a.studentId === studentId,
      );
      if (existing) {
        return {
          attendance: s.attendance.map((a) =>
            a === existing ? { ...a, status } : a,
          ),
        };
      }
      return {
        attendance: [
          ...s.attendance,
          { id: nextId(s.attendance), sessionId, studentId, status },
        ],
      };
    }),

  upsertReport: (sessionId, studentId, instructorId, patch) =>
    set((s) => {
      const existing = s.sessionReports.find(
        (r) => r.sessionId === sessionId && r.studentId === studentId,
      );
      if (existing) {
        return {
          sessionReports: s.sessionReports.map((r) =>
            r === existing ? { ...r, ...patch } : r,
          ),
        };
      }
      return {
        sessionReports: [
          ...s.sessionReports,
          {
            id: nextId(s.sessionReports),
            sessionId,
            studentId,
            instructorId,
            content: patch.content ?? '',
            homework: patch.homework,
            status: 'draft',
          },
        ],
      };
    }),

  submitReport: (sessionId, studentId) =>
    set((s) => ({
      sessionReports: s.sessionReports.map((r) =>
        r.sessionId === sessionId && r.studentId === studentId
          ? { ...r, status: 'submitted' }
          : r,
      ),
    })),

  // 상담 신청 (학생/학부모 자가 작성 또는 상담실장 작성) → status=requested
  addCounselForm: (input) => {
    const form: CounselForm = {
      id: 0,
      applicantName: input.applicantName,
      applicantPhone: input.applicantPhone,
      assignedStaffId: input.assignedStaffId,
      status: 'requested',
      source: input.source,
      interestSubjectId: input.interestSubjectId,
      interestCourseId: input.interestCourseId,
      academyExpectation: input.academyExpectation,
      desiredStartTime: input.desiredStartTime,
      learningAtmosphere: input.learningAtmosphere,
      studentIntention: input.studentIntention,
      weakness: input.weakness,
      createdAt: today(),
    };
    set((s) => {
      form.id = nextId(s.counselForms);
      return { counselForms: [form, ...s.counselForms] };
    });
    return form;
  },

  updateCounselForm: (formId, patch) =>
    set((s) => ({
      counselForms: s.counselForms.map((f) =>
        f.id === formId ? { ...f, ...patch } : f,
      ),
    })),

  updateCounselStatus: (formId, status) =>
    set((s) => ({
      counselForms: s.counselForms.map((f) =>
        f.id === formId ? { ...f, status } : f,
      ),
    })),

  // 상담 회차 추가 (roundNo 자동 증가)
  addCounselRound: (formId, input) =>
    set((s) => {
      const rounds = s.counselRounds.filter((r) => r.counselFormId === formId);
      const roundNo = rounds.reduce((max, r) => Math.max(max, r.roundNo), -1) + 1;
      return {
        counselRounds: [
          ...s.counselRounds,
          {
            id: nextId(s.counselRounds),
            counselFormId: formId,
            roundNo,
            counselorId: input.counselorId,
            completedAt: today(),
            isCompleted: true,
            summary: input.summary,
            detail: input.detail,
            result: input.result,
            nextAction: input.nextAction,
            nextContactAt: input.nextContactAt,
          },
        ],
      };
    }),

  // 신규 수업 개설 (예정 상태)
  addClassSession: (input) => {
    const session: ClassSession = {
      id: 0,
      courseId: input.courseId,
      instructorId: input.instructorId,
      sessionDate: input.sessionDate,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      status: 'scheduled',
      topic: input.topic,
    };
    set((s) => {
      session.id = nextId(s.classSessions);
      return { classSessions: [session, ...s.classSessions] };
    });
    return session;
  },

  // 결제 청구 생성 (미수)
  addPayment: (input) => {
    const payment: Payment = {
      id: 0,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      amount: input.amount,
      paidAmount: 0,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      dueAt: input.dueAt,
      createdAt: today(), // 등록일(청구 생성일) — 백엔드: DEFAULT now()
    };
    set((s) => {
      payment.id = nextId(s.payments);
      return { payments: [payment, ...s.payments] };
    });
    return payment;
  },

  // 수납 완료 → 입금 거래 원장에 반영 (대시보드 입금/미수금 연동)
  markPaymentPaid: (paymentId) =>
    set((s) => {
      const payment = s.payments.find((p) => p.id === paymentId);
      if (!payment || payment.status === 'paid') return {};
      const student = s.students.find((st) => st.id === payment.studentId);
      const tx: Transaction = {
        id: nextId(s.transactions),
        direction: 'in',
        category: 'enrollment',
        label: `수강료 입금 · ${student?.name ?? '학생'}`,
        amount: payment.amount,
        method: payment.paymentMethod,
        occurredAt: today(),
      };
      return {
        payments: s.payments.map((p) =>
          p.id === paymentId
            ? { ...p, status: 'paid', paidAmount: p.amount, paidAt: today() }
            : p,
        ),
        transactions: [tx, ...s.transactions],
      };
    }),

  // 지출 요청 → super_admin 승인 후 출금 반영 (승인 전에는 원장/대시보드 미반영)
  addExpense: (input) => {
    const expense: Expense = {
      id: 0,
      category: input.category,
      title: input.title,
      amount: input.amount,
      spentAt: input.spentAt,
      vendor: input.vendor,
      memo: input.memo,
      receiptUrl: input.receiptUrl,
      status: 'requested',
    };
    set((s) => {
      expense.id = nextId(s.expenses);
      return { expenses: [expense, ...s.expenses] };
    });
    return expense;
  },

  approveExpense: (id) =>
    set((s) => {
      const ex = s.expenses.find((e) => e.id === id);
      if (!ex || ex.status !== 'requested') return {};
      const tx: Transaction = {
        id: nextId(s.transactions),
        direction: 'out',
        category: 'expense',
        label: ex.title,
        amount: ex.amount,
        occurredAt: ex.spentAt,
      };
      return {
        expenses: s.expenses.map((e) => (e.id === id ? { ...e, status: 'approved' } : e)),
        transactions: [tx, ...s.transactions],
      };
    }),

  rejectExpense: (id) =>
    set((s) => ({
      expenses: s.expenses.map((e) => (e.id === id ? { ...e, status: 'rejected' } : e)),
    })),

  // 강사 페이: 시수×시급으로 산정해 요청 생성 (status=pending)
  addInstructorPayout: (input) => {
    const payout: InstructorPayout = {
      id: 0,
      instructorId: input.instructorId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      sessionCount: 0,
      totalMinutes: 0,
      amount: 0,
      status: 'pending',
    };
    set((s) => {
      const c = computeInstructorPay(s.classSessions, s.courses, input.instructorId, input.periodStart, input.periodEnd);
      payout.id = nextId(s.instructorPayouts);
      payout.sessionCount = c.sessionCount;
      payout.totalMinutes = c.totalMinutes;
      payout.amount = c.amount;
      return { instructorPayouts: [payout, ...s.instructorPayouts] };
    });
    return payout;
  },

  approvePayout: (id) =>
    set((s) => ({
      instructorPayouts: s.instructorPayouts.map((p) =>
        p.id === id && p.status === 'pending' ? { ...p, status: 'confirmed' } : p,
      ),
    })),

  markPayoutPaid: (id) =>
    set((s) => {
      const p = s.instructorPayouts.find((x) => x.id === id);
      if (!p || p.status !== 'confirmed') return {};
      const instr = s.instructors.find((i) => i.id === p.instructorId);
      const tx: Transaction = {
        id: nextId(s.transactions),
        direction: 'out',
        category: 'instructor_payout',
        label: `강사 페이 · ${instr?.name ?? '강사'}`,
        amount: p.amount,
        occurredAt: today(),
      };
      return {
        instructorPayouts: s.instructorPayouts.map((x) =>
          x.id === id ? { ...x, status: 'paid', paidAt: today() } : x,
        ),
        transactions: [tx, ...s.transactions],
      };
    }),

  // 기간 + 요일 반복으로 수업 다건 생성 (캘린더 표시용)
  addRecurringClassSessions: (input) => {
    let count = 0;
    set((s) => {
      const sessions: ClassSession[] = [];
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      let nid = s.classSessions.reduce((m, r) => Math.max(m, r.id), 0);
      // 같은 시리즈 묶음 id(시리즈 편집용)
      const seriesId =
        s.classSessions.reduce((m, r) => Math.max(m, r.seriesId ?? 0), 0) + 1;
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (input.weekdays.includes(d.getDay())) {
          nid += 1;
          sessions.push({
            id: nid,
            seriesId,
            courseId: input.courseId,
            instructorId: input.instructorId,
            sessionDate: d.toISOString().slice(0, 10),
            startTime: input.startTime,
            durationMinutes: input.durationMinutes,
            status: 'scheduled',
            topic: input.topic,
          });
        }
      }
      count = sessions.length;
      return { classSessions: [...sessions, ...s.classSessions] };
    });
    return count;
  },

  updatePayment: (id, patch) =>
    set((s) => ({
      payments: s.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  addSubject: (input) => {
    const subject: Subject = { id: 0, code: input.code, name: input.name };
    set((s) => {
      subject.id = nextId(s.subjects);
      return { subjects: [...s.subjects, subject] };
    });
    return subject;
  },

  addCourse: (input) => {
    const course: Course = {
      id: 0,
      name: input.name,
      subjectId: input.subjectId,
      instructorId: input.instructorId,
      price: input.price,
      hourlyRate: input.hourlyRate,
      color: input.color,
    };
    set((s) => {
      course.id = nextId(s.courses);
      return { courses: [...s.courses, course] };
    });
    return course;
  },

  // 로드맵 생성 + 코스 M:N 연결(순서 보존)
  addRoadmap: (input) => {
    const roadmap: Roadmap = {
      id: 0,
      title: input.title,
      description: input.description,
      targetGrade: input.targetGrade,
      isActive: true,
    };
    set((s) => {
      roadmap.id = nextId(s.roadmaps);
      let rcId = nextId(s.roadmapCourses) - 1;
      const links: RoadmapCourse[] = (input.courseIds ?? []).map((courseId, i) => ({
        id: ++rcId,
        roadmapId: roadmap.id,
        courseId,
        sortOrder: i,
      }));
      return {
        roadmaps: [...s.roadmaps, roadmap],
        roadmapCourses: [...s.roadmapCourses, ...links],
      };
    });
    return roadmap;
  },

  addAcademyEvent: (input) => {
    const ev: AcademyEvent = {
      id: 0,
      title: input.title,
      type: input.type,
      priority: input.priority ?? 'normal',
      startDate: input.startDate,
      endDate: input.endDate,
      allDay: input.allDay,
      memo: input.memo,
    };
    set((s) => {
      ev.id = nextId(s.academyEvents);
      return { academyEvents: [ev, ...s.academyEvents] };
    });
    return ev;
  },
}));
