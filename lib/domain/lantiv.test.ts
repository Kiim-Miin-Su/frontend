// Lantiv 캘린더 엔진 단위 테스트 — 상태 판정·정렬·그룹핑·스플릿 컬럼(참조 무결성 규칙 포함).
import { describe, expect, it } from 'vitest';
import type { Attendance, ScheduleRow } from '@/types';
import {
  buildSplitColumns,
  buildMixedSplitColumns,
  cloneSessionBody,
  matchesResourceFilter,
  groupSessions,
  isGroupSession,
  matchesStatusFilter,
  rowInResource,
  sessionEditPatch,
  sessionStates,
  sortByDateAsc,
  type StatusFilter,
} from './lantiv';

const row = (over: Partial<ScheduleRow> = {}): ScheduleRow =>
  ({
    id: 1,
    courseId: 10,
    instructorId: 1,
    roomId: 1,
    sessionDate: '2026-07-06',
    startTime: '14:00',
    endTime: '16:00',
    durationMinutes: 120,
    status: 'held',
    weekday: 1,
    courseName: '수학A',
    subjectName: '수학',
    instructorName: '박지훈',
    roomName: 'R1',
    studentIds: [1],
    studentNames: ['김학생'],
    ...over,
  }) as ScheduleRow;

const att = (status: Attendance['status'], sessionId = 1, studentId = 1): Attendance =>
  ({ id: 1, sessionId, studentId, status }) as Attendance;

describe('sessionStates — 출석/지각/결강/보강 판정(status + 강사·학생 출결 조합)', () => {
  it('held + 이슈 없음 → 출석(문제 없음)', () => {
    expect(sessionStates(row())).toEqual(new Set<StatusFilter>(['attended']));
  });
  it('canceled/no_show → 결강(출석 아님)', () => {
    expect(sessionStates(row({ status: 'canceled' }))).toEqual(new Set(['absence']));
    expect(sessionStates(row({ status: 'no_show' }))).toEqual(new Set(['absence']));
  });
  it('status makeup 또는 강사출결 makeup → 보강', () => {
    expect(sessionStates(row({ status: 'makeup' })).has('makeup')).toBe(true);
    expect(sessionStates(row({ instructorAttendance: 'makeup' })).has('makeup')).toBe(true);
  });
  it('강사 지각 → 지각(출석 제외)', () => {
    expect(sessionStates(row({ instructorAttendance: 'late' }))).toEqual(new Set(['late']));
  });
  it('학생 지각 → 지각(강사 출결과 무관 — TBO-09 "지각: 강사 | 학생")', () => {
    expect(sessionStates(row(), [att('late')])).toEqual(new Set(['late']));
  });
  it('강사 결석 또는 학생 결석 → 결강', () => {
    expect(sessionStates(row({ instructorAttendance: 'absent' })).has('absence')).toBe(true);
    expect(sessionStates(row(), [att('absent')]).has('absence')).toBe(true);
  });
  it('복합 상태: 보강 세션에 학생 지각 → {late, makeup}', () => {
    expect(sessionStates(row({ status: 'makeup' }), [att('late')])).toEqual(new Set(['late', 'makeup']));
  });
  it('scheduled(아직 안 진행) → 어떤 상태에도 속하지 않음', () => {
    expect(sessionStates(row({ status: 'scheduled' })).size).toBe(0);
  });
});

describe('matchesStatusFilter — "결강만/보강만" 필터', () => {
  it('활성 필터 없음 → 전체 통과', () => {
    expect(matchesStatusFilter(row({ status: 'scheduled' }), [], new Set())).toBe(true);
  });
  it('결강만 → canceled 통과, held 차단', () => {
    const only = new Set<StatusFilter>(['absence']);
    expect(matchesStatusFilter(row({ status: 'canceled' }), [], only)).toBe(true);
    expect(matchesStatusFilter(row(), [], only)).toBe(false);
  });
  it('복수 필터(지각∪보강)는 합집합으로 동작', () => {
    const f = new Set<StatusFilter>(['late', 'makeup']);
    expect(matchesStatusFilter(row({ status: 'makeup' }), [], f)).toBe(true);
    expect(matchesStatusFilter(row(), [att('late')], f)).toBe(true);
    expect(matchesStatusFilter(row(), [], f)).toBe(false);
  });
});

describe('isGroupSession — 그룹 수업(수강생 ≥ 2)', () => {
  it('1명 → false, 2명 → true, 미배정 → false', () => {
    expect(isGroupSession(row())).toBe(false);
    expect(isGroupSession(row({ studentIds: [1, 2] }))).toBe(true);
    expect(isGroupSession(row({ studentIds: [] }))).toBe(false);
  });
});

