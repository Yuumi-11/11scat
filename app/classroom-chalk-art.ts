export const classroomChalkArt = [
  { id: 'heart', name: '爱心' },
  { id: 'stars', name: '星星' },
  { id: 'balloons', name: '三个气球' },
  { id: 'cat', name: '猫咪' },
] as const;

export type ClassroomChalkArtId = typeof classroomChalkArt[number]['id'];

export function classroomChalkArtUrl(id: ClassroomChalkArtId, format: 'webp' | 'png' = 'webp') {
  return `/classroom/chalk/handdrawn/${id}.${format}`;
}
