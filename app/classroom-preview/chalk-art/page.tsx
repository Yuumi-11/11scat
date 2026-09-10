import { notFound } from 'next/navigation';
import { ChalkArtSamples } from './samples';
export default function ChalkArtPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ChalkArtSamples />;
}
