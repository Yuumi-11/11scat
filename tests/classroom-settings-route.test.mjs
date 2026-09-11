import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import * as nodeModule from 'node:module';
import path from 'node:path';

test('settings handlers authenticate the saver, reject obsolete actions and atomically save both seat positions', { skip: typeof nodeModule.registerHooks !== 'function' ? 'Node 22.15+ supplies the isolated route loader' : false }, async () => {
  const originalData=process.env.DATA_DIR;
  const originalIdentity=globalThis.classroomSettingsTestIdentity;
  const root=path.resolve('codex-generated/classroom-settings-tests');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'route-'));process.env.DATA_DIR=directory;
  await writeFile(path.join(directory,'identities.json'),JSON.stringify({version:1,users:{a:{nickname:'甲'},b:{nickname:'乙'}}}));
  const hooks=nodeModule.registerHooks({resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/app/api/room/classroom/route.ts')) {
      if(specifier==='../../identity/session')return {url:'data:text/javascript,export async function currentIdentityId(){return globalThis.classroomSettingsTestIdentity;}',shortCircuit:true};
      if(specifier==='../../identity/store')return next('../../identity/store.ts?route-test',context);
      if(specifier==='../../../classroom-settings-action')return next('../../../classroom-settings-action.ts',context);
      if(specifier==='next/server')return next('next/server.js',context);
    }
    return next(specifier,context);
  }});
  try {
    const {GET,PATCH}=await import('../app/api/room/classroom/route.ts');
    const call=(actor,body,origin='https://study.example',raw=false)=>{
      globalThis.classroomSettingsTestIdentity=actor;
      return PATCH(new Request('http://localhost:3000/api/room/classroom',{method:'PATCH',headers:{Host:'study.example',Origin:origin,'Content-Type':'application/json'},body:raw?body:JSON.stringify(body)}));
    };
    const save={action:'save-settings',seat:'laptop'};
    assert.equal((await call('',save)).status,401);
    assert.equal((await call('unknown',save)).status,401);
    assert.equal((await call('a',save,'https://foreign.example')).status,403);
    assert.equal((await call('a',save,'null')).status,403);
    assert.equal((await call('a','{','https://study.example',true)).status,400);
    assert.equal((await call('a',{seats:['b','a'],font:'sans'})).status,400);
    assert.equal((await call('a',{action:'request-seat-exchange',identityId:'b'})).status,400);
    assert.equal((await call('a',{action:'request-seat-exchange'})).status,400);
    assert.equal((await call('a',{action:'approve-seat-exchange',requestId:'old'})).status,400);
    assert.equal((await call('a',{action:'font',font:'sans'})).status,400);
    assert.equal((await call('a',{...save,identityId:'b'})).status,400);
    let response=await call('a',save);assert.equal(response.status,200);
    assert.deepEqual((await response.json()).seats,['b','a']);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    response=await call('a',save);assert.equal(response.status,200);
    assert.deepEqual((await response.json()).seats,['b','a']);
    response=await call('b',{action:'save-settings',seat:'laptop'});assert.equal(response.status,200);
    assert.deepEqual((await response.json()).seats,['a','b']);
    globalThis.classroomSettingsTestIdentity='a';const profile=await (await GET()).json();
    assert.deepEqual(profile.seats,['a','b']);assert.ok(!('seatExchange' in profile));assert.equal(profile.font,'resource-rounded');
  } finally {
    hooks.deregister();globalThis.classroomSettingsTestIdentity=originalIdentity;
    if(originalData===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=originalData;
  }
});
