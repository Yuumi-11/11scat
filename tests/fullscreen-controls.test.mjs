import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullscreenShortcut, toggleElementFullscreen } from '../app/fullscreen-controls.ts';

const key = (patch = {}) => ({ key: 'f', composedPath: () => [], ...patch });
// DOM-shaped controls model focus, bubbled targets and shadow-host event paths.
const control = (tag) => ({ closest: selector => selector.split(', ').includes(tag) ? {} : null });

test('F toggles outside editors and never intercepts typing, IME, modifiers or held keys', () => {
  assert.equal(isFullscreenShortcut(key(), null), true);
  assert.equal(isFullscreenShortcut(key({ key: 'F', shiftKey: true }), null), true);
  assert.equal(isFullscreenShortcut(key({ key: 'g' }), null), false);
  for (const flag of ['ctrlKey', 'altKey', 'metaKey', 'repeat', 'isComposing', 'defaultPrevented']) {
    assert.equal(isFullscreenShortcut(key({ [flag]: true }), null), false, flag);
  }
  assert.equal(isFullscreenShortcut(key({ keyCode: 229 }), null), false);
  for (const editor of [control('textarea'), control('input'), control('select'), control('[role="textbox"]'), { isContentEditable: true }]) {
    assert.equal(isFullscreenShortcut(key({ target: editor }), null), false);
    assert.equal(isFullscreenShortcut(key(), editor), false);
    assert.equal(isFullscreenShortcut(key({ composedPath: () => [control('span'), editor] }), null), false);
  }
  assert.equal(isFullscreenShortcut(key({ target: control('button') }), control('button')), true);
});

test('fullscreen enters and exits the main element, leaves other viewers alone and propagates rejection', async () => {
  let requests = 0, exits = 0;
  const owner = { fullscreenElement: null, fullscreenEnabled: true, exitFullscreen: async () => { exits++; owner.fullscreenElement = null; } };
  const stage = { requestFullscreen: async () => { requests++; owner.fullscreenElement = stage; } };
  await toggleElementFullscreen(stage, owner);
  assert.equal(owner.fullscreenElement, stage);
  await toggleElementFullscreen(stage, owner);
  assert.equal(owner.fullscreenElement, null);
  owner.fullscreenElement = {};
  await toggleElementFullscreen(stage, owner);
  assert.equal(requests, 1);
  assert.equal(exits, 1);
  owner.fullscreenElement = null;
  await assert.rejects(toggleElementFullscreen({}, owner), /不支持/);
  await assert.rejects(toggleElementFullscreen(stage, { ...owner, fullscreenEnabled: false }), /不支持/);
  await assert.rejects(toggleElementFullscreen({ requestFullscreen: async () => { throw new Error('denied'); } }, owner), /denied/);
  assert.equal(owner.fullscreenElement, null);
});
