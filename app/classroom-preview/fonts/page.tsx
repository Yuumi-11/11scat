import { notFound } from 'next/navigation';
import { CalendarFontComparison } from './samples';

export default function CalendarFontsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CalendarFontComparison />;
}
