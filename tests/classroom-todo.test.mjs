import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { classroomTodoWindow, classroomTodoTasks, mergeTodoSnapshot } from '../app/classroom-todo.ts';
import { addAndSelectBoard, adjacentBoardId } from '../app/classroom-boards.ts';
import { createTodoStore } from '../app/api/room/todo/store.ts';
const now = Date.parse('2026-09-11T06:00:00+08:00');
const task = (id, dueDate, done = false, extra = {}) => ({id, title: id, project: 'test', dueDate, done, ...extra});

test('room todo changes exactly at Shanghai 06:00 and uses the preceding 24 hours', () => {
  assert.equal(classroomTodoWindow(now - 1).day, '2026-09-10');
  assert.deepEqual(classroomTodoWindow(now), {day:'2026-09-11',start:now-86400000,end:now,next:now+86400000});
  assert.equal(classroomTodoWindow(new Date('2026-09-10T22:00:00Z')).day,'2026-09-11');
});
test('todo includes overdue unfinished tasks and the window, excludes future and undated tasks', () => {
  const tasks = [task('overdue','2026-09-01T12:00:00+08:00'),task('previous','2026-09-10',false,{isAllDay:true}),task('window-done','2026-09-10T06:00:00+08:00',true),task('older-done','2026-09-10T05:59:59+08:00',true),task('next','2026-09-11',false,{isAllDay:true}),task('boundary','2026-09-11T06:00:00+08:00'),task('undated',undefined)];
  assert.deepEqual(classroomTodoTasks(tasks,now).map(t=>t.id),['overdue','previous','window-done']);
  assert.ok(classroomTodoTasks(tasks,now+1).some(t=>t.id==='boundary'));
});
test('checks stay for the completion day after refresh, and leave at the next six oclock', () => {
  const done = task('one','2026-09-01',true,{completedDay:'2026-09-11'});
  assert.deepEqual(mergeTodoSnapshot([done],[],now),[done]);
  assert.deepEqual(mergeTodoSnapshot([done],[{...done,done:false,completedDay:undefined}],now),[done]);
  assert.deepEqual(mergeTodoSnapshot([done],[],now+86400000),[]);
  const repeat=task('one','2026-09-10T13:00:00+08:00');
  assert.deepEqual(mergeTodoSnapshot([done],[repeat],now),[repeat]);
});
test('completion snapshots are durable, concurrent member writes stay independent',async()=>{
  const root=path.resolve('codex-generated/classroom-todo-tests'); await mkdir(root,{recursive:true});
  const dir=await mkdtemp(path.join(root,'case-')), store=createTodoStore(dir);
  const a=task('same','2026-09-10'), b=task('same','2026-09-09');
  await Promise.all([store.reconcile('alice',[a],now),store.reconcile('bob',[b],now)]);
  await store.complete('alice','same',now);
  const loaded=createTodoStore(dir);
  assert.equal((await loaded.reconcile('alice',[],now))[0].done,true);
  assert.equal((await loaded.reconcile('bob',[b],now))[0].done,false);
  assert.equal(JSON.parse(await readFile(path.join(dir,'classroom-todo.json'),'utf8')).members.alice.tasks[0].completedDay,'2026-09-11');
  assert.deepEqual(await loaded.reconcile('alice',[],now+86400000),[]);
});
test('creation selects the exact new board, ordered neighbors stop at the default and last boards',()=>{
  let state={boards:[],activeBoardId:''};
  const make=id=>({id,name:id,createdAt:Number(id),strokes:[],texts:[],deletedStrokeIds:[],deletedTextIds:[],epoch:'initial'});
  state=addAndSelectBoard(state,make('2')); assert.equal(state.activeBoardId,'2');
  state=addAndSelectBoard(state,make('1')); assert.equal(state.activeBoardId,'1');
  assert.equal(adjacentBoardId(state.boards,'1',-1),'');
  assert.equal(adjacentBoardId(state.boards,'',-1),'');
  assert.equal(adjacentBoardId(state.boards,'',1),'1');
  assert.equal(adjacentBoardId(state.boards,'2',1),'2');
  for(let i=3;i<=12;i++)state=addAndSelectBoard(state,make(String(i)));
  assert.equal(addAndSelectBoard(state,make('13')),state);
});
