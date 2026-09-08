import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { taskFields } from '../app/api/room/tasks/store.ts';

test('workflow detail offers settings to every member and direct completion only to original owner', async () => {
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/workflow-ui-')), output = path.join(dir, 'component.mjs');
  await build({ entryPoints: ['app/ClaimWorkflows.tsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', outfile: output, logLevel: 'silent' });
  const { ClaimWorkflows } = await import(pathToFileURL(output).href);
  const workflow = { id: 'workflow', title: '测试', reviewerId: 'alice', claimantId: 'bob', fields: taskFields({ title: '测试' }), status: 'working', events: [] };
  const render = (identityId, status = 'working', editPending = false) => renderToStaticMarkup(createElement(ClaimWorkflows, { initialId: workflow.id, busy: false, error: '', onClose() {}, onEdit() {}, perform() {}, snapshot: { identityId, members: ['alice', 'bob', 'charlie'].map(id => ({ id, name: id })), workflows: [{ ...workflow, status, editPending }] } }));
  for (const member of ['alice', 'bob', 'charlie']) for (const status of ['creating', 'working', 'submitted', 'rejected', 'approving', 'done']) {
    const html = render(member, status); assert.match(html, />详细设置<\/button>/);
    assert.equal(html.includes('直接完成'), member === 'alice' && status !== 'done');
  }
  assert.ok(render('bob').includes('提交完成')); assert.ok(!render('bob', 'working', true).includes('提交完成'));
  assert.ok(render('charlie', 'working', true).includes('核对并继续'));
});
