import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "TACO ERP — TnAcademy",
  description: "TnAcademy 백오피스 ERP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: 브라우저 확장프로그램이 html/body에 주입하는 속성 등
    // 앱 외부 요인으로 인한 hydration 경고를 무시 (앱 내부 포맷은 결정적으로 처리됨)
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
