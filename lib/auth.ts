import { jwtDecode } from 'jwt-decode';

// 프론트는 토큰을 "읽기"만 합니다. 서명/검증은 백엔드(NestJS) 책임.
export interface TokenClaims {
  sub: number; // user id
  name: string;
  roles: string[]; // user_roles
  exp: number; // epoch seconds
  iat: number;
}

export function decodeToken(token: string): TokenClaims | null {
  try {
    return jwtDecode<TokenClaims>(token);
  } catch {
    return null;
  }
}

export function isExpired(token: string): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;
  return claims.exp * 1000 <= Date.now();
}

export function hasRole(token: string, role: string): boolean {
  return decodeToken(token)?.roles?.includes(role) ?? false;
}

// ── 토큰 저장: 쿠키(미들웨어 가드가 읽을 수 있도록) ──
// localStorage가 아닌 쿠키에 두는 이유: Next.js middleware는 서버 엣지에서 쿠키만 읽을 수 있음.
const TOKEN_KEY = 'token';
// 인메모리 폴백: 쿠키가 어떤 이유로든(만료 계산·samesite·읽기 타이밍) 비어도 이 세션 동안 토큰 유지.
// → 로그인했는데 일부 요청만 401(토큰 누락)로 실패하던 문제 방지.
let memToken: string | null = null;

export function setToken(token: string) {
  memToken = token;
  if (typeof document === 'undefined') return;
  const claims = decodeToken(token);
  // max-age는 최소 60초 보장(만료 임박·시계 오차로 즉시 사라지는 것 방지). 기본 1시간.
  const remain = claims ? claims.exp - Math.floor(Date.now() / 1000) : 3600;
  const maxAge = Math.max(60, remain);
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

export function getToken(): string | null {
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return memToken; // 쿠키 없으면 인메모리 폴백
}

export function clearToken() {
  memToken = null;
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; samesite=lax`;
}

// 현재 로그인 사용자 클레임(없거나 만료면 null).
export function currentClaims(): TokenClaims | null {
  const t = getToken();
  if (!t || isExpired(t)) return null;
  return decodeToken(t);
}