describe('sortByDateAsc — 우측 리스트 정렬(날짜→시각→id 오름차순)', () => {
  it('날짜·시각·id 순으로 안정 정렬, 원본 불변', () => {
    const rows = [
      row({ id: 3, sessionDate: '2026-07-08', startTime: '09:00' }),
      row({ id: 2, sessionDate: '2026-07-06', startTime: '16:00' }),
      row({ id: 1, sessionDate: '2026-07-06', startTime: '14:00' }),
      row({ id: 4, sessionDate: '2026-07-06', startTime: '14:00' }),
    ];
    const sorted = sortByDateAsc(rows);
    expect(sorted.map((r) => r.id)).toEqual([1, 4, 2, 3]);
    expect(rows.map((r) => r.id)).toEqual([3, 2, 1, 4]); // 원본 보존
  });
});

describe('groupSessions — 그룹 토글(학생별/강사별/강의실별)', () => {
  const rows = [
    row({ id: 1, studentIds: [1, 2], studentNames: ['가나', '다라'] }),
    row({ id: 2, sessionDate: '2026-07-07', studentIds: [1], studentNames: ['가나'] }),
    row({ id: 3, studentIds: [], studentNames: [], instructorId: 2, instructorName: '이수민', roomId: undefined, roomName: undefined }),
  ];
  it('none → 단일 그룹 + 날짜순', () => {
    const g = groupSessions(rows, 'none');
    expect(g).toHaveLength(1);
    expect(g[0].rows.map((r) => r.id)).toEqual([1, 3, 2]);
  });
  it('student → 그룹 수업은 각 학생 그룹에 모두 표시(이중 아님 — 뷰 그룹핑), 미배정은 별도 그룹', () => {
    const g = groupSessions(rows, 'student');
    const byLabel = Object.fromEntries(g.map((x) => [x.label, x.rows.map((r) => r.id)]));
    expect(byLabel['가나']).toEqual([1, 2]);
    expect(byLabel['다라']).toEqual([1]);
    expect(byLabel['학생 미배정']).toEqual([3]);
  });
  it('instructor/room → FK 라벨로 그룹', () => {
    expect(groupSessions(rows, 'instructor').map((g) => g.label).sort()).toEqual(['박지훈', '이수민']);
    expect(groupSessions(rows, 'room').map((g) => g.label).sort()).toEqual(['R1', '강의실 미지정']);
  });
});

describe('buildSplitColumns — (날짜 × 리소스) 스플릿 컬럼', () => {
  const picks = [
    { id: 1, name: 'Allissa' },
    { id: 2, name: 'Kim' },
  ];
  it('날짜×리소스 곱, key 유일, 날짜 경계 마킹', () => {
    const cols = buildSplitColumns(['2026-07-06', '2026-07-07'], 'instructor', picks);
    expect(cols).toHaveLength(4);
    expect(new Set(cols.map((c) => c.key)).size).toBe(4);
    expect(cols.map((c) => c.firstOfDate)).toEqual([true, false, true, false]);
    expect(cols[1]).toMatchObject({ date: '2026-07-06', resType: 'instructor', resId: 2, label: 'Kim' });
  });
  it('room 스플릿은 roomId를 채워 기존 드래그 드롭(roomid) 경로 재사용', () => {
    const cols = buildSplitColumns(['2026-07-06'], 'room', picks);
    expect(cols.map((c) => c.roomId)).toEqual([1, 2]);
    expect(buildSplitColumns(['2026-07-06'], 'instructor', picks).every((c) => c.roomId === undefined)).toBe(true);
  });
});

describe('matchesResourceFilter — 강사·학생 합집합(OR), 강의실 AND', () => {
  const sel = (i: number[] = [], s: number[] = [], r: number[] = []) =>
    ({ instructors: new Set(i), students: new Set(s), rooms: new Set(r) });
  const rr = row({ instructorId: 1, roomId: 1, studentIds: [3] });

  it('강사+학생 동시 선택 = 합집합 — 강사 일치만으로도, 학생 일치만으로도 통과(교집합 버그 회귀)', () => {
    expect(matchesResourceFilter(rr, sel([1], [999]))).toBe(true); // 강사만 일치
    expect(matchesResourceFilter(rr, sel([999], [3]))).toBe(true); // 학생만 일치
    expect(matchesResourceFilter(rr, sel([999], [999]))).toBe(false); // 둘 다 불일치
  });
  it('단일 차원 선택은 기존과 동일', () => {
    expect(matchesResourceFilter(rr, sel([1]))).toBe(true);
    expect(matchesResourceFilter(rr, sel([2]))).toBe(false);
    expect(matchesResourceFilter(rr, sel([], [3]))).toBe(true);
  });
  it('강의실은 AND(장소 한정) — 방 불일치면 강사 일치여도 제외', () => {
    expect(matchesResourceFilter(rr, sel([1], [], [2]))).toBe(false);
    expect(matchesResourceFilter(rr, sel([1], [], [1]))).toBe(true);
  });
});

