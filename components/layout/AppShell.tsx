// [참조/처리] 앱 크롬(사이드바/탑바) + 역할 동기화.
//  - 공개(인증) 경로는 크롬 없이 전체화면. 그 외에는 토큰→currentRole 동기화.
//  - 서버 데이터는 각 뷰가 필요 시 TanStack Query 훅으로 직접 패칭한다(단일 소스: 백엔드).
"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { currentClaims } from "@/lib/auth";
import { isPublicRoute } from "@/lib/auth-routes";
import { useTacoStore } from "@/lib/store";
import type { AccountRole } from "@/types";

// 공개(인증) 경로는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const publicRoute = isPublicRoute(pathname);

  // 로그인된 경우에만 역할을 앱 전역 currentRole에 반영(공개 경로에선 동기화하지 않음).
  useEffect(() => {
    if (publicRoute) return;
    const claims = currentClaims();
    const role = claims?.roles?.[0];
    if (role) setCurrentRole(role as AccountRole);
  }, [pathname, publicRoute, setCurrentRole]);

  if (publicRoute) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
