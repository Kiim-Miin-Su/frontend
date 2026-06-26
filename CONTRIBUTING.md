# Frontend 개발 가이드

`frontend/`에서 "무엇을 어느 폴더에 넣는가"와 개발 규칙을 정리합니다. 핵심 원칙 하나: **라우트(app/)는 얇게, 로직은 features/에, 재사용 조각은 components/ui에.**

## 폴더별 역할

| 폴더 | 넣는 것 | 넣지 말 것 |
|---|---|---|
| `app/` | 라우트만. URL 1개 = 폴더 1개. `page.tsx`(얇게), `layout.tsx`(셸), `loading.tsx`, `error.tsx`, `globals.css` | 비즈니스 로직, 큰 화면 구현(→ features) |
| `components/ui/` | 도메인 무관 프리미티브. 버튼/뱃지/카드/아이콘 등 **표현 전용** | 데이터 패칭, 특정 화면 전용 로직 |
| `components/layout/` | 앱 공통 골격: `Sidebar`, `Topbar` (추후 `Footer`) | 특정 페이지 전용 컴포넌트 |
| `features/<도메인>/` | 한 도메인에 속한 모든 것: 화면(`XxxView`), 전용 컴포넌트, 훅, 전용 타입/데이터 | 다른 feature가 공유해야 하는 것(→ ui/lib/types) |
| `lib/` | 횡단 유틸·인프라: `api`(HTTP), `auth`(jwt-decode), `format` | React 컴포넌트(JSX), 도메인 화면 |
| `types/` | 백엔드와 1:1인 **도메인 타입**, 2개 이상 feature가 쓰는 타입 | 한 feature에서만 쓰는 타입(→ 그 feature) |

```
app/                 # 라우트(얇게)
├─ layout.tsx        #   Sidebar + Topbar 셸
├─ page.tsx          #   → features/dashboard 렌더만
└─ globals.css       #   디자인 토큰 + 컴포넌트 클래스
components/
├─ ui/               # Badge·StatCard·SectionCard·StatusDot·icons (+ index 배럴)
└─ layout/           # Sidebar·Topbar
features/            # ★ 기능 추가는 대부분 여기
└─ dashboard/        #   DashboardView + data
lib/                 # api · auth · format
types/               # 도메인 타입 (Student·Enrollment·Payment …)
```

## "이건 어디에 넣지?" 판단 기준

- 도메인 의미 없는 재사용 조각(버튼·뱃지·카드) → `components/ui/`
- 사이드바·탑바·페이지 골격 → `components/layout/`
- URL 화면 → `app/<route>/page.tsx`(얇게) → `features/<x>/XxxView`를 렌더
- 특정 도메인 전용(학생 폼, 결제 테이블, 강사페이 정산 화면) → `features/<x>/`
- API 호출 함수 → `lib/api.ts`에 리소스 추가. 화면 흐름에 묶인 호출/상태 → `features/<x>/`의 훅
- 타입: 백엔드 모델과 같거나 여러 feature 공유 → `types/`. 한 feature 전용 → 그 feature 안

## 개발 규칙

1. **페이지는 얇게.** `app/.../page.tsx`는 feature 뷰를 렌더만 합니다. 로직은 `features/`로.
2. **Server vs Client.** 기본은 서버 컴포넌트. `useState`/`useEffect`/이벤트 핸들러(폼·인터랙션)가 필요할 때만 파일 맨 위에 `"use client"`를 붙입니다.
3. **스타일은 토큰으로.** `globals.css`의 컴포넌트 클래스(`.btn`, `.card`, `.badge-*`, `.input`, `.table`)와 시맨틱 유틸(`text-fg-muted`, `bg-canvas`, `border-line`)을 씁니다. **하드코딩 hex 금지.** 새 재사용 패턴은 `globals.css`의 `@layer components`에 클래스로 추가하거나 `components/ui`에 컴포넌트로 만듭니다.
4. **타입은 `type` 우선.** 도메인 타입은 `types/`에 두고 백엔드 `entity`와 형태를 맞춥니다.
5. **import는 `@/` 별칭.** (예: `@/components/ui`, `@/lib/api`)
6. **네이밍.** 컴포넌트 파일 PascalCase(`StudentForm.tsx`), 훅 `useXxx.ts`, 유틸 camelCase, feature 폴더 소문자.
7. **데이터는 `lib/api`로.** 화면에서 직접 `fetch` 하지 말고 `api.students.list()`처럼 호출합니다.

## 새 기능 추가 예시 — "학생 등록"

새 도메인을 붙일 때의 표준 흐름입니다.

**1) 타입** — 백엔드와 같으면 `types/`에 이미 있음(`Student`). 폼 입력 전용 타입만 feature에 둡니다.

```ts
// features/students/types.ts
export type CreateStudentInput = {
  name: string;
  grade?: number;
  phone?: string;
};
```

**2) API** — 공용 클라이언트에 리소스가 있으면 그대로 사용(`lib/api.ts`의 `api.students.create`).

**3) 전용 컴포넌트(폼)** — 상호작용이 있으니 클라이언트 컴포넌트.

```tsx
// features/students/StudentForm.tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { CreateStudentInput } from './types';

export function StudentForm({ onCreated }: { onCreated?: () => void }) {
  const [form, setForm] = useState<CreateStudentInput>({ name: '' });
  const submit = async () => {
    await api.students.create(form);
    onCreated?.();
  };
  return (
    <div className="card card-pad flex gap-2">
      <input
        className="input"
        placeholder="학생 이름"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <button className="btn btn-primary" onClick={submit}>등록</button>
    </div>
  );
}
```

**4) 화면(View)** — feature 내 컴포넌트를 조합. 공용 UI는 `@/components/ui`에서.

```tsx
// features/students/StudentsView.tsx
import { SectionCard } from '@/components/ui';
import { StudentForm } from './StudentForm';

export function StudentsView() {
  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <SectionCard title="학생 등록">
        <div className="p-4"><StudentForm /></div>
      </SectionCard>
    </div>
  );
}
```

**5) 라우트** — 얇게 연결.

```tsx
// app/students/page.tsx
import { StudentsView } from '@/features/students/StudentsView';
export default function Page() {
  return <StudentsView />;
}
```

**6) 내비게이션** — `components/layout/Sidebar.tsx`의 메뉴 항목을 실제 링크로 연결(`href="/students"`).

→ 이러면 `/students` URL이 생기고, 학생 도메인 코드는 전부 `features/students/`에 모입니다. 다른 도메인(`enrollments`, `payments`, `class-sessions` 등)도 같은 패턴으로 폴더만 늘리면 됩니다.

## 자주 쓰는 디자인 클래스 (globals.css)

- 버튼: `.btn`, `.btn-primary`, `.btn-danger`, `.btn-invisible`, `.btn-sm`
- 카드: `.card`, `.card-pad`
- 뱃지: `.badge` + `.badge-{neutral|accent|success|attention|danger|done}`
- 입력: `.input` · 테이블: `.table` · 숫자: `.mono`
- 색 유틸: `text-fg / text-fg-muted / text-fg-subtle`, `bg-canvas / bg-canvas-subtle`, `border-line`, `text-success / text-attention / text-danger …`
