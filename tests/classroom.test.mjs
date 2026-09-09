import test from 'node:test';
import assert from 'node:assert/strict';
import { classroomDay, taskDay, todayTasks, chalkTaskPreview } from '../app/classroom-view.ts';
import { normalizeBoardStroke, normalizeBoardText, normalizeBoard, mergeBoard } from '../app/board-state.ts';
import { isEraseStroke } from '../app/board-painter.mjs';
import { buildChalkOutline, resample } from '../app/chalk-renderer.mjs';
import { createPacketReceiver, encodeRoomPackets } from '../app/room-packets.ts';

test('both classmates use the same exact day, preserving all-day labels and timezone boundaries', () => {
  const day=classroomDay(new Date('2026-09-08T16:00:00Z'));
  assert.equal(day,'2026-09-09');
  assert.equal(taskDay('2026-09-08T23:30:00-0700'),'2026-09-09');
  assert.equal(taskDay('2026-09-09T00:00:00+1200',true),'2026-09-09');
  const tasks=[
    {id:'old',dueDate:'2026-09-08',done:false}, {id:'today',dueDate:'2026-09-09',done:false},
    {id:'tomorrow',dueDate:'2026-09-10',done:false}, {id:'undated',done:false},
    {id:'complete',dueDate:'2026-09-09',done:true}, {id:'offset',dueDate:'2026-09-08T23:30:00-0700',done:false},
    {id:'invalid',dueDate:'2026-09-09-nonsense',done:false},
  ];
  assert.deepEqual(todayTasks(tasks,day).map(t=>t.id),['today','offset']);
  assert.deepEqual(todayTasks(tasks,classroomDay(new Date('2026-09-09T16:00:00Z'))).map(t=>t.id),['tomorrow']);
});
test('idle public tasks preserve ordering and reserve space for long titles', () => {
  const tasks=Array.from({length:6},(_,i)=>({id:String(i),title:'第'+i+'项'}));
  assert.deepEqual(chalkTaskPreview(tasks).map(t=>t.id),['0','1','2']);
  assert.equal(chalkTaskPreview([{id:'long',title:'长标题'.repeat(24)}, {id:'other',title:'长标题'.repeat(24)}]).length,1);
  assert.deepEqual(chalkTaskPreview([]),[]);
});
test('white chalk and eraser remain distinct after normalization and old white erasures are compatible', () => {
  const base={id:'s',color:'#ffffff',width:7,points:[{x:10,y:10}],createdAt:1,revision:'r1'};
  const chalk=normalizeBoardStroke({...base,material:'chalk-v1',tool:'pen'});
  assert.equal(isEraseStroke(chalk),false);
  assert.equal(isEraseStroke(normalizeBoardStroke({...base,material:'chalk-v1',tool:'erase'})),true);
  assert.equal(isEraseStroke(normalizeBoardStroke(base)),true);
  assert.equal(normalizeBoardStroke({...base,material:'unknown'}).material,undefined);
});
test('stroke shape is repeatable after serialization and resampling is independent of input density', () => {
  const line=[{x:10,y:30},{x:100,y:30}];
  const sparse=resample(line,2), dense=resample([{x:10,y:30},{x:46,y:30},{x:100,y:30}],2);
  assert.equal(sparse.length,dense.length);
  assert.ok(sparse.every((p,i)=>Math.hypot(p.x-dense[i].x,p.y-dense[i].y)<1e-9));
  const stroke={id:'persistent-id',width:9,points:line};
  assert.deepEqual(buildChalkOutline(stroke),buildChalkOutline(JSON.parse(JSON.stringify(stroke))));
  assert.notDeepEqual(buildChalkOutline(stroke),buildChalkOutline({...stroke,id:'another-id'}));
  assert.equal(buildChalkOutline({...stroke,points:[]}),null);
  assert.ok(buildChalkOutline({...stroke,points:[{x:10,y:30},{x:10,y:30}]}));
});
test('chalk tool and text metadata survive room packets, reconnect and conflicting snapshots', () => {
  const board={id:crypto.randomUUID(),name:'画板',epoch:'0000000000000:initial',createdAt:1,deletedStrokeIds:[],deletedTextIds:[],
    strokes:[{id:'chalk',color:'#f6f1dc',width:7,points:Array.from({length:3000},(_,i)=>({x:i%1200,y:i%720})),createdAt:1,revision:'r1',tool:'pen',material:'chalk-v1'}],
    texts:[{id:'text',text:'中文任务',x:30,y:20,width:200,height:90,color:'#f6f1dc',fontSize:36,confirmed:true,updatedAt:1,revision:'r1',material:'chalk-v1'}]};
  const receiver=createPacketReceiver(); let decoded;
  for(const packet of encodeRoomPackets({type:'board-snapshot',boards:[board]}).reverse()) decoded=receiver(packet) || decoded;
  assert.ok(decoded);
  const normalized=normalizeBoard(decoded.boards[0]);
  assert.equal(normalized.strokes[0].tool,'pen');
  assert.equal(normalizeBoardText(board.texts[0]).material,'chalk-v1');
  const next={...normalized,strokes:[{...normalized.strokes[0],tool:'erase',revision:'r2'}]};
  assert.equal(mergeBoard(normalized,next).strokes[0].tool,'erase');
});
