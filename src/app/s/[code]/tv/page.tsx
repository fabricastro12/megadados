import { TvScreen } from '@/features/tv/TvScreen';

export default async function TvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TvScreen code={code.toUpperCase()} />;
}
