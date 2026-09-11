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
  const { ClaimWorkflows, WorkflowList } = await import(pathToFileURL(output).href);
  const workflow = { id: 'workflow', title: '测试', reviewerId: 'alice', claimantId: 'bob', fields: taskFields({ title: '测试' }), status: 'working', events: [] };
  const render = (identityId, status = 'working', editPending = false) => renderToStaticMarkup(createElement(ClaimWorkflows, { initialId: workflow.id, busy: false, error: '', onClose() {}, onEdit() {}, perform() {}, snapshot: { identityId, members: ['alice', 'bob', 'charlie'].map(id => ({ id, name: id })), workflows: [{ ...workflow, status, editPending }] } }));
  for (const member of ['alice', 'bob', 'charlie']) for (const status of ['creating', 'working', 'submitted', 'rejected', 'approving', 'done', 'deleted']) {
    const html = render(member, status); assert.match(html, /<form[^>]+aria-label="详细设置"/); assert.ok(!html.includes(">详细设置</button>"));
    assert.equal(html.includes('直接完成'), member === 'alice' && !['done','deleted'].includes(status));
    const settings = html.match(/<form[^>]+aria-label="详细设置"[\s\S]*?<\/form>/)[0];
    assert.equal(settings.includes('aria-label="删除任务"'), member !== 'charlie' && status !== 'deleted');
    if(status==='deleted') assert.match(settings, /disabled/);
  }
  assert.ok(render('bob').includes('提交完成')); assert.ok(!render('bob', 'working', true).includes('提交完成'));
  assert.ok(!render('charlie', 'working', true).includes('核对并继续')); assert.ok(render('charlie', 'working', true).includes('正在同步任务'));
  const workflows = [{ ...workflow, id: 'mine', title: '我认领的事项' }, { ...workflow, id: 'theirs', title: '他人认领的事项', claimantId: 'alice', reviewerId: 'bob' }, { ...workflow, id: 'done', title: '归档事项示例', status: 'done' }, { ...workflow, id:'deleted',title:'已删除归档示例',status:'deleted' }];
  const overview = archived => renderToStaticMarkup(createElement(WorkflowList, { workflows, archived, setArchived() {}, select() {}, name: id => id }));
  const active = overview(false); assert.ok(active.includes('我认领的事项')); assert.ok(active.includes('他人认领的事项')); assert.ok(!active.includes('归档事项示例')); assert.ok(active.includes('已归档'));
  assert.ok(!active.includes('已删除归档示例')); const archive = overview(true); assert.ok(archive.includes('已删除归档示例')); assert.ok(archive.includes('归档事项示例')); assert.ok(!archive.includes('我认领的事项')); assert.ok(!archive.includes('他人认领的事项')); assert.ok(archive.includes('未完成流程'));
  const notices = [{ id: 'nudge-notice', workflowId: 'theirs', eventType: 'nudge' }, { id: 'done-notice', workflowId: 'done', eventType: 'completed' }];
  const withNotices = renderToStaticMarkup(createElement(WorkflowList, { workflows, notices, archived: false, setArchived() {}, select() {}, name: id => id }));
  assert.ok(withNotices.indexOf('他人认领的事项') < withNotices.indexOf('我认领的事项'), 'unread workflow is temporarily first');
  assert.match(withNotices, /1 条归档新记录/); assert.match(withNotices, /task-notice-dot/);
  assert.match(withNotices, /coop-workflow-status has-update">有更新/);
  assert.ok(!overview(false).includes('有更新'), 'read workflow returns to its actual status');
  assert.ok(!overview(false).includes('task-notice-dot'), 'read acknowledgements remove dots and unread sorting');
  const ordered = renderToStaticMarkup(createElement(WorkflowList, { workflows: [...workflows, { ...workflow, id: 'review', title: '优先审批事项', status: 'submitted', createdAt: 1 }], notices, archived: false, setArchived() {}, select() {}, name: id => id }));
  assert.ok(ordered.indexOf('优先审批事项') < ordered.indexOf('他人认领的事项'), 'pending review outranks unread working tasks');
  workflow.events = ['claimed', 'submit', 'approve', 'completed'].map((type, index) => ({ id: String(index), actorId: 'bob', type, at: 1700000000000, comment: type === 'completed' ? '不可显示的后台完成说明' : '', files: [] }));
  const history = render('alice', 'done');
  assert.ok(!history.includes('安排认领')); assert.ok(!history.includes('完成同步')); assert.ok(!history.includes('不可显示的后台完成说明'));
  assert.ok(history.includes('bob · 认领')); assert.ok(history.includes('提交完成')); assert.ok(history.includes('审批通过'));
  assert.ok(render('bob').includes('aria-label="删除任务"')); assert.ok(render('alice').includes('aria-label="删除任务"'));
  assert.ok(render('alice').includes('>催办</button>')); assert.ok(!render('bob').includes('>催办</button>'));
  workflow.fields.content = '前文 [附件：报告.pdf](https://study.11scat.xyz/task-attachment?path=tasks%2Fa%2Fb.pdf) 后文';
  const attachmentHtml = render('alice');
  assert.match(attachmentHtml, /前文 <a[^>]+>报告.pdf<\/a> 后文/);
  assert.match(attachmentHtml, /aria-label="任务附件"/);
  assert.ok(!attachmentHtml.includes('[附件：报告.pdf]'), 'raw Markdown is not shown in the description');
  assert.ok(!attachmentHtml.includes('target="_blank"'), 'task attachment clicks stay in the current page');
  workflow.events.push({ id: 'old-attachment-change', actorId: 'alice', type: 'updated', at: 1700000000000, comment: `说明：无 → ${workflow.fields.content}`, files: [] });
  assert.ok(render('alice').includes('说明：无 → 前文 报告.pdf 后文'));
  workflow.fields.content = '';
  workflow.taskAnomaly = true;
  for (const member of ['alice', 'bob', 'charlie']) {
    const html = render(member, 'submitted');
    assert.equal(html.includes('恢复任务</button>'), member !== 'charlie');
    assert.ok(html.includes('保留当前待审批进度和已提交材料'));
    assert.ok(!html.includes('>通过</button>')); assert.ok(!html.includes('>提交完成</button>'));
  }
});
