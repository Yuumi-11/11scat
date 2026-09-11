import { notFound } from 'next/navigation';
import { TaskboardPreview } from './preview';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ names?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <TaskboardPreview chineseNames={(await searchParams).names === 'zh'} />;
}
