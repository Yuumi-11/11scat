import assert from 'node:assert/strict';
import test from 'node:test';
import { readTaskResponse, taskErrorMessage } from '../app/task-request.ts';

test('empty, truncated and non-object replies never confirm a successful request', async () => {
  for (const text of ['', '{"workflow":', '<html>gateway</html>', 'null', '[]']) {
    await assert.rejects(readTaskResponse(new Response(text), '未确认'), { message: '未确认' });
  }
  await assert.rejects(readTaskResponse(new Response(null, { status: 204 }), '未确认'), { message: '未确认' });
  const data = { workflow: { id: 'w', status: 'submitted' } };
  assert.deepEqual(await readTaskResponse(Response.json(data), '未确认'), data);
});

test('known operation failures remain readable without displaying parser internals', async () => {
  await assert.rejects(readTaskResponse(Response.json({ error: '当前账号不能审批' }, { status: 403 }), '未确认'), { message: '当前账号不能审批' });
  await assert.rejects(readTaskResponse(Response.json({ error: 'Unexpected end of JSON input' }, { status: 502 }), '未确认'), { message: '未确认' });
  assert.equal(taskErrorMessage('Unexpected end of JSON input'), '');
  assert.equal(taskErrorMessage(new SyntaxError('custom parse detail'), '失败'), '失败');
  assert.equal(taskErrorMessage('任务状态已变化'), '任务状态已变化');
});
