"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 앱 전역 TanStack Query 클라이언트. 서버 데이터(스케줄·정산·목록 등)의 캐싱·재검증·
// 낙관적 업데이트를 담당한다. (목데이터를 백엔드로 이관하며 점진 도입 — lib/queryKeys)
export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30초 동안은 캐시를 신선한 것으로 간주(불필요한 재요청 억제)
            retry: 1, // 실패 시 1회 재시도(오프라인 데모에서 과도한 재시도 방지)
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
