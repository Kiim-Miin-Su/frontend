// [참조/처리] 수업 상세 — 학생 출결·보고서 상태 표시/편집.
//  - roster는 세션의 수강생, att=store.attendance(session×student 1행). 출결 마킹은 낙관적 로컬 반영 후
//    PUT /attendance(백엔드 upsert=단일 소스)로 영속, 성공/실패 시 qk.attendance 무효화로 재동기화.
"use client";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, SectionCard, type Tone } from "@/components/ui";
import { useSchedule, useCourses, useInstructors, useEnrollments, useStudents, useAttendance, useReports } from "@/lib/queries";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { AttendanceStatus, ReportStatus } from "@/types";
import { shortDate } from "@/lib/format";

const ATT: { value: AttendanceStatus; label: string; tone: Tone }[] = [
  { value: "present", label: "출석", tone: "success" },
  { value: "late", label: "지각", tone: "attention" },
  { value: "absent", label: "결석", tone: "danger" },
  { value: "excused", label: "인정결석", tone: "done" },
];
const reportTone: Record<ReportStatus, Tone> = { draft: "neutral", submitted: "accent", sent: "success" };
const reportLabel: Record<ReportStatus, string> = { draft: "작성중", submitted: "작성완료", sent: "발송됨" };

export function ClassSessionDetailView({ sessionId }: { sessionId: number }) {
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: instructors = [] } = useInstructors();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAttendance();
  const { data: sessionReports = [] } = useReports();
  const qc = useQueryClient();
  // 출결 마킹: 백엔드 PUT(단일 소스). 성공/실패 모두 서버와 재동기화(qk.attendance 무효화 → 재패칭).
  const markAttendance = useMutation({
    mutationFn: api.attendance.upsert,
    onSettled: () => qc.invalidateQueries({ queryKey: qk.attendance.all }),
  });
  const setAtt = (studentId: number, status: AttendanceStatus) => {
    markAttendance.mutate({ sessionId, studentId, status });
  };
  const session = classSessions.find((s) => s.id === sessionId);

  if (!session) {
    return <div className="p-6 text-fg-muted">수업을 찾을 수 없습니다. (id: {sessionId})</div>;
  }

  const course = courses.find((c) => c.id === session.courseId);
  const instructor = instructors.find((i) => i.id === session.instructorId);

  // 이 수업(코스)의 수강생 = enrollments에서 courseId 일치
  const roster = enrollments
    .filter((e) => e.courseId === session.courseId)
    .map((e) => students.find((s) => s.id === e.studentId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="p-6 max-w-[920px] mx-auto space-y-6">
      <div>
        <a href="/sessions" className="text-[12px] text-fg-muted hover:underline">
          ← 수업 목록
        </a>
        <h1 className="text-[20px] font-semibold mt-1">
          {course?.name ?? "수업"} · {shortDate(session.sessionDate)}
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          강사 {instructor?.name ?? "—"} · {session.durationMinutes}분 · {session.topic ?? "주제 미정"}
        </p>
      </div>

      <SectionCard title={`학생 출석 · 피드백 (${roster.length}명)`}>
        <div className="divide-y" style={{ borderColor: "var(--color-line-muted)" }}>
          {roster.map((student) => {
            const att = attendance.find((a) => a.sessionId === sessionId && a.studentId === student.id);
            const report = sessionReports.find((r) => r.sessionId === sessionId && r.studentId === student.id);
            return (
              <div key={student.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium">{student.name}</span>
                    <span className="text-[12px] text-fg-subtle ml-2">{student.englishName}</span>
                  </div>
                  {report && <Badge tone={reportTone[report.status]}>{reportLabel[report.status]}</Badge>}
                </div>

                {/* 출석 체크 */}
                <div className="flex gap-2 mb-3">
                  {ATT.map((opt) => {
                    const active = att?.status === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAtt(student.id, opt.value)}
                        className={`btn btn-sm ${active ? `badge-${opt.tone}` : ""}`}
                        style={active ? { borderColor: "transparent", fontWeight: 600 } : undefined}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* 피드백은 상세 폼 페이지에서 작성 (학부모 join + 추후 항목 확장) */}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-fg-subtle truncate max-w-[60%]">
                    {report?.content ? report.content : "작성된 피드백 없음"}
                  </span>
                  <Link href={`/sessions/${sessionId}/feedback/${student.id}`} className="btn btn-sm btn-primary">
                    {report ? "피드백 수정" : "피드백 작성"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