describe('buildMixedSplitColumns — 강사+학생 혼합 컬럼(한 날짜에 양쪽 시간표)', () => {
  it('타입 혼합 순서 보존 + 날짜 경계 마킹 + key 유일', () => {
    const cols = buildMixedSplitColumns(['2026-07-06'], [
      { id: 1, name: '박지훈', type: 'instructor' },
      { id: 2, name: '정유진', type: 'instructor' },
      { id: 1, name: '김서연', type: 'student' },
    ]);
    expect(cols.map((c) => `${c.resType}${c.resId}`)).toEqual(['instructor1', 'instructor2', 'student1']);
    expect(new Set(cols.map((c) => c.key)).size).toBe(3); // 같은 id 1이라도 타입 달라 key 유일
    expect(cols.map((c) => c.firstOfDate)).toEqual([true, false, false]);
  });
});

describe('sessionEditPatch — 편집 폼 패치 빌드(모달·우측 패널 공통 규칙)', () => {
  const d = {
    sessionDate: '2026-07-08', startTime: '14:00', endTime: '15:30',
    instructorId: 2, roomId: undefined, status: 'scheduled' as const,
    topic: '', memo: 'm', color: '#222222', scope: 'this_and_following' as const,
  };
  it('scope는 시리즈일 때만 포함(단건엔 미포함 — API 계약 명확화)', () => {
    expect(sessionEditPatch(d, true).scope).toBe('this_and_following');
    expect('scope' in sessionEditPatch(d, false)).toBe(false);
  });
  it('빈 topic은 미전송(기존값 유지 — 실수 삭제 방지), roomId undefined=변경 없음', () => {
    const p = sessionEditPatch(d, false);
    expect(p.topic).toBeUndefined();
    expect(p.roomId).toBeUndefined();
    expect(p.instructorId).toBe(2);
    expect(sessionEditPatch({ ...d, topic: ' 주제 ' }, false).topic).toBe(' 주제 ');
  });
  it('시작 ≥ 종료면 throw(이중 방어)', () => {
    expect(() => sessionEditPatch({ ...d, endTime: '14:00' }, false)).toThrow();
    expect(() => sessionEditPatch({ ...d, endTime: '13:00' }, false)).toThrow();
  });
});

describe('cloneSessionBody — Ctrl+C/V·Ctrl+드래그 복제(무결성 규칙)', () => {
  const src = row({ courseId: 10, instructorId: 1, roomId: 2, durationMinutes: 90, topic: '주제', memo: 'm', color: '#111111', seriesId: 7, status: 'held', instructorAttendance: 'present' });

  it('시작=커서 시각, 길이 유지, status=scheduled 고정(진행 이력·출결·시리즈 미승계)', () => {
    const b = cloneSessionBody(src, { date: '2026-07-08', startMin: 14 * 60 + 30 });
    expect(b).toMatchObject({
      courseId: 10, instructorId: 1, roomId: 2, sessionDate: '2026-07-08',
      startTime: '14:30', endTime: '16:00', status: 'scheduled', topic: '주제', memo: 'm', color: '#111111',
    });
    expect('seriesId' in b).toBe(false);
    expect('instructorAttendance' in b).toBe(false);
  });

  it('스플릿 강사 컬럼에 붙여넣기 → 그 강사로 재배정', () => {
    expect(cloneSessionBody(src, { date: '2026-07-08', startMin: 600, resType: 'instructor', resId: 2 }).instructorId).toBe(2);
  });

  it('강의실 컬럼(스플릿 room 또는 일간 roomid) → 그 강의실로, 학생 컬럼은 재배정 없음', () => {
    expect(cloneSessionBody(src, { date: '2026-07-08', startMin: 600, resType: 'room', resId: 3 }).roomId).toBe(3);
    expect(cloneSessionBody(src, { date: '2026-07-08', startMin: 600, roomId: 4 }).roomId).toBe(4);
    const st = cloneSessionBody(src, { date: '2026-07-08', startMin: 600, resType: 'student', resId: 9 });
    expect(st.instructorId).toBe(1);
    expect(st.roomId).toBe(2);
  });

  it('강의실 미지정 원본은 미지정 유지', () => {
    expect(cloneSessionBody(row({ roomId: undefined }), { date: '2026-07-08', startMin: 600 }).roomId).toBeUndefined();
  });
});

describe('rowInResource — 컬럼 소속 판정(참조 무결성: 학생=코호트 포함)', () => {
  it('강사/강의실은 FK 일치, 학생은 studentIds 포함', () => {
    const r = row({ instructorId: 1, roomId: 2, studentIds: [3, 4] });
    expect(rowInResource(r, 'instructor', 1)).toBe(true);
    expect(rowInResource(r, 'instructor', 9)).toBe(false);
    expect(rowInResource(r, 'room', 2)).toBe(true);
    expect(rowInResource(r, 'student', 4)).toBe(true);
    expect(rowInResource(r, 'student', 9)).toBe(false);
    expect(rowInResource(row({ studentIds: undefined as unknown as number[] }), 'student', 1)).toBe(false);
  });
});
