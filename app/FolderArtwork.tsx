export function FolderArtwork({ draft = false }: { draft?: boolean }) {
  return <svg className="drive-folder-art" viewBox="0 0 132 100" aria-hidden="true">
    {draft ? <><path d="M12 35V25a8 8 0 0 1 8-8h28a8 8 0 0 1 6 3l9 10h49a8 8 0 0 1 8 8v41a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="5 5" /><path d="M54 57h24M66 45v24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></> : <>
      <path d="M12 35V25a8 8 0 0 1 8-8h28a8 8 0 0 1 6 3l9 10h49a8 8 0 0 1 8 8v41a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8Z" fill="#d8c99c" stroke="#b8aa82" strokeWidth="1.2" />
      <rect x="12" y="35" width="108" height="52" rx="8" fill="#e7dcb9" stroke="#b8aa82" strokeWidth="1.2" />
    </>}
  </svg>;
}
