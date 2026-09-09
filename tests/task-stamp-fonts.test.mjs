import test from 'node:test';
import assert from 'node:assert/strict';

test('room entry loads both stamp fonts once and waits for both before revealing stamps', async () => {
  const original = globalThis.document;
  const requests = [];
  globalThis.document = { fonts: { load: font => new Promise(resolve => requests.push({ font, resolve })) } };
  try {
    const { loadTaskStampFonts } = await import('../app/task-stamp-fonts.ts?success');
    const pending = loadTaskStampFonts();
    assert.equal(requests.length, 2);
    assert.match(requests[0].font, /TaskStampLatin/);
    assert.match(requests[1].font, /TaskStampChinese/);
    assert.equal(loadTaskStampFonts(), pending, 'opening the board shares the room-entry download');
    let ready = false;
    pending.then(() => { ready = true; });
    requests[0].resolve([{}]);
    await Promise.resolve();
    assert.equal(ready, false, 'Latin finishing must not expose fallback Chinese');
    requests[1].resolve([{}]);
    await pending;
    assert.equal(ready, true);
    await loadTaskStampFonts();
    assert.equal(requests.length, 2, 'reopening reuses loaded fonts');
  } finally { globalThis.document = original; }
});

test('failed or missing stamp fonts remain unready and can retry on reopening', async () => {
  const original = globalThis.document;
  let mode = 'failure';
  globalThis.document = { fonts: { load: () => mode === 'failure' ? Promise.reject(new Error('offline')) : Promise.resolve(mode === 'missing' ? [] : [{}]) } };
  try {
    const { loadTaskStampFonts } = await import('../app/task-stamp-fonts.ts?retry');
    await assert.rejects(loadTaskStampFonts(), /offline/);
    mode = 'missing';
    await assert.rejects(loadTaskStampFonts(), /unavailable/);
    mode = 'success';
    await loadTaskStampFonts();
  } finally { globalThis.document = original; }
});
