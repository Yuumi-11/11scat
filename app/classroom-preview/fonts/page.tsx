import { notFound } from 'next/navigation';
import { DeviceFontComparison } from './devices';

export default function CalendarFontsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DeviceFontComparison />;
}
