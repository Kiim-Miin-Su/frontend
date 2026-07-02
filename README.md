# TACO Web (frontend)

Next.js(App Router) + Tailwind v4 기반 TACO ERP 웹. **독립 repo**로 운영하며, 추후 데스크탑(Electron/Tauri)으로 확장합니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
```

백엔드 API는 `next.config.ts`의 rewrites로 `/api/*` → `http://localhost:3001`로 프록시됩니다. 다른 주소면 `.env.local`에 `NEXT_PUBLIC_API_URL` 지정.

## 디자인 시스템

GitHub Primer 느낌의 모던 ERP, **밝은 테마** 우선. 토큰은 `app/globals.css`의 CSS 변수 + Tailwind v4 `@theme`로 노출됩니다.

- 색: `canvas / fg / line / accent / success / attention / danger / done` 시맨틱 토큰
- 컴포넌트 클래스: `.btn(.btn-primary/-danger/-invisible/-sm)`, `.card`, `.badge-*`, `.input`, `.table`, `.mono`
- 공용 React 컴포넌트: `components/ui/*`(Badge·StatCard·SectionCard·StatusDot·icons), `components/layout/*`(Sidebar·Topbar)

다크 테마는 `globals.css`의 토큰을 `@media (prefers-color-scheme: dark)` 또는 `[data-theme=dark]`로 재정의하면 확장됩니다.

- 차트: `components/ui/Chart`(chart.js 래퍼), 재사용 `MonthCalendar`, `Combobox`(라벨 추천)

## 구조 (feature 기반, 확장형)

```
app/                 # 라우트는 얇게 (각 page는 feature View 렌더만)
│  · / · /schedule · /counsel[/id] · /students · /sessions[/id][/feedback/sid]
│  · /payments[/new|/id] · /payouts · /expenses[/new|/id] · /admin[/courses|/events|/approvals]
components/
├─ ui/               # 프리미티브 + Chart·MonthCalendar·Combobox (+ index 배럴)
└─ layout/           # Sidebar·Topbar(역할 전환)
features/            # 도메인 단위 (확장 지점)
│  dashboard · schedule · counsel · students · sessions
│  payments · payouts · expenses · admin · system(BackendPanel)
lib/                 # api(axios) · store(zustand) · mock/seed · mock/integrity
│  payroll(시수×시급) · roles(RBAC) · format(결정적) · auth(jwt-decode)
types/               # @kms545487/contracts 재노출(단일 소스)
```

데이터 계층: **서버 상태 = TanStack Query 단일 소스**(`lib/queries.ts` 도메인 훅 — 읽기 `useX`, 쓰기 `useCreateX/useUpdateX`+invalidate). zustand(`lib/store`)는 클라이언트 상태(currentRole·reportTemplates 등)만 유지합니다. 캘린더 엔진(충돌·추천·스플릿·복제)은 `lib/domain/schedule.ts`·`lib/domain/lantiv.ts` 순수 함수로 분리되어 vitest로 검증됩니다.

## 타입 컨벤션

기본적으로 `type`을 사용합니다. `interface`는 선언 병합이나 클래스 implements 계약이 필요할 때만 쓰고, 사유를 주석으로 남깁니다. 도메인 타입은 `@kms545487/contracts`가 단일 소스이며 `@/types`로 재노출합니다.

## 자세한 개발 가이드

폴더 규칙·새 기능 추가 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md) 참고.

## 캘린더(/calendar) — 상세 기능·사용법 (Lantiv형, 2026-07-02 기준)

학원 운영의 중심 탭. 수업 스케줄의 조회·생성·이동·복제·재배정을 한 화면에서 처리합니다.
구현: `features/calendar/`(ScheduleCalendar + CalendarFilterBar·SessionListPanel·SessionDetailPanel·ResourcePanel), 엔진: `lib/domain/lantiv.ts`·`lib/domain/schedule.ts`.

### 뷰

| 뷰 | 내용 |
|---|---|
| 월간 | 날짜별 요약. 날짜 클릭=일간 이동, 빈 칸 더블클릭=일정 추가 |
| 주간(기본) | 시간 그리드(08–22시). 오늘 강조·현재시각 선 |
| 일간(강의실) | 하루를 강의실별 컬럼으로 |
| **스플릿** | 필터에서 강사/학생/강의실을 **2개 이상 선택하면 자동** — (날짜 × 선택 리소스) 컬럼. 헤더에 날짜+이름 2줄, 날짜 경계 굵은 선. 최대 6개 |

### 상단 필터 바 (`CalendarFilterBar`)

- **리소스 다중선택**: 👓강사 · 🎓학생 · 🚪강의실 버튼 → 체크박스 팝오버(검색 지원). 선택하면 칩으로 표시(✕ 제거), 2개 이상이면 스플릿 뷰.
- **상태 필터**: 출석 / 지각 / 결강 / 보강 — 세션 status + 강사 출결 + 학생 출결 조합으로 판정(`sessionStates`). 복수 선택=합집합("결강만", "결강+보강" 등).
- **그룹 수업만**: 수강생 2명 이상인 수업만.
- **기간**: from~to 지정 시 뷰 기간 대신 그 범위를 조회(우측 리스트가 기간 전체를 봄). ✕로 해제.
- 검색(수업·강사·강의실·학생·주제) · 색 기준(과목/강사/강의실/학생).

### 마우스·키보드 (Lantiv 대응)

| 동작 | 결과 |
|---|---|
| 수업 클릭 | 선택(리사이즈 핸들) + 우측 상세 패널 표시 |
| 수업 더블클릭 | **상세 편집 모달**(반복이면 적용 범위: 이것만/이 이후/전체 선택) |
| 드래그 | 이동(30분 스냅, 다른 날/컬럼 가능). 스플릿 강사 컬럼에 놓으면 **강사 재배정** |
| **Ctrl(⌘)+드래그** | **복제** — 원본 유지, 드롭 지점에 새 수업 |
| **빈 시간 클릭** | **커서** — 클릭 시각(30분 스냅) 배지 표시. 붙여넣기 대상 |
| **Ctrl+C** | 선택한 수업 복사(토스트 안내) |
| **Ctrl+V** | 커서 위치에 붙여넣기 — **시작시간 = 커서 시각**, 길이 유지 |
| 시작/끝 핸들 드래그 | 시간 조절(15분 스냅) |
| Esc | 커서·선택 해제 |

복제 무결성 규칙(`cloneSessionBody`): 복제본은 항상 **단건(반복 아님)·예정(scheduled)** 상태로 생성되고, 출결·리포트·정산 연결은 승계하지 않습니다(시수 이중 계상 방지). 스플릿 강사/강의실 컬럼에 붙여넣으면 그 리소스로 재배정되며, 충돌 시 409 → 확인 후 강제 적용을 물어봅니다.

### 우측 패널

- **유저별 스케줄**(`ResourcePanel`): 강사/학생/강의실 단일 선택 → 개인 스케줄 + 가용(초록)/불가(회색 사선) 밴드. 선택 학생은 강사 추천의 기준.
- **수업 리스트**(`SessionListPanel`): 필터 결과를 **날짜 오름차순**으로. 그룹 토글(학생 선택 시 학생별 그룹). 클릭=그리드 하이라이트+상세, 기간 밖이면 그 주로 이동.
- **상세**(`SessionDetailPanel`): 선택 수업의 DTO 전체(날짜·시간·과목·강사·학생·강사출결·메모) + 빠른 변경(상태·강의실·색·메모). "상세 편집…"으로 모달 진입.

### 스케줄 추가·가용/불가

"+ 스케줄 추가"(관리자=전체, 강사=본인 수업) — 수업/가용/불가 3탭, 반복(그날만/매주/커스텀 요일)+종료일, 코스 선택 시 진행시간·색 자동. 가용/불가 블록은 그리드 밴드로 표시되며 클릭=선택·드래그=이동·더블클릭=수정(반복이면 범위 확인).

### 권한

조회는 로그인 사용자 공통, 생성·수정·삭제는 관리자/매니저 전체·강사 본인 수업만(프론트 게이팅 + 백엔드 RolesGuard·FK·충돌 검증이 최종 방어선).

## 변경 이력 — 캘린더 탭 통합 + Lantiv 추천 (2026-06-29)

- **캘린더 일원화**: `/calendar` 단일 탭에 **월간·주간·일간(강의실)·표** 뷰 통합. `/timetable`·`/schedule`는 redirect, 사이드바 "주간 표" 제거. 주간 표(엑셀/CSV·시수)는 "표" 뷰로 흡수.
- **학생 차원**: 색상/필터 기준에 학생 추가, 블록·표·상세에 학생명(`ScheduleRow.studentNames`).
- **자원 레일**(`features/calendar/ResourceRail.tsx`): 강사·학생·강의실 → 클릭 시 개인 스케줄 필터.
- **불가시간 밴드**: 선택 자원의 `unavailable` 블록을 그리드에 회색 사선으로 표시.
- **가용·추천 드로어**(`features/calendar/AvailabilityPanel.tsx`): 가용/불가 CRUD + **학생 중심 추천**(맞는 수업·강사, 불가 강사는 주황 "조정 배정") + **강사∧학생 가용 슬롯 추천** → `POST /schedule` 배정.
- 엔진(`lib/domain/schedule.ts`): `suggestPairSlots`·`recommendForStudent`·`ownerWindows` (+Vitest 6).
