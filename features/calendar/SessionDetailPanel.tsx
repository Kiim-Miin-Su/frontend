"use client";
// [참조/처리] 우측 아래 패널 — 선택 수업 상세(Lantiv 'Properties' 대응).
//  - 표시: ScheduleRow DTO 그대로(날짜·시간·그룹·학생·과목·강사·강의실·상태·강사출결·메모) — FABLE §4.1.
//  - 속성 변경(색·상태·강의실·메모)은 부모 requestChange 경유 → PATCH /schedule/:id
//    (반복 시리즈면 부모가 범위(scope) 확인 → 관련 조인·시수 무효화는 백엔드+쿼리 invalidate가 담당).
//  - 더블클릭 상세편집 모달은 유지 — "상세 편집" 버튼으로도 진입(onOpenModal).
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Room, ScheduleRow } from "@/types";
import type { SchedulePatchBody } from "@/lib/api";
import { WEEKDAYS_KO as WD } from "@/lib/domain/schedule";
import { INSTRUCTOR_ATT_LABEL, STATUS_LABEL, isGroupSession } from "@/lib/domain/lantiv";
import { SessionEditFields } from "./SessionEditFields";

export function SessionDetailPanel({
  row, rooms, instructors, canEdit, colorOf, onPatch, onOpenModal,
}: {
  row: ScheduleRow | null;
  rooms: Room[];
  instructors: { id: number; name: string }[];
  canEdit: boolean;
  colorOf: (r: ScheduleRow) => string;
  onPatch: (r: ScheduleRow, patch: SchedulePatchBody, label: string) => void;
  onOpenModal: (r: ScheduleRow) => void;
}) {
  // 편집 모드(TBO-10 #3): DetailModal과 동일한 SessionEditFields 공통 폼 — 모든 input 편집 가능.
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [row?.id]); // 선택 세션 변경 시 보기 모드로

  if (!row) {
    return (
      <div className="card card-pad text-[12px] text-fg-subtle">
        수업을 클릭하면 상세 정보가 여기에 표시됩니다.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="px-3 h-10 flex items-center gap-2 border-b" style={{ borderColor: "var(--color-line)" }}>
        <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(row) }} />
        {/* 제목 클릭 = 수업 상세 페이지(학생 출결 관리) — 피드백 2026-07-02 */}
        <Link
          href={`/sessions/${row.id}`}
          className="text-[13px] font-semibold truncate flex-1 hover:underline text-accent"
          title="수업 상세 페이지로 — 학생 출결 관리"
        >
          {row.courseName} →
        </Link>
        {row.seriesId != null && <span className="badge badge-accent">반복</span>}
      </div>
      <div className="card-pad space-y-2.5">
        {editing && row ? (
          <SessionEditFields
            row={row}
            rooms={rooms}
            instructors={instructors}
            compact
            onSave={(patch, label) => { setEditing(false); onPatch(row, patch, label); }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
        {/* ScheduleRow DTO 그대로 렌더 */}
        <dl className="grid grid-cols-[64px_1fr] gap-y-1 text-[12.5px]">
          <dt className="text-fg-muted">날짜</dt>
          <dd>
            {row.sessionDate} ({WD[row.weekday]})
          </dd>
          <dt className="text-fg-muted">시간</dt>
          <dd className="mono">
            {row.startTime ?? "-"}–{row.endTime ?? "-"} ({row.durationMinutes}분)
          </dd>
          <dt className="text-fg-muted">과목</dt>
          <dd>{row.subjectName}</dd>
          <dt className="text-fg-muted">강사</dt>
          <dd>{row.instructorName}</dd>
          <dt className="text-fg-muted">학생</dt>
          <dd>
            {row.studentNames?.length ? row.studentNames.join(", ") : "—"}
            {isGroupSession(row) && <span className="ml-1 text-[11px] text-fg-subtle">(그룹)</span>}
          </dd>
          <dt className="text-fg-muted">강사출결</dt>
          <dd>{row.instructorAttendance ? INSTRUCTOR_ATT_LABEL[row.instructorAttendance] : "—"}</dd>
          {row.topic && (
            <>
              <dt className="text-fg-muted">주제</dt>
              <dd>{row.topic}</dd>
            </>
          )}
        </dl>

        <dl className="grid grid-cols-[64px_1fr] gap-y-1 text-[12.5px]">
          <dt className="text-fg-muted">상태</dt>
          <dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
          <dt className="text-fg-muted">메모</dt>
          <dd className="whitespace-pre-wrap">{row.memo ? row.memo : <span className="text-fg-subtle">—</span>}</dd>
        </dl>
        <div className="flex justify-between gap-2">
          {canEdit ? (
            <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
              편집 — 모든 항목
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-sm" onClick={() => onOpenModal(row)}>
            모달로 크게…
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
