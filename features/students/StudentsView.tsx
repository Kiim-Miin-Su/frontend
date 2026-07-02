"use client";
// 목록 데이터(students·enrollments·courses·parentStudents·parents)는 TanStack Query로 읽고,
// dropStudent는 백엔드 훅이 없는 클라이언트 상태 액션이라 store에 그대로 둔다.
import { Badge, SectionCard, StatusDot, type Tone } from "@/components/ui";
import { useTacoStore } from "@/lib/store";
import { useStudents, useEnrollments, useCourses, useParentStudents, useParents } from "@/lib/queries";
import { isActiveStudent } from "@/lib/domain/students";
import type { StudentStatus } from "@/types";
import { StudentForm } from "./StudentForm";
import { useState } from "react";

const tone: Record<StudentStatus, Tone> = {
  lead: "neutral",
  active: "success",
  paused: "attention",
  completed: "done",
  canceled: "danger",
};
const label: Record<StudentStatus, string> = {
  lead: "신규접수",
  active: "수강중",
  paused: "일시정지",
  completed: "수료",
  canceled: "퇴원",
};

export function StudentsView() {
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const dropStudent = useTacoStore((s) => s.dropStudent);
  const [q, setQ] = useState("");
  const [showDropped, setShowDropped] = useState(false);
  const kw = q.trim().toLowerCase();

  // 기본 스코프 = 활성 학생만(퇴원 제외). 토글 시 퇴원 포함.
  const scoped = showDropped ? students : students.filter(isActiveStudent);
  const filtered = kw
    ? scoped.filter((s) =>
        [s.name, s.englishName, s.webId, s.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw)),
      )
    : scoped;
  const activeCount = students.filter(isActiveStudent).length;

  const coursesOf = (studentId: number) =>
    enrollments
      .filter((e) => e.studentId === studentId)
      .map((e) => courses.find((c) => c.id === e.courseId)?.name)
      .filter(Boolean);

  const parentOf = (studentId: number) => {
    const link = parentStudents.find((ps) => ps.studentId === studentId);
    if (!link) return undefined;
    const p = parents.find((x) => x.id === link.parentId);
    return p ? `${p.name} (${link.relation ?? "보호자"})` : undefined;
  };

  return (
    <div className="p-6 max-w-[1180px] mx-auto space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">학생</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">학생 등록 및 목록 · 활성 {activeCount}명</p>
      </div>

      <SectionCard title="학생 등록">
        <StudentForm />
      </SectionCard>

      <SectionCard
        title="학생 목록"
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-fg-muted select-none">
              <input type="checkbox" checked={showDropped} onChange={(e) => setShowDropped(e.target.checked)} />
              퇴원 포함
            </label>
            <input className="input w-56 h-7" placeholder="이름·영문·ID·연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학년</th>
                <th>Web ID</th>
                <th>등록 코스</th>
                <th>학부모</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const cs = coursesOf(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[12px] text-fg-subtle">{s.englishName ?? ""}</div>
                    </td>
                    <td className="mono">{s.grade ?? "—"}</td>
                    <td className="mono text-fg-muted">{s.webId ?? <span className="text-fg-subtle">미가입</span>}</td>
                    <td className="text-fg-muted">{cs.length ? cs.join(", ") : "—"}</td>
                    <td className="text-fg-muted">{parentOf(s.id) ?? "—"}</td>
                    <td>
                      <Badge tone={tone[s.status]}>
                        <StatusDot tone={tone[s.status]} label={label[s.status]} />
                      </Badge>
                    </td>
                    <td className="text-right">
                      {isActiveStudent(s) ? (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (
                              confirm(
                                `${s.name} 학생을 퇴원 처리할까요?\n상담·수업보고서·결제 등 이력은 보존되며, 활성 목록과 일정에서만 제외됩니다.`,
                              )
                            ) {
                              dropStudent(s.id);
                            }
                          }}
                        >
                          퇴원 처리
                        </button>
                      ) : (
                        <span className="text-[12px] text-fg-subtle">퇴원됨</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
