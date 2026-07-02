"use client";
import { useMemo, useState } from "react";
import { Combobox } from "@/components/ui";
import { useCourses, useInstructors, useSchedule, useCreateSchedule } from "@/lib/queries";

const todayStr = () => new Date().toISOString().slice(0, 10);
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

// 기간+요일 반복을 날짜 배열로 전개(store.addRecurringClassSessions 로직 복제).
function expandRecurringDates(input: { startDate: string; endDate: string; weekdays: number[] }): string[] {
  const dates: string[] = [];
  for (const d = new Date(input.startDate); d <= new Date(input.endDate); d.setDate(d.getDate() + 1)) {
    if (input.weekdays.includes(d.getDay())) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function SessionForm() {
  const { data: courses = [] } = useCourses();
  const { data: instructors = [] } = useInstructors();
  const { data: classSessions = [] } = useSchedule();
  const createSchedule = useCreateSchedule();

  const [mode, setMode] = useState<"single" | "recurring">("single");
  const [courseId, setCourseId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [duration, setDuration] = useState("90");
  const [topic, setTopic] = useState("");
  // single
  const [sessionDate, setSessionDate] = useState(todayStr());
  // recurring
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [weekdays, setWeekdays] = useState<number[]>([]);

  // 이미 사용된 주제 라벨(중복 제거)
  const topicSuggestions = useMemo(
    () => Array.from(new Set(classSessions.map((s) => s.topic).filter((t): t is string => !!t))),
    [classSessions],
  );

  const pickCourse = (id: string) => {
    setCourseId(id);
    const c = courses.find((x) => x.id === Number(id));
    if (c) setInstructorId(String(c.instructorId));
  };

  const toggleWeekday = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  const resetForm = () => {
    setCourseId("");
    setInstructorId("");
    setTopic("");
    setDuration("90");
    setSessionDate(todayStr());
    setWeekdays([]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !instructorId) return;
    const common = {
      courseId: Number(courseId),
      instructorId: Number(instructorId),
      durationMinutes: Number(duration) || 90,
      topic: topic.trim() || undefined,
      startTime: "09:00",
      status: "scheduled" as const,
    };
    if (mode === "single") {
      createSchedule.mutate({ ...common, sessionDate }, { onSuccess: resetForm });
    } else {
      if (weekdays.length === 0) {
        alert("반복 요일을 1개 이상 선택하세요.");
        return;
      }
      const dates = expandRecurringDates({ startDate, endDate, weekdays });
      const seriesId = Date.now();
      for (const iso of dates) {
        createSchedule.mutate({ ...common, sessionDate: iso, seriesId });
      }
      alert(`${dates.length}개의 수업이 생성되었습니다.`);
      resetForm();
    }
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={`btn btn-sm ${mode === "single" ? "badge-accent" : ""}`}
          onClick={() => setMode("single")}
        >
          단일
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === "recurring" ? "badge-accent" : ""}`}
          onClick={() => setMode("recurring")}
        >
          기간·반복
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="코스 *">
          <select className="input" value={courseId} onChange={(e) => pickCourse(e.target.value)}>
            <option value="">선택</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="강사 *">
          <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
            <option value="">선택</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="시간(분)">
          <input
            className="input"
            type="number"
            min={10}
            step={10}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="주제 (기존 라벨 추천 / 새로 입력)">
            <Combobox value={topic} onChange={setTopic} suggestions={topicSuggestions} placeholder="Reading: Inference" />
          </Field>
        </div>
      </div>

      {mode === "single" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="날짜 *">
            <input type="date" className="input" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="시작일 *">
              <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="종료일 *">
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <span className="block text-[12px] font-medium text-fg-muted mb-1">반복 요일 *</span>
            <div className="flex gap-1.5">
              {WEEK.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className={`btn btn-sm w-9 ${weekdays.includes(i) ? "badge-accent" : ""} ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : ""}`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary">
          {mode === "single" ? "수업 개설" : "반복 수업 생성"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
