import test from 'node:test';
import assert from 'node:assert/strict';
import { clipboardFiles, cloudDropPath, nextFolderName, uploadCloudFiles, deleteCloudItems } from '../app/cloud-drive-actions.ts';

test('clipboard files are not duplicated and drop destinations only use visible child folders', () => {
  const first = new File(['image'], '截图.png', { type: 'image/png' });
  const second = new File(['notes'], '笔记.txt');
  const entries = [{ kind: 'file', getAsFile: () => first }, { kind: 'string', getAsFile: () => null }, { kind: 'file', getAsFile: () => second }];
  assert.deepEqual(clipboardFiles({ files: [first, second], items: entries }), [first, second]);
  assert.deepEqual(clipboardFiles({ files: [], items: entries }), [first, second]);
  assert.deepEqual(clipboardFiles({ files: [], items: [entries[1]] }), []);
  const items = [{ kind: 'folder', path: '学习/图论', name: '图论' }, { kind: 'file', path: '学习/笔记.txt', name: '笔记.txt' }];
  assert.equal(cloudDropPath('学习', '学习/图论', items), '学习/图论');
  for (const hovered of [undefined, '学习/笔记.txt', '其他目录', '../']) assert.equal(cloudDropPath('学习', hovered, items), '学习');
  assert.equal(cloudDropPath('', undefined, []), '');
  assert.equal(nextFolderName([{ name: '新建文件夹' }, { name: '新建文件夹 (1)' }]), '新建文件夹 (2)');
});

test('multi-file uploads retain their drop destination and report partial failure without skipping later files', async () => {
  const files = ['甲.txt', '乙.png', '丙.pdf'].map(name => new File([name], name, { type: 'application/octet-stream' }));
  const original = globalThis.fetch, requests = [], progress = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json(requests.length === 2 ? { error: '空间不足' } : { item: {} }, { status: requests.length === 2 ? 507 : 201 });
  };
  try {
    const result = await uploadCloudFiles(files, '学习/图论', (...value) => progress.push(value));
    assert.equal(requests.length, 3);
    requests.forEach((request, index) => {
      assert.equal(new URL(request.url, 'https://example.test').searchParams.get('path'), '学习/图论');
      assert.equal(request.options.body, files[index]);
      assert.equal(decodeURIComponent(request.options.headers['X-File-Name']), files[index].name);
    });
    assert.deepEqual(result.succeeded, [files[0], files[2]]);
    assert.deepEqual(result.failed, [{ item: files[1], message: '空间不足' }]);
    assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  } finally { globalThis.fetch = original; }
});

test('batch deletion sends only selected paths and keeps failed items available for retry', async () => {
  const selected = [{ path: 'board', name: 'board', kind: 'folder' }, { path: 'chat/笔记.txt', name: '笔记.txt', kind: 'file' }];
  const original = globalThis.fetch, bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 2) throw new Error('连接中断');
    return Response.json({ deleted: true });
  };
  try {
    const result = await deleteCloudItems(selected, () => {});
    assert.deepEqual(bodies, selected.map(item => ({ path: item.path, confirmed: true })));
    assert.deepEqual(result.succeeded, [selected[0]]);
    assert.deepEqual(result.failed.map(failure => failure.item), [selected[1]]);
  } finally { globalThis.fetch = original; }
});
