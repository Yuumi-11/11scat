import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import * as nodeModule from 'node:module';
import path from 'node:path';

test('settings handlers authenticate actor, reject direct seat edits and cross-site requests, and return recipient approval', { skip: typeof nodeModule.registerHooks !== 'function' ? 'Node 22.15+ supplies the isolated route loader' : false }, async () => {
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
    assert.equal((await call('',{action:'request-seat-exchange'})).status,401);
    assert.equal((await call('unknown',{action:'request-seat-exchange'})).status,401);
    assert.equal((await call('a',{action:'request-seat-exchange'},'https://foreign.example')).status,403);
    assert.equal((await call('a',{action:'request-seat-exchange'},'null')).status,403);
    assert.equal((await call('a','{','https://study.example',true)).status,400);
    assert.equal((await call('a',{seats:['b','a'],font:'sans'})).status,400);
    assert.equal((await call('a',{action:'request-seat-exchange',identityId:'b'})).status,400);
    let response=await call('a',{action:'request-seat-exchange'});assert.equal(response.status,200);
    const pending=await response.json();assert.deepEqual(pending.seats,['a','b']);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal((await call('a',{action:'approve-seat-exchange',requestId:pending.seatExchange.id})).status,400);
    response=await call('b',{action:'approve-seat-exchange',requestId:pending.seatExchange.id});assert.equal(response.status,200);
    assert.deepEqual((await response.json()).seats,['b','a']);
    assert.equal((await call('b',{action:'approve-seat-exchange',requestId:pending.seatExchange.id})).status,400);
    globalThis.classroomSettingsTestIdentity='a';const profile=await (await GET()).json();
    assert.deepEqual(profile.seats,['b','a']);assert.equal(profile.seatExchange,null);
  } finally {
    hooks.deregister();globalThis.classroomSettingsTestIdentity=originalIdentity;
    if(originalData===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=originalData;
  }
});
