import type { CSSProperties } from 'react';
import { classroomChalkArt, classroomChalkArtUrl, type ClassroomChalkArtId } from './classroom-chalk-art';

type ChalkMotifProps = {
  name: ClassroomChalkArtId;
  size?: number | string;
  rotation?: number;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function ChalkMotif({
  name, size = 160, rotation = 0, decorative = true, className, style,
}: ChalkMotifProps) {
  return <span
    className={className}
    role={decorative ? undefined : 'img'}
    aria-hidden={decorative ? true : undefined}
    aria-label={decorative ? undefined : classroomChalkArt.find(art => art.id === name)?.name}
    style={{
      display: 'inline-block',
      width: size,
      aspectRatio: '1',
      flexShrink: 0,
      backgroundImage: `url('${classroomChalkArtUrl(name)}')`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      transform: rotation ? `rotate(${rotation}deg)` : undefined,
      ...style,
    }}
  />;
}
