import { useId } from "react";

export function FolderArtwork({ draft = false }: { draft?: boolean }) {
  const gradient = useId();
  return <svg className="drive-folder-art" viewBox="0 0 132 100" aria-hidden="true">
    {draft ? <><path d="M10 31V23a7 7 0 0 1 7-7h31l13 12h53a8 8 0 0 1 8 8v45a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8Z" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" /><path d="M54 57h24M66 45v24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></> : <>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffe49a" /><stop offset="1" stopColor="#edbd54" /></linearGradient></defs>
      <ellipse cx="66" cy="92" rx="49" ry="4" fill="#805715" opacity=".12" />
      <path d="M10 34V22a7 7 0 0 1 7-7h31l12 12h54a8 8 0 0 1 8 8v45a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8Z" fill="#d7a039" stroke="#bd8625" strokeWidth="1.2" />
      <path d="M20 33h93v30H20Z" fill="#fff5d6" />
      <path d="M12 39a7 7 0 0 1 7-7h31l10 7h54a8 8 0 0 1 8 8l-4 35a8 8 0 0 1-8 7H22a8 8 0 0 1-8-7L10 47a8 8 0 0 1 2-8Z" fill={`url(#${gradient})`} stroke="#c39435" strokeWidth="1.2" />
      <path d="M19 36h29l11 7h54" fill="none" stroke="#fff4cf" strokeWidth="2" strokeLinecap="round" />
    </>}
  </svg>;
}
