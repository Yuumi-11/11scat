import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyClassroomAction, incomingSeatRequests } from '../app/classroom-members.ts';
import { parseClassroomAction } from '../app/classroom-settings-action.ts';

test('only a named action can change settings; raw seats and impersonated actors are rejected', () => {
  for (const value of [null, [], { seats: ['b','a'], font: 'sans' }, { action: 'request-seat-exchange', identityId:'b' }, { action:'approve-seat-exchange' }, { action:'approve-seat-exchange', requestId:'x', seats:['b','a'] }, { action:'font',font:'youyuan' }, {action:'unknown'}]) assert.equal(parseClassroomAction(value), null);
  assert.deepEqual(parseClassroomAction({action:'request-seat-exchange'}),{action:'request-seat-exchange'});
  assert.deepEqual(parseClassroomAction({action:'approve-seat-exchange',requestId:'x'}),{action:'approve-seat-exchange',requestId:'x'});
});

test('preview and room share recipient-only approval, outgoing/incoming badges, cancel and decline rules', () => {
  const initial = {members:[{id:'a',name:'甲'},{id:'b',name:'乙'}],seats:['a','b'],font:'rounded'};
  const pending = applyClassroomAction(initial,'a',{action:'request-seat-exchange'},'first','now');
  assert.deepEqual(pending.seats,initial.seats);
  assert.equal(incomingSeatRequests(pending,'a'),0); assert.equal(incomingSeatRequests(pending,'b'),1);
  const approve={action:'approve-seat-exchange',requestId:'first'};
  assert.throws(()=>applyClassroomAction(pending,'a',approve,'',''),/收到申请/);
  assert.throws(()=>applyClassroomAction(pending,'outside',approve,'',''),/座位成员/);
  assert.throws(()=>applyClassroomAction(pending,'b',{action:'cancel-seat-exchange',requestId:'first'},'',''),/自己的申请/);
  assert.throws(()=>applyClassroomAction({...pending,seats:['b','a']},'b',approve,'',''),/座位已变化/);
  const approved=applyClassroomAction(pending,'b',approve,'','');
  assert.deepEqual(approved.seats,['b','a']); assert.equal(incomingSeatRequests(approved,'b'),0);
  assert.throws(()=>applyClassroomAction(approved,'b',approve,'',''),/已处理/);
  for(const [actor,action] of [['a','cancel-seat-exchange'],['b','decline-seat-exchange']]) {
    const result=applyClassroomAction(pending,actor,{action,requestId:'first'},'','');
    assert.deepEqual(result.seats,['a','b']); assert.equal(result.seatExchange,null);
  }
  assert.throws(()=>applyClassroomAction({...initial,seats:['a']},'a',{action:'request-seat-exchange'},'',''),/另一位成员/);
});

test('requests persist across reload; concurrent approvals swap once and preserve activity, notes, font and secrets',async()=>{
  const root=path.join(process.cwd(),'codex-generated','classroom-settings-tests');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'case-'));process.env.DATA_DIR=directory;
  assert.ok(path.resolve(directory).startsWith(path.resolve(root)+path.sep));
  const {updateUser,getUser,getClassroomProfile,updateClassroomProfile}=await import('../app/api/identity/store.ts');
  try {
    await updateUser('a',()=>({nickname:'甲',ticktickToken:'private-fixture',updatedAt:'one'}));
    await updateUser('b',()=>({nickname:'乙',updatedAt:'one'}));
    assert.deepEqual((await getClassroomProfile()).seats,['a','b']);
    const requests = await Promise.allSettled([updateClassroomProfile('a',{action:'request-seat-exchange'}),updateClassroomProfile('b',{action:'request-seat-exchange'})]);
    assert.equal(requests.filter(item=>item.status==='fulfilled').length,1);
    const persisted=JSON.parse(await readFile(path.join(directory,'identities.json'),'utf8'));
    assert.equal(persisted.classroom.seatExchange.requesterId,'a');
    assert.deepEqual(persisted.classroom.seats,['a','b']);
    const pending=(await getClassroomProfile()).seatExchange;
    const reloaded=await import('../app/api/identity/store.ts?classroom-reload');
    assert.deepEqual((await reloaded.getClassroomProfile()).seatExchange,pending);
    await assert.rejects(updateClassroomProfile('a',{action:'approve-seat-exchange',requestId:pending.id}));
    await assert.rejects(updateClassroomProfile('outside',{action:'approve-seat-exchange',requestId:pending.id}));
    const results = await Promise.allSettled([
      updateClassroomProfile('b',{action:'approve-seat-exchange',requestId:pending.id}),
      updateClassroomProfile('b',{action:'approve-seat-exchange',requestId:pending.id}),
      updateClassroomProfile('a',{action:'font',font:'sans'}),
      updateUser('a',current=>({...current,activity:'阅读',todoNote:'随手记',updatedAt:'two'})),
    ]);
    assert.deepEqual(results.map(item=>item.status),['fulfilled','rejected','fulfilled','fulfilled']);
    const result=await getClassroomProfile();assert.deepEqual(result.seats,['b','a']);assert.equal(result.font,'sans');
    assert.equal(result.seatExchange,null);assert.equal(result.members.find(item=>item.id==='a').todoNote,'随手记');
    assert.equal(result.members.find(item=>item.id==='a').activity,'阅读');assert.ok(!JSON.stringify(result).includes('private-fixture'));
    await assert.rejects(updateClassroomProfile('outside',{action:'font',font:'rounded'}));
    await assert.rejects(updateClassroomProfile('a',{action:'font',font:'untrusted-font'}));
    assert.deepEqual((await getClassroomProfile()).seats,['b','a']);assert.equal((await getUser('a')).ticktickToken,'private-fixture');
  }finally{delete process.env.DATA_DIR;}
});
