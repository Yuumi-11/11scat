import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeTextGeometry, scaleTextGeometry } from '../app/board-text-geometry.ts';
import { fixedClassroomSeats, memberDevices } from '../app/classroom-members.ts';
import { createMediaRecovery } from '../app/media-recovery.ts';
import { classroomFullscreenScale } from '../app/fullscreen-controls.ts';
const text = { x: 200, y: 100, width: 300, height: 120, fontSize: 36 };
test('fullscreen uses one scale and includes projector and tray overhang',()=>{
  const scale=classroomFullscreenScale(956,578,1441,731);
  assert.ok(scale>1);assert.ok((956+26)*scale<=1441);assert.ok((578+70)*scale<=731);
  assert.equal(51*scale/51,32*scale/32);
});
test('side handles wrap text without changing font size or the opposite edge', () => {
  const changed=resizeTextGeometry(text,'w',50,0);
  assert.equal(changed.fontSize,36);assert.equal(changed.x+changed.width,500);assert.equal(changed.height,120);
  assert.equal(resizeTextGeometry(text,'s',0,60).fontSize,36);
});
test('all four corners preserve font and box proportions, the fixed corner, and board bounds', () => {
  for(const handle of ['nw','ne','sw','se']){
    const result=resizeTextGeometry(text,handle,handle.includes('w')?-150:150,handle.includes('n')?-60:60);
    assert.ok(Math.abs(result.width/result.height-text.width/text.height)<1e-9);
    assert.ok(Math.abs(result.fontSize/text.fontSize-result.width/text.width)<1e-9);
    assert.equal(handle.includes('w')?result.x+result.width:result.x,handle.includes('w')?500:200);
    assert.equal(handle.includes('n')?result.y+result.height:result.y,handle.includes('n')?220:100);
    assert.ok(result.x>=0&&result.y>=0&&result.x+result.width<=1200&&result.y+result.height<=720);
  }
  const extreme=resizeTextGeometry(text,'se',10000,10000);assert.ok(extreme.x+extreme.width<=1200&&extreme.y+extreme.height<=720&&extreme.fontSize<=96);
});
test('wheel scaling uses the same size and font transformation as a corner',()=>{
  assert.deepEqual(scaleTextGeometry(text,1.5),resizeTextGeometry(text,'se',150,60));
});
test('multiple devices and unrecognized peers do not add or reorder fixed seats',()=>{
  const profile={members:[{id:'a',name:'甲',activity:''},{id:'b',name:'乙',activity:''}],seats:['b','a'],font:'sans'};
  assert.deepEqual(memberDevices('b',['one','two','one','unknown'],{one:'b',two:'b'}),['one','two']);
  assert.deepEqual(fixedClassroomSeats(profile).map(item=>item.id),['b','a']);
  assert.equal(fixedClassroomSeats({...profile,members:[]}).length,2);
});
test('microphone recovery uses audio tracks and never starts a new capture',()=>{
  const capture={getAudioTracks:()=>[{readyState:'live',muted:false}]};let count=0;
  const recovery=createMediaRecovery({peers:()=>['b'],canSend:()=>true,stream:source=>source==='microphone'?capture:null,restart:(_peer,stream,source)=>{assert.equal(stream,capture);assert.equal(source,'microphone');count++;}});
  recovery.request('microphone');assert.equal(count,1);recovery.forget('b');
});
