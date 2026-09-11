import { safeAccessReturn } from "../access-return";
import { AccessForm } from './AccessForm';

type AccessPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export const metadata = {
  title: "访问 11scat",
  robots: { index: false, follow: false },
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const { error, next } = await searchParams;

  return <AccessForm next={safeAccessReturn(next)} invalid={!!error} />;
}
