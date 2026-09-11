import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyClassroomAction, classroomSettingsDraft, CLASSROOM_DEVICE_FONT } from '../app/classroom-members.ts';
import { parseClassroomAction } from '../app/classroom-settings-action.ts';

test('only an explicit destination save is accepted; legacy requests, font edits and impersonation are rejected', () => {
  for (const value of [null, [], {seats:['b','a']}, {action:'save-settings',seat:'laptop',identityId:'b'}, {action:'save-settings',seat:'other'}, {action:'save-settings'}, {action:'request-seat-exchange'}, {action:'approve-seat-exchange',requestId:'old'}, {action:'font',font:'sans'}]) assert.equal(parseClassroomAction(value),null);
  for (const seat of ['tablet','laptop']) assert.deepEqual(parseClassroomAction({action:'save-settings',seat}),{action:'save-settings',seat});
});

test('selecting a destination places both members, repeated saves do not flip seats, and the design font is fixed', () => {
  const initial={members:[{id:'a',name:'甲'},{id:'b',name:'乙'}],seats:['a','b'],font:'sans',seatExchange:{id:'old'}};
  assert.deepEqual(classroomSettingsDraft(initial,'a'),{seat:'tablet'});
  assert.deepEqual(classroomSettingsDraft(initial,'b'),{seat:'laptop'});
  assert.deepEqual(classroomSettingsDraft(initial,'outside'),{seat:null});
  const destination={action:'save-settings',seat:'laptop'};
  const saved=applyClassroomAction(initial,'a',destination);
  assert.deepEqual(saved.seats,['b','a']);assert.equal(saved.font,CLASSROOM_DEVICE_FONT);
  assert.ok(!('seatExchange' in saved));assert.deepEqual(initial.seats,['a','b']);
  assert.deepEqual(applyClassroomAction(saved,'a',destination),saved);
  assert.deepEqual(applyClassroomAction(saved,'a',{action:'save-settings',seat:'tablet'}).seats,['a','b']);
  assert.throws(()=>applyClassroomAction(initial,'outside',destination),/座位成员/);
  assert.throws(()=>applyClassroomAction({...initial,seats:['a']},'a',destination),/另一位成员/);
  assert.throws(()=>applyClassroomAction(initial,'a',{action:'save-settings',seat:'invalid'}),/选项无效/);
});

test('seat saves survive reload and concurrent retries, preserve other user data and retire pending requests',async()=>{
  const originalData=process.env.DATA_DIR;
  const root=path.join(process.cwd(),'codex-generated','classroom-settings-tests');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'direct-'));process.env.DATA_DIR=directory;
  await writeFile(path.join(directory,'identities.json'),JSON.stringify({version:1,users:{a:{nickname:'甲',ticktickToken:'private-fixture'},b:{nickname:'乙'}},classroom:{seats:['a','b'],font:'sans',seatExchange:{id:'retired-request'}}}));
  const {updateUser,getUser,getClassroomProfile,updateClassroomProfile}=await import('../app/api/identity/store.ts');
  try {
    const initial=await getClassroomProfile();assert.equal(initial.font,CLASSROOM_DEVICE_FONT);assert.ok(!('seatExchange' in initial));
    const action={action:'save-settings',seat:'laptop'};
    await Promise.all([updateClassroomProfile('a',action),updateClassroomProfile('a',action),updateUser('a',current=>({...current,activity:'阅读',todoNote:'随手记',updatedAt:'two'}))]);
    let result=await getClassroomProfile();assert.deepEqual(result.seats,['b','a']);
    assert.equal(result.members.find(item=>item.id==='a').activity,'阅读');assert.equal(result.members.find(item=>item.id==='a').todoNote,'随手记');
    assert.ok(!JSON.stringify(result).includes('private-fixture'));
    const stored=JSON.parse(await readFile(path.join(directory,'identities.json'),'utf8'));assert.deepEqual(stored.classroom,{seats:['b','a']});
    const reloaded=await import('../app/api/identity/store.ts?direct-reload');assert.deepEqual((await reloaded.getClassroomProfile()).seats,['b','a']);
    await assert.rejects(updateClassroomProfile('outside',action));
    await assert.rejects(updateClassroomProfile('a',{action:'save-settings',seat:'invalid'}));
    // Two people asking for one destination are serialized: the last explicit save wins.
    await Promise.all([updateClassroomProfile('a',{action:'save-settings',seat:'tablet'}),updateClassroomProfile('b',{action:'save-settings',seat:'tablet'})]);
    result=await getClassroomProfile();assert.deepEqual(result.seats,['b','a']);
    assert.equal((await getUser('a')).ticktickToken,'private-fixture');
  }finally{if(originalData===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=originalData;}
});
