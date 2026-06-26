import { CounselDetailView } from '@/features/counsel/CounselDetailView';

export default async function Page({
  params,
}: {
  params: Promise<{ counselId: string }>;
}) {
  const { counselId } = await params;
  return <CounselDetailView counselId={Number(counselId)} />;
}
