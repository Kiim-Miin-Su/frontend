import { ClassSessionDetailView } from '@/features/sessions/ClassSessionDetailView';

// Next 15: params는 Promise. 서버에서 풀어 클라이언트 뷰에 number로 전달.
export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ClassSessionDetailView sessionId={Number(sessionId)} />;
}
