import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { BoardDeletionStore } from '../app/api/room/boards/store.ts';
import { replaceClassroomBoards } from '../app/classroom-boards.ts';

test('deleting a selected board chooses its preceding surviving board in display order', () => {
  const boards = [{id:'c',createdAt:3},{id:'a',createdAt:1},{id:'b',createdAt:2}];
  const remove = (activeBoardId, ids) => replaceClassroomBoards({ boards, activeBoardId }, boards.filter(item => !ids.includes(item.id)));
  assert.equal(remove('c',['c']).activeBoardId,'b');
  assert.equal(remove('b',['b']).activeBoardId,'a');
  assert.equal(remove('a',['a']).activeBoardId,'');
  assert.equal(remove('c',['b','c']).activeBoardId,'a', 'simultaneous remote deletions skip missing predecessors');
  assert.equal(remove('c',['a','b']).activeBoardId,'c', 'deleting another board preserves selection');
  assert.equal(remove('',['b']).activeBoardId,'');
  assert.equal(remove('c',['a','b','c']).activeBoardId,'');
});

test('deleting every custom board keeps the default selected, and concurrent deletion receipts survive restart', async () => {
  await mkdir('codex-generated/test-data',{recursive:true});
  const dir=await mkdtemp(path.resolve('codex-generated/test-data/boards-'));
  const store=new BoardDeletionStore(dir);
  await Promise.all([store.delete('a'),store.delete('b'),store.delete('a')]);
  assert.deepEqual((await new BoardDeletionStore(dir).read()).sort(),['a','b']);
  let state={boards:[{id:'a'},{id:'b'}],activeBoardId:'a'};
  state=replaceClassroomBoards(state,state.boards.filter(board=>board.id!=='a'));
  assert.equal(state.activeBoardId,'');
  state={...state,activeBoardId:'b'};
  state=replaceClassroomBoards(state,[]);
  assert.deepEqual(state,{boards:[],activeBoardId:''});
  const stale=[{id:'a'},{id:'b'}].filter(board=>!(new Set(['a','b'])).has(board.id));
  assert.deepEqual(replaceClassroomBoards(state,stale),state);
});
