import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentDisplayNames, imageAttachmentType, pastedAttachmentName, insertAttachmentPlaceholders } from '../app/task-attachment-labels.ts';

test('image numbering ignores documents and preserves filename extensions and existing references', () => {
  const files = [{ name: '8fa180.PNG' }, { name: '报告.pdf' }, { name: '截图.jpeg' }, { name: '图7.webp' }];
  assert.deepEqual(attachmentDisplayNames(files), ['图1.png', '报告.pdf', '图2.jpeg', '图3.webp']);
  assert.deepEqual(attachmentDisplayNames(files, true), ['图1.png', '报告.pdf', '图2.jpeg', '图7.webp']);
  assert.equal(pastedAttachmentName({ name: 'image', type: 'image/png' }, files), '图8.png');
  assert.equal(pastedAttachmentName({ name: '报告.xlsx', type: '' }, files), '报告.xlsx');
  assert.equal(pastedAttachmentName({ name: 'paste.JPG', type: 'image/jpeg' }, []), '图1.jpg');
  assert.equal(imageAttachmentType('old-file.JPEG'), 'image/jpeg');
  assert.equal(imageAttachmentType('说明.html'), null);
});

test('pasted attachments replace only the selection and leave the cursor after the placeholders', () => {
  const content = '前文选中后文';
  const result = insertAttachmentPlaceholders(content, 2, 4, ['图1.png', '证明.pdf']);
  assert.equal(result.value, '前文[图1.png] [证明.pdf]后文');
  assert.equal(result.value.slice(result.cursor), '后文');
  assert.equal(insertAttachmentPlaceholders('前后', 1, 1, ['图2.webp']).value, '前[图2.webp]后');
});
