import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentMarkdown, attachmentPath, descriptionAttachments, descriptionParts } from '../app/task-description-attachments.ts';
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

test('inline attachment parts preserve cursor position, surrounding whitespace and multiple files', () => {
  const first = attachmentMarkdown('https://study.11scat.xyz', '报告.pdf', 'tasks/a/b/报告.pdf');
  const second = attachmentMarkdown('https://study.11scat.xyz', '截图.png', 'tasks/a/c/截图.png');
  const content = `前文\n${first} 中间 ${second}\n后文`;
  const parts = descriptionParts(content);
  assert.deepEqual(parts.filter(part => 'text' in part).map(part => part.text), ['前文\n', ' 中间 ', '\n后文']);
  assert.deepEqual(parts.filter(part => 'file' in part).map(part => part.file.name), ['报告.pdf', '截图.png']);
  assert.equal(parts.map(part => 'text' in part ? part.text : part.markdown).join(''), content);
  assert.deepEqual(descriptionParts('  只有文字\n'), [{ text: '  只有文字\n' }]);
});

test('description image placeholders follow their position while keeping original attachment links', () => {
  const image = (name, path) => attachmentMarkdown('https://study.11scat.xyz', name, path);
  const content = `${image('hash.png', 'tasks/a/first.png')} ${image('原文件.pdf', 'tasks/a/report.pdf')} ${image('图9.jpeg', 'tasks/a/last.jpeg')}`;
  const parts = descriptionParts(content).filter(part => 'file' in part);
  assert.deepEqual(parts.map(part => part.label), ['[图1.png]', '[原文件.pdf]', '[图2.jpeg]']);
  assert.deepEqual(parts.map(part => part.file.name), ['hash.png', '原文件.pdf', '图9.jpeg']);
  const before = descriptionParts(image('inserted.webp', 'tasks/a/new.webp') + content).filter(part => 'file' in part);
  assert.deepEqual(before.map(part => part.label), ['[图1.webp]', '[图2.png]', '[原文件.pdf]', '[图3.jpeg]']);
});
