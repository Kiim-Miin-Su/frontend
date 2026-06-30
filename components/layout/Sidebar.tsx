"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTacoStore } from "@/lib/store";
import { roleLabel } from "@/lib/roles";
import { decodeToken } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  IconHome,
  IconUsers,
  IconBook,
  IconCard,
  IconWallet,
  IconReceipt,
  IconReport,
  IconSettings,
  IconChat,
  IconGrid,
  IconCalendar,
} from "../ui/icons";

type Item = { label: string; icon: React.FC<any>; href: string; badge?: string };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "운영",
    items: [
      { label: "대시보드", icon: IconHome, href: "/" },
      { label: "캘린더", icon: IconCalendar, href: "/calendar", badge: "NEW" },
      { label: "상담", icon: IconChat, href: "/counsel" },
      { label: "학생 · 부모", icon: IconUsers, href: "/students" },
      { label: "수업 (강사)", icon: IconBook, href: "/sessions" },
    ],
  },
  {
    title: "입금",
    items: [{ label: "결제 · 수납", icon: IconCard, href: "/payments", badge: "2" }],
  },
  {
    title: "출금",
    items: [
      { label: "강사 페이", icon: IconWallet, href: "/payouts" },
      { label: "지출 · 비품", icon: IconReceipt, href: "/expenses" },
    ],
  },
  {
    title: "기타",
    items: [
      { label: "수업 보고서", icon: IconReport, href: "/reports" },
      { label: "관리자", icon: IconGrid, href: "/admin" },
      { label: "설정", icon: IconSettings, href: "#" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => href !== "#" && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // 현재 역할(데모 컨텍스트 — Topbar에서 전환) → 좌측 유저 표시 단일 소스
  const role = useTacoStore((s) => s.currentRole);
  // 로그인 토큰이 있으면 디코딩해 실제 이름을 사용(직책 대신). 없으면 데모 이름.
  const [tokenName, setTokenName] = useState<string | null>(null);
  // 강사/학생 역할은 백엔드 자원에서 대표 인물명을 가져와 표시(참조 무결성: 역할↔표시 일치)
  const [people, setPeople] = useState<{ instructor?: string; student?: string }>({});
  useEffect(() => {
    const t = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    if (t) setTokenName(decodeToken(t)?.name ?? null);
    api.schedule
      .resources()
      .then((r) => setPeople({ instructor: r.instructors[0]?.name, student: r.students[0]?.name }))
      .catch(() => {});
  }, []);
  // 직책이 아니라 실제 이름. 토큰 우선 → 강사/학생은 백엔드 인물 → 데모 이름.
  const demoName =
    role === "instructor" ? people.instructor ?? "강사"
      : role === "student" ? people.student ?? "학생"
        : role === "parent" ? "최영희"
          : role === "manager" ? "이지원"
            : "김민수"; // super_admin / admin
  const identity = { name: tokenName ?? demoName };

  // 좌측 네비 접기/펴기 — 화면 가로 비율 조절. 선택값은 localStorage에 보존.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem("sidebarCollapsed") === "1") setCollapsed(true);
  }, []);
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      if (typeof window !== "undefined") window.localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside className={`${collapsed ? "w-14" : "w-60"} shrink-0 border-r flex flex-col bg-canvas transition-[width] duration-200`}>
      <div className={`h-14 flex items-center border-b ${collapsed ? "justify-center px-0" : "gap-2.5 px-4"}`}>
        <div className="w-7 h-7 rounded-md grid place-items-center text-fg-onemph font-bold text-[13px] bg-[var(--color-fg)] shrink-0">
          <Link href="/">T</Link>
        </div>
        {!collapsed && (
          <>
            <div className="leading-tight flex-1">
              <div className="font-semibold text-[14px]">TACO ERP</div>
              <div className="text-[11px] text-fg-subtle">TnAcademy</div>
            </div>
            <button onClick={toggle} title="네비 접기" className="w-6 h-6 grid place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-[14px]">«</button>
          </>
        )}
      </div>

      {collapsed && (
        <button onClick={toggle} title="네비 펴기" className="mx-auto mt-2 w-8 h-7 grid place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-[14px]">»</button>
      )}

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((g) => (
          <div key={g.title} className={`mb-3 ${collapsed ? "px-1.5" : "px-3"}`}>
            {!collapsed && <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{g.title}</div>}
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = isActive(it.href);
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  title={collapsed ? it.label : undefined}
                  className={`flex items-center h-8 rounded-md text-[13px] mb-0.5 ${collapsed ? "justify-center px-0" : "gap-2.5 px-2"} ${
                    active ? "bg-neutral-subtle font-semibold text-fg" : "text-fg-muted hover:bg-canvas-subtle hover:text-fg"
                  }`}
                >
                  <Icon className="text-fg-subtle" />
                  {!collapsed && <span className="flex-1">{it.label}</span>}
                  {!collapsed && it.badge && <span className="badge badge-accent">{it.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`border-t p-3 flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
        <div className="w-7 h-7 rounded-full bg-neutral-subtle grid place-items-center text-[12px] font-semibold text-fg-muted shrink-0" title={collapsed ? `${identity.name} · ${roleLabel[role]}` : undefined}>
          {identity.name.slice(0, 1)}
        </div>
        {!collapsed && (
          <div className="leading-tight flex-1">
            <div className="text-[13px] font-medium">{identity.name}</div>
            <div className="text-[11px] text-fg-subtle">{roleLabel[role]}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
