'use client';
import { useState } from 'react';
import { RoomCollaboration } from '../../RoomCollaboration';
import type { CollaborationSnapshot, RoomTask } from '../../collaboration-types';
import '../../classroom.css';

function sample(): CollaborationSnapshot {
  const day = Math.floor((Date.now() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
  const task = (id: string, title: string, ownerId: string | null, offset?: number, priority: RoomTask['priority'] = 0): RoomTask => ({ id, title, ownerId, priority, version: 'preview', content: '', desc: '', dueDate: offset === undefined ? null : new Date(day + offset * 86400000).toISOString(), startDate: null, isAllDay: true, timeZone: 'Asia/Shanghai', tags: [], reminders: [], repeatFlag: '', repeatFrom: '', kind: 'TEXT', items: [] });
  const buffer = [task('shared-1', '整理本周学习资料', null, undefined, 5), task('shared-2', '准备下次讨论', null), task('shared-3', '一起核对实验报告', null, undefined, 3)];
  buffer[0].content = '补充课堂笔记，并整理需要一起讨论的问题。';
  buffer[0].workflowId = 'preview-workflow';
  return { identityId: 'self', revision: 1, buffer, operations: [], notices: [], members: [
    { id: 'self', name: '11', connected: true, tasks: [task('a1','完成数据结构练习','self',0,5),task('a2','整理课堂笔记','self',1,3),task('a3','准备小组汇报','self',2),task('a4','复习离散数学','self',3,1),task('a5','检查实验结果','self',6),task('a6','提交课程报告','self',15),task('a7','阅读学习资料','self',undefined,3),task('a8','整理错题','self'),task('a9','补充算法笔记','self',undefined,1)] },
    { id: 'peer', name: '11scat', connected: true, tasks: [task('b1','复习本周内容','peer',0,3),task('b2','完成阅读记录','peer',1),task('b3','准备讨论材料','peer',3,5),task('b4','检查课程安排','peer',7),task('b5','整理共享文件','peer',undefined,1),task('b6','核对笔记目录','peer'),task('b7','补充学习计划','peer')] }
  ], workflows: [{ id: 'preview-workflow', title: buffer[0].title, fields: buffer[0], source: { ownerId: null, taskId: buffer[0].id, version: 'preview' }, reviewerId: 'self', claimantId: 'peer', targetId: 'preview', status: 'working', version: 1, createdAt: Date.now(), updatedAt: Date.now(), error: '', events: [] }] };
}
export function TaskboardPreview() {
  const [snapshot] = useState(sample);
  return <main style={{ minHeight: '100dvh', background: '#f5edda', padding: 20 }}><RoomCollaboration identityId="self" previewSnapshot={snapshot} onChanged={async () => true} /></main>;
}
