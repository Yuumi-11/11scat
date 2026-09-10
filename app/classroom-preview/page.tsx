import { notFound } from 'next/navigation';
import { ClassroomPreview } from './preview';
export const dynamic = 'force-dynamic';
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ width?: string; calendar?: string; font?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  const width = Number(params.width);
  if ([390, 768, 1440].includes(width)) return <div style={{ minHeight: '100dvh', padding: 12, background: '#d8d3c8' }}><iframe title="教室响应式预览" src="/classroom-preview" style={{display:'block',width,height:width===390?844:900,border:0,background:'#f5edda'}} /></div>;
  const font = params.font || (params.calendar === 'rounded' ? 'rounded' : 'sans');
  return <ClassroomPreview deviceFont={['sans','rounded','youyuan'].includes(font) ? font : 'sans'} />;
}
