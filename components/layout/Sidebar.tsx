"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
      { label: "주간 표", icon: IconCalendar, href: "/timetable" },
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

  return (
    <aside className="w-60 shrink-0 border-r flex flex-col bg-canvas">
      <div className="h-14 flex items-center gap-2.5 px-4 border-b">
        <div className="w-7 h-7 rounded-md grid place-items-center text-fg-onemph font-bold text-[13px] bg-[var(--color-fg)]">
          <Link href="/" className="">
            T
          </Link>
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-[14px]">TACO ERP</div>
          <div className="text-[11px] text-fg-subtle">TnAcademy</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((g) => (
          <div key={g.title} className="px-3 mb-3">
            <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{g.title}</div>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = isActive(it.href);
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  className={`flex items-center gap-2.5 px-2 h-8 rounded-md text-[13px] mb-0.5 ${
                    active ? "bg-neutral-subtle font-semibold text-fg" : "text-fg-muted hover:bg-canvas-subtle hover:text-fg"
                  }`}
                >
                  <Icon className="text-fg-subtle" />
                  <span className="flex-1">{it.label}</span>
                  {it.badge && <span className="badge badge-accent">{it.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t p-3 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-neutral-subtle grid place-items-center text-[12px] font-semibold text-fg-muted">
          교
        </div>
        <div className="leading-tight flex-1">
          {/* FIXME: fetch to server */}
          <div className="text-[13px] font-medium">교수실장</div>
          <div className="text-[11px] text-fg-subtle">super_admin</div>
        </div>
      </div>
    </aside>
  );
}
