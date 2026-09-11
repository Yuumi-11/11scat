import type { CSSProperties } from 'react';

export const boardTones = [
  { id: 'original', label: '原色', color: '#426e63', description: '原来的青绿色' },
  { id: 'warm', label: '偏暖', color: '#4a6f60', description: '少一点蓝，略偏橄榄绿' },
  { id: 'gray', label: '偏灰', color: '#506f65', description: '降低饱和度，颜色柔和些' },
  { id: 'teal', label: '微青', color: '#426b69', description: '略添青色，感觉清凉些' },
  { id: 'deep', label: '稍深', color: '#3c645a', description: '压低亮度，衬出粉笔字' },
  { id: 'light', label: '稍浅', color: '#4d786c', description: '提亮一点，感觉轻盈些' },
] as const;

export type BoardTone = typeof boardTones[number];

export function getBoardTone(id?: string | null): BoardTone {
  return boardTones.find(tone => tone.id === id) || boardTones[4];
}

export function boardToneStyle(tone: BoardTone): CSSProperties {
  return { '--board-color': tone.color, '--board-overlay': `${tone.color}8f` } as CSSProperties;
}
