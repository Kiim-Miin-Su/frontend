// [참조/처리] 수업 피드백(보고서) 작성 — 읽기=TanStack Query 단일 소스, 쓰기=useCreateReport/useSubmitReport.
//  보고서는 (sessionId,studentId)로 최대 1건(백엔드 단일 소스 규칙). 신규면 create(POST /reports),
//  기존 draft 제출은 submit(id). 성공 시 qk.reports 무효화 → 목록 자동 갱신.
"use client";
import { useState } from "react";
import Link from "next/link";
import { Badge, SectionCard, type Tone } from "@/components/ui";
import {
  useSchedule, useStudents, useReports, useParentStudents, useParents, useCourses,
  useCreateReport, useSubmitReport,
} from "@/lib/queries";
import type { ReportStatus } from "@/types";

const reportTone: Record<ReportStatus, Tone> = { draft: "neutral", submitted: "accent", sent: "success" };
const reportLabel: Record<ReportStatus, string> = { draft: "작성중", submitted: "작성완료", sent: "발송됨" };

export function FeedbackFormView({ sessionId, studentId }: { sessionId: number; studentId: number }) {
  const { data: classSessions = [] } = useSchedule();
  const { data: students = [] } = useStudents();
  const { data: sessionReports = [] } = useReports();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const { data: courses = [] } = useCourses();
  const createReport = useCreateReport();
  const submitReport = useSubmitReport();
  const session = classSessions.find((s) => s.id === sessionId);
  const student = students.find((s) => s.id === studentId);
  const report = sessionReports.find((r) => r.sessionId === sessionId && r.studentId === studentId);

  // 학부모 join (학생 → parent_student_relations → parents) — 추후 MQ 카카오 발송 대상
  const link =
    parentStudents.find((ps) => ps.studentId === studentId && ps.isPrimary) ??
    parentStudents.find((ps) => ps.studentId === studentId);
  const parent = link ? parents.find((p) => p.id === link.parentId) : undefined;

  const [content, setContent] = useState(report?.content ?? "");
  const [homework, setHomework] = useState(report?.homework ?? "");

  if (!session || !student) {
    return <div className="p-6 max-w-[760px] mx-auto text-fg-muted">대상을 찾을 수 없습니다.</div>;
  }

  const course = courses.find((c) => c.id === session.courseId);
  const save = (submit: boolean) => {
    // 기존 draft가 있으면 제출(submit by id). 없으면 신규 생성(create). 백엔드가 (session,student) 단일화.
    if (report) {
      if (submit && report.approvalStatus !== "submitted" && report.approvalStatus !== "approved") {
        submitReport.mutate(report.id);
      }
      return;
    }
    createReport.mutate({
      sessionId,
      studentId,
      instructorId: session.instructorId,
      content,
      homework: homework || undefined,
      status: submit ? "submitted" : "draft",
    });
  };

  return (
    <div className="p-6 max-w-[760px] mx-auto space-y-5">
      <div>
        <Link href={`/sessions/${sessionId}`} className="text-[12px] text-fg-muted hover:underline">
          ← 수업 상세
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-[20px] font-semibold">{student.name} 피드백</h1>
          {report && <Badge tone={reportTone[report.status]}>{reportLabel[report.status]}</Badge>}
        </div>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {course?.name} · {session.sessionDate} · {session.topic ?? "주제 미정"}
        </p>
      </div>

      {/* 발송 대상(학부모) — join 확인 */}
      <SectionCard title="발송 대상 (학부모)">
        <div className="p-4 text-[13px]">
          {parent ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <b>{parent.name}</b> ({link?.relation ?? "보호자"})
              </span>
              <span className="text-fg-muted mono">{parent.phone}</span>
              <Badge tone={parent.kakaoAvailable ? "success" : "neutral"}>
                카카오 {parent.kakaoAvailable ? "발송 가능" : "불가"}
              </Badge>
            </div>
          ) : (
            <span className="text-fg-subtle">연결된 학부모가 없습니다. (등록 시 학부모 정보를 추가하세요)</span>
          )}
        </div>
      </SectionCard>

      {/* 피드백 폼 (추후 교육실장이 항목 확정 시 이 폼을 확장) */}
      <SectionCard title="피드백 작성">
        <div className="p-4 space-y-3">
          <div>
            <span className="block text-[12px] font-medium text-fg-muted mb-1">학부모 피드백</span>
            <textarea
              className="input h-28 py-2 leading-relaxed"
              placeholder="오늘 수업 내용·태도·성취"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div>
            <span className="block text-[12px] font-medium text-fg-muted mb-1">숙제</span>
            <textarea
              className="input h-20 py-2 leading-relaxed"
              placeholder="다음 수업 전까지"
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => save(false)}>
              임시 저장
            </button>
            <button className="btn btn-primary" disabled={!content.trim()} onClick={() => save(true)}>
              제출 (발송 대기)
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
