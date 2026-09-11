import test from 'node:test';
import assert from 'node:assert/strict';
import { fitBoardText, measureBoardText } from '../app/board-text-layout.mjs';
import { resizeTextGeometry } from '../app/board-text-geometry.ts';

const context = { font: '', measureText(value) { const size = parseFloat(this.font); return { width: Array.from(value).reduce((sum, char) => sum + (/[\x00-\x7f]/.test(char) ? .55 : 1), 0) * size, fontBoundingBoxAscent: size * .9, fontBoundingBoxDescent: size * .3, actualBoundingBoxDescent: size * .3 }; } };
const box = { text: 'test测试，你好呀！\n这是第二行文字', x: 100, y: 80, width: 400, height: 55, fontSize: 36, material: 'chalk-v1' };

test('text box grows for explicit and wrapped lines without changing font or wrapping width', () => {
  for (const text of [box.text, '连续输入的中文文字'.repeat(7), '第一行\n第二行\n']) {
    const fitted = fitBoardText(context, { ...box, text });
    const layout = measureBoardText(context, fitted);
    assert.equal(fitted.width, box.width); assert.equal(fitted.fontSize, box.fontSize);
    assert.ok(fitted.height > box.height);
    assert.ok(layout.padY + layout.baseline + (layout.lines.length - 1) * layout.lineHeight + box.fontSize * .3 <= fitted.height);
    assert.deepEqual(fitBoardText(context, fitted), fitted, 'repeated paints and reloads do not keep growing the box');
  }
});
test('horizontal glyph overflow grows width and bottom overflow moves the box within the board', () => {
  const fitted = fitBoardText(context, { ...box, x: 1120, y: 665, width: 80, fontSize: 96, text: '你\n好' });
  assert.ok(fitted.width > 80); assert.ok(fitted.x + fitted.width <= 1200); assert.ok(fitted.y + fitted.height <= 720);
  assert.equal(fitted.fontSize, 96);
});
test('narrowing a side reflows content and expands height instead of clipping it', () => {
  const fitted = fitBoardText(context, box);
  const narrow = fitBoardText(context, { ...fitted, ...resizeTextGeometry(fitted, 'e', -240, 0) });
  assert.equal(narrow.width, 160); assert.equal(narrow.fontSize, 36); assert.ok(narrow.height > fitted.height);
  const deleted = fitBoardText(context, { ...narrow, text: '短' });
  assert.equal(deleted.height, narrow.height, 'deleting text preserves the chosen box size');
});

test('long wrapped text expands sideways when it would exceed the board height', () => {
  const fitted = fitBoardText(context, { ...box, width: 80, fontSize: 64, text: '继续输入完整的文字'.repeat(8) });
  assert.ok(fitted.width > 80); assert.ok(fitted.height <= 720);
  assert.equal(fitted.fontSize, 64); assert.ok(fitted.y + fitted.height <= 720);
});
