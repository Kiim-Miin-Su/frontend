"use client";
// [참조/처리] 수업 편집 폼 — 공통 컴포넌트(TBO-10 #3).
//  DetailModal(더블클릭)과 SessionDetailPanel(우측 아래)이 **같은 폼·검증·패치 빌드**를 공유한다
//  (컴포넌트/검증 통일 — 두 진입점의 동작 차이 원천 차단).
//  - 편집 가능: 날짜·시작·종료·강사·강의실·상태·색·주제·메모 + (반복이면) 적용 범위 스코프.
//  - 학생(코호트)은 enrollment 파생이라 여기서 편집하지 않음(참조 무결성) — 수강 등록 화면에서.
//  - 저장 = 부모의 requestChange → PATCH /schedule/:id 단일 경로(충돌 409/force·FK 검증 재사용).
//  - 패치 빌드는 lib/domain/lantiv.sessionEditPatch(순수 함수·vitest) — scope는 시리즈일 때만 포함.
import { useState } from "react";
import type { Room, ScheduleRow, RecurrenceScope } from "@/types";
import type { SchedulePatchBody } from "@/lib/api";
import { fromMin, toMin, WEEKDAYS_KO as WD } from "@/lib/domain/schedule";
import { PALETTE, STATUS_LABEL, sessionEditPatch, type SessionDraft } from "@/lib/domain/lantiv";

// ── 공용 폼 프리미티브(캘린더 폼 3곳 공유: 본 폼·CreateModal·BlockEditModal) ──
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

export function ColorPicker({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full transition"
          style={{ background: c, outline: value === c ? "2px solid var(--color-fg)" : "1px solid var(--color-line)", outlineOffset: 1 }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

const SCOPE_LABEL: Record<RecurrenceScope, string> = {
  this: "이 수업만",
  this_and_following: "이 수업 및 이후 전부",
  all: "시리즈 전체",
};

export function SessionEditFields({
  row, rooms, instructors, compact, onSave, onCancel, onDelete,
}: {
  row: ScheduleRow;
  rooms: Room[];
  instructors: { id: number; name: string }[];
  compact?: boolean; // 우측 패널용(입력 높이 축소)
  onSave: (patch: SchedulePatchBody, label: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<SessionDraft>({
    sessionDate: row.sessionDate,
    startTime: row.startTime ?? "16:00",
    endTime: row.endTime ?? fromMin(toMin(row.startTime ?? "16:00") + row.durationMinutes),
    instructorId: Number(row.instructorId),
    roomId: row.roomId != null ? Number(row.roomId) : undefined,
    status: row.status,
    topic: row.topic ?? "",
    memo: row.memo ?? "",
    color: row.color,
    scope: "this",
  });
  const set = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const isSeries = row.seriesId != null;
  const valid = d.startTime < d.endTime;
  const input = compact ? "input h-8 text-[12px]" : "input";

  return (
    <div className="space-y-3">
      <Field label="날짜">
        <input type="date" className={input} value={d.sessionDate} onChange={(e) => set("sessionDate", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작">
          <input type="time" step={900} className={input} value={d.startTime} onChange={(e) => set("startTime", e.target.value)} />
        </Field>
        <Field label="종료">
          <input type="time" step={900} className={input} value={d.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="강사">
          <select className={input} value={d.instructorId} onChange={(e) => set("instructorId", Number(e.target.value))}>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </Field>
        <Field label="강의실">
          <select
            className={input}
            value={d.roomId ?? ""}
            onChange={(e) => set("roomId", e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">미지정(유지)</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="상태">
          <select className={input} value={d.status} onChange={(e) => set("status", e.target.value as ScheduleRow["status"])}>
            {Object.keys(STATUS_LABEL).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}{s === "held" ? " (시수 측정)" : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="색상">
          <ColorPicker value={d.color} onChange={(c) => set("color", c)} />
        </Field>
      </div>
      <Field label="주제">
        <input className={input} placeholder="비우면 기존 주제 유지" value={d.topic} onChange={(e) => set("topic", e.target.value)} />
      </Field>
      <Field label="메모">
        <textarea className={`input py-1.5 ${compact ? "min-h-[48px] text-[12px]" : "min-h-[64px]"}`} rows={compact ? 2 : 3}
          value={d.memo} onChange={(e) => set("memo", e.target.value)} />
      </Field>
      {/* 학생은 여기서 편집 불가(코호트=수강 등록 파생) — 무결성 안내 */}
      <p className="text-[11px] text-fg-subtle">학생(수강생)은 수강 등록에서 관리됩니다 — 학생·부모 탭 참조.</p>
      {isSeries && (
        <Field label="반복 적용 범위">
          <select className={input} value={d.scope} onChange={(e) => set("scope", e.target.value as RecurrenceScope)}>
            {(Object.keys(SCOPE_LABEL) as RecurrenceScope[]).map((s) => (
              <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
            ))}
          </select>
        </Field>
      )}
      {!valid && <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>종료 시각이 시작보다 빠를 수 없습니다.</p>}
      <div className="flex justify-between gap-2 pt-1">
        {onDelete ? (
          <button className="btn btn-sm" style={{ color: "var(--color-danger)" }} onClick={onDelete}>삭제</button>
        ) : <span />}
        <div className="flex gap-2">
          <button className={compact ? "btn btn-sm" : "btn"} onClick={onCancel}>취소</button>
          <button
            className={`${compact ? "btn btn-sm" : "btn"} btn-primary`}
            disabled={!valid}
            onClick={() => onSave(
              sessionEditPatch(d, isSeries),
              isSeries ? `상세 편집(${SCOPE_LABEL[d.scope]})` : "상세 편집",
            )}
          >
            저장{isSeries ? ` — ${SCOPE_LABEL[d.scope]}` : ""}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-fg-subtle">
        {WD[row.weekday]}요일 수업 · 저장 시 충돌(강사·강의실 이중예약/불가시간)은 자동 검사됩니다.
      </p>
    </div>
  );
}
