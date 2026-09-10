import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentMarkdown, attachmentPath, descriptionAttachments } from '../app/task-description-attachments.ts';
import { safeAccessReturn } from '../app/access-return.ts';

test('pasted file links retain Unicode filenames and login return destinations', () => {
  const file = 'tasks/task-1/unique/截图 (1).png';
  const markdown = attachmentMarkdown('https://study.11scat.xyz', '截图 (1).png', file);
  const parsed = descriptionAttachments(`任务说明\n\n${markdown}`);
  assert.equal(parsed.text, '任务说明');
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].path, file);
  assert.equal(parsed.attachments[0].name, '截图 (1).png');
  assert.equal(safeAccessReturn(parsed.attachments[0].url), parsed.attachments[0].url);
  assert.equal(descriptionAttachments('普通文字和 https://example.com').text, '普通文字和 https://example.com');
});

test('attachment previews stay on the local task-file route and reject traversal', () => {
  for (const value of ['tasks/../secret', 'tasks//file', 'other/file', 'tasks/a\\b', 'tasks/./file']) assert.equal(attachmentPath(value), false);
  assert.throws(() => attachmentMarkdown('https://study.11scat.xyz', 'bad', '../secret'));
  const malicious = '[附件：x](https://evil.test/task-attachment?path=tasks%2Fa%2Fb.pdf)';
  assert.equal(descriptionAttachments(malicious).attachments[0].url, '/task-attachment?path=tasks%2Fa%2Fb.pdf');
  assert.equal(descriptionAttachments('[附件：x](javascript:alert(1))').attachments.length, 0);
});
