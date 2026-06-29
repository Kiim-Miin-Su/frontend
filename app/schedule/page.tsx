import { redirect } from "next/navigation";

// 캘린더 탭 통합: 학원 캘린더(월/주/일·필터·드래그·반복)는 /calendar로 일원화.
export default function Page() {
  redirect("/calendar");
}
