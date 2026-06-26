import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 추후 데스크탑(Electron/Tauri) 전환을 위해 정적 export로 바꿀 수 있도록 여지를 둡니다.
  // output: 'export',
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
