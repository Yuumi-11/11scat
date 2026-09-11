import { notFound } from 'next/navigation';
import { TaskboardPreview } from './preview';
export const dynamic = 'force-dynamic';
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <TaskboardPreview />;
}
