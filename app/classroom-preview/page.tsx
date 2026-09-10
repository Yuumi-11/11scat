import { notFound } from 'next/navigation';
import { ClassroomPreview } from './preview';
import { calendarFontOptions, calendarTitleOptions } from './font-options';
export const dynamic = 'force-dynamic';
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ width?: string; calendar?: string; title?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  const width = Number(params.width);
  if ([390, 768, 1440].includes(width)) return <div style={{ minHeight: '100dvh', padding: 12, background: '#d8d3c8' }}><iframe title="教室响应式预览" src="/classroom-preview" style={{display:'block',width,height:width===390?844:900,border:0,background:'#f5edda'}} /></div>;
  return <ClassroomPreview calendarFont={calendarFontOptions.find(item=>item.id===params.calendar)?.id} calendarTitle={calendarTitleOptions.find(item=>item.id===params.title)?.id} />;
}
