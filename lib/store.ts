// [클라이언트 전용 상태] TanStack Query가 서버 데이터의 단일 소스가 된 후,
//  zustand는 서버와 무관한 클라이언트 상태만 보관한다.
//   - currentRole/currentStudentId: 데모용 현재 사용자(권한/본인 식별)
//   - reportTemplates: 강사가 자주 쓰는 리포트 내용/숙제(클라이언트 보관)
//   - expenseRejectReasons: 지출 반려 사유(Expense 계약 외 클라이언트 보관)
import { create } from 'zustand';
import type { AccountRole } from '@/types';

const nextId = (rows: { id: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

// 리포트 템플릿(클라이언트 보관) — 강사가 자주 쓰는 내용/숙제를 저장해 빠르게 적용.
export type ReportTemplate = { id: number; name: string; content: string; homework?: string };

type TacoState = {
  // 데모용 현재 사용자(권한/본인 식별)
  currentRole: AccountRole;
  currentStudentId: number;
  setCurrentRole: (role: AccountRole) => void;
  setCurrentStudentId: (id: number) => void;

  // 리포트 템플릿
  reportTemplates: ReportTemplate[];
  addReportTemplate: (name: string, content: string, homework?: string) => void;
  deleteReportTemplate: (id: number) => void;

  // 지출 반려 사유(Expense 계약 외 클라이언트 보관)
  expenseRejectReasons: Record<number, string>;
  setExpenseRejectReason: (id: number, reason: string) => void;
};

export const useTacoStore = create<TacoState>((set) => ({
  currentRole: 'super_admin',
  currentStudentId: 1,
  setCurrentRole: (role) => set({ currentRole: role }),
  setCurrentStudentId: (id) => set({ currentStudentId: id }),

  reportTemplates: [
    { id: 1, name: '정규 수업(기본)', content: '오늘 학습 내용: \n이해도: 상/중/하\n특이사항: ', homework: '교재 p.   ~   풀이' },
    { id: 2, name: '시험 대비', content: '대비 범위: \n취약 단원: \n보강 권장: ', homework: '오답노트 정리' },
  ],
  addReportTemplate: (name, content, homework) =>
    set((s) => ({
      reportTemplates: [...s.reportTemplates, { id: nextId(s.reportTemplates), name, content, homework }],
    })),
  deleteReportTemplate: (id) =>
    set((s) => ({ reportTemplates: s.reportTemplates.filter((t) => t.id !== id) })),

  expenseRejectReasons: {},
  setExpenseRejectReason: (id, reason) =>
    set((s) => ({ expenseRejectReasons: { ...s.expenseRejectReasons, [id]: reason } })),
}));
