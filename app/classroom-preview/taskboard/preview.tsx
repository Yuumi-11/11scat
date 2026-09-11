'use client';
import { useState } from 'react';
import { RoomCollaboration } from '../../RoomCollaboration';
import { createTaskboardPreviewSnapshot } from './sample';
import '../../classroom.css';

export function TaskboardPreview({ chineseNames = false }: { chineseNames?: boolean }) {
  const [snapshot] = useState(() => {
    const data = createTaskboardPreviewSnapshot();
    if (chineseNames) { data.members[0].name = '小林'; data.members[1].name = '今天也要认真学习'; }
    return data;
  });
  return <main style={{ minHeight: '100dvh', background: '#f5edda', padding: 20 }}><RoomCollaboration identityId="self" previewSnapshot={snapshot} onChanged={async () => true} /></main>;
}
