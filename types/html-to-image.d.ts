// html-to-image 최소 타입 선언(설치 전 타입체크용 — 실제 설치 시 패키지 타입과 병합).
declare module "html-to-image" {
  export interface Options {
    backgroundColor?: string;
    pixelRatio?: number;
    quality?: number;
    cacheBust?: boolean;
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration>;
  }
  export function toPng(node: HTMLElement, options?: Options): Promise<string>;
  export function toJpeg(node: HTMLElement, options?: Options): Promise<string>;
  export function toSvg(node: HTMLElement, options?: Options): Promise<string>;
}
