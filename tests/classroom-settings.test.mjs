import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
test('shared seating persists through concurrent profile updates and rejects duplicate or foreign identities',async()=>{
  const root=path.join(process.cwd(),'codex-generated','classroom-settings-tests');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'case-'));process.env.DATA_DIR=directory;
  assert.ok(path.resolve(directory).startsWith(path.resolve(root)+path.sep));
  const {updateUser,getUser,getClassroomProfile,updateClassroomProfile}=await import('../app/api/identity/store.ts');
  try {
    await updateUser('a',()=>({nickname:'甲',ticktickToken:'private-fixture',updatedAt:'one'}));
    await updateUser('b',()=>({nickname:'乙',updatedAt:'one'}));
    assert.deepEqual((await getClassroomProfile()).seats,['a','b']);
    await Promise.all([updateClassroomProfile(['b','a'],'rounded'),updateUser('a',current=>({...current,activity:'阅读',updatedAt:'two'}))]);
    const result=await getClassroomProfile();assert.deepEqual(result.seats,['b','a']);assert.equal(result.font,'rounded');
    assert.equal(result.members.find(item=>item.id==='a').activity,'阅读');assert.ok(!JSON.stringify(result).includes('private-fixture'));
    await assert.rejects(updateClassroomProfile(['a','a'],'sans'));
    await assert.rejects(updateClassroomProfile(['a','outside'],'sans'));
    await assert.rejects(updateClassroomProfile(['a','b'],'untrusted-font'));
    assert.deepEqual((await getClassroomProfile()).seats,['b','a']);assert.equal((await getUser('a')).ticktickToken,'private-fixture');
  }finally{await rm(directory,{recursive:true,force:true});}
});
