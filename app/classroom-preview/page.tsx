import { notFound } from 'next/navigation';
import { ClassroomPreview } from './preview';
import { getBoardTone } from './board-tones';
export const dynamic = 'force-dynamic';
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ width?: string; calendar?: string; font?: string; board?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  const width = Number(params.width);
  const boardTone = getBoardTone(params.board);
  if ([390, 768, 1440].includes(width)) {
    const query = new URLSearchParams({ board: boardTone.id });
    return <div style={{ minHeight: '100dvh', padding: 12, background: '#d8d3c8' }}><iframe title="教室响应式预览" src={`/classroom-preview?${query}`} style={{display:'block',width,height:width===390?844:900,border:0,background:'#f5edda'}} /></div>;
  }
  return <ClassroomPreview initialBoardTone={boardTone.id} />;
}
