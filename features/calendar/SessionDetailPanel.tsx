"use client";
// [참조/처리] 우측 아래 패널 — 선택 수업 상세(Lantiv 'Properties' 대응).
//  - 표시: ScheduleRow DTO 그대로(날짜·시간·그룹·학생·과목·강사·강의실·상태·강사출결·메모) — FABLE §4.1.
//  - 속성 변경(색·상태·강의실·메모)은 부모 requestChange 경유 → PATCH /schedule/:id
//    (반복 시리즈면 부모가 범위(scope) 확인 → 관련 조인·시수 무효화는 백엔드+쿼리 invalidate가 담당).
//  - 더블클릭 상세편집 모달은 유지 — "상세 편집" 버튼으로도 진입(onOpenModal).
import { useEffect, useState } from "react";
import type { Room, ScheduleRow } from "@/types";
import type { SchedulePatchBody } from "@/lib/api";
import { INSTRUCTOR_ATT_LABEL, PALETTE, STATUS_LABEL, isGroupSession } from "@/lib/domain/lantiv";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

export function SessionDetailPanel({
  row, rooms, canEdit, colorOf, onPatch, onOpenModal,
}: {
  row: ScheduleRow | null;
  rooms: Room[];
  canEdit: boolean;
  colorOf: (r: ScheduleRow) => string;
  onPatch: (r: ScheduleRow, patch: SchedulePatchBody, label: string) => void;
  onOpenModal: (r: ScheduleRow) => void;
}) {
  // 메모는 로컬 편집 후 저장(타이핑마다 PATCH 방지). 선택 세션이 바뀌면 리셋.
  const [memo, setMemo] = useState(row?.memo ?? "");
  useEffect(() => setMemo(row?.memo ?? ""), [row?.id, row?.memo]);

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
        <span className="text-[13px] font-semibold truncate flex-1">{row.courseName}</span>
        {row.seriesId != null && <span className="badge badge-accent">반복</span>}
      </div>
      <div className="card-pad space-y-2.5">
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

        {/* 속성 빠른 변경 — 반복이면 부모가 범위 확인 후 PATCH */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] text-fg-muted mb-0.5">상태</span>
            <select
              className="input h-8 text-[12px]"
              value={row.status}
              disabled={!canEdit}
              onChange={(e) => onPatch(row, { status: e.target.value as ScheduleRow["status"] }, "상태 변경")}
            >
              {Object.keys(STATUS_LABEL).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-fg-muted mb-0.5">강의실</span>
            <select
              className="input h-8 text-[12px]"
              value={row.roomId ?? ""}
              disabled={!canEdit}
              onChange={(e) =>
                onPatch(row, { roomId: e.target.value ? Number(e.target.value) : undefined }, "강의실 변경")
              }
            >
              <option value="">미지정</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canEdit && (
          <div>
            <span className="block text-[11px] text-fg-muted mb-0.5">색상</span>
            <div className="flex items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onPatch(row, { color: c }, "색상 변경")}
                  className="w-5 h-5 rounded-full"
                  style={{
                    background: c,
                    outline: row.color === c ? "2px solid var(--color-fg)" : "1px solid var(--color-line)",
                    outlineOffset: 1,
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        )}
        <label className="block">
          <span className="block text-[11px] text-fg-muted mb-0.5">메모</span>
          <textarea
            className="input min-h-[48px] py-1 text-[12px]"
            rows={2}
            value={memo}
            readOnly={!canEdit}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
        <div className="flex justify-between gap-2">
          {canEdit && memo !== (row.memo ?? "") ? (
            <button className="btn btn-sm" onClick={() => onPatch(row, { memo }, "메모 수정")}>
              메모 저장
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-sm" onClick={() => onOpenModal(row)}>
            상세 편집…
          </button>
        </div>
      </div>
    </div>
  );
}
