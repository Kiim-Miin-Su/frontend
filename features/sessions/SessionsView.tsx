"use client";
import { useState } from "react";
import { Badge, SectionCard, type Tone } from "@/components/ui";
import { useSchedule, useCourses, useInstructors } from "@/lib/queries";
import type { SessionStatus } from "@/types";
import { shortDate } from "@/lib/format";
import { SessionForm } from "./SessionForm";

const tone: Record<SessionStatus, Tone> = {
  scheduled: "accent",
  held: "success",
  canceled: "danger",
  no_show: "attention",
  makeup: "done",
};
const label: Record<SessionStatus, string> = {
  scheduled: "예정",
  held: "진행완료",
  canceled: "취소",
  no_show: "결석",
  makeup: "보강",
};

export function SessionsView() {
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: instructors = [] } = useInstructors();

  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const rows = classSessions.filter((cs) => {
    if (!kw) return true;
    const course = courses.find((c) => c.id === cs.courseId)?.name ?? "";
    const instructor = instructors.find((i) => i.id === cs.instructorId)?.name ?? "";
    return [course, instructor, cs.topic ?? "", cs.sessionDate].some((v) => v.toLowerCase().includes(kw));
  });

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">수업 (강사)</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">진행 수업 목록 · 출석·피드백은 상세에서</p>
      </div>

      <SectionCard title="신규 수업 개설">
        {/* TODO: check 'is-admin?' */}
        <SessionForm />
      </SectionCard>

      <SectionCard
        title="수업 목록"
        action={
          <input
            className="input w-56 h-7"
            placeholder="코스·강사·주제·날짜 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>코스</th>
              <th>강사</th>
              <th>주제</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cs) => {
              const course = courses.find((c) => c.id === cs.courseId);
              const instructor = instructors.find((i) => i.id === cs.instructorId);
              return (
                <tr key={cs.id}>
                  <td className="mono">{shortDate(cs.sessionDate)}</td>
                  <td className="font-medium">{course?.name ?? "—"}</td>
                  <td className="text-fg-muted">{instructor?.name ?? "—"}</td>
                  <td className="text-fg-muted">{cs.topic ?? "—"}</td>
                  <td>
                    <Badge tone={tone[cs.status]}>{label[cs.status]}</Badge>
                  </td>
                  <td className="text-right">
                    <a href={`/sessions/${cs.id}`} className="btn btn-sm">
                      상세 · 출석
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
