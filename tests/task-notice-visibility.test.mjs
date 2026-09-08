import test from 'node:test';
import assert from 'node:assert/strict';
import { watchNoticeVisibility } from '../app/task-notice-visibility.ts';

test('notice browsing requires full visibility and dwell, stops in background, and acknowledges once', () => {
  const previous = Object.fromEntries(['document', 'IntersectionObserver', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
  let callback, listener, nextId = 0, reads = 0, disconnected = false;
  const timers = new Map();
  globalThis.document = { hidden: false, addEventListener: (_name, fn) => { listener = fn; }, removeEventListener: () => { listener = null; } };
  globalThis.IntersectionObserver = class { constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected = true; } };
  globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 1200); timers.set(++nextId, fn); return nextId; };
  globalThis.clearTimeout = id => timers.delete(id);
  const enter = ratio => callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  const elapse = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  try {
    const stop = watchNoticeVisibility({}, () => { reads++; });
    enter(0); elapse(); enter(.2); elapse(); assert.equal(reads, 0);
    enter(1); enter(0); elapse(); assert.equal(reads, 0, 'fast scrolling does not mark read');
    enter(1); document.hidden = true; listener(); elapse(); assert.equal(reads, 0);
    document.hidden = false; listener(); elapse(); assert.equal(reads, 1);
    enter(0); enter(1); elapse(); assert.equal(reads, 1, 'visibility changes do not repeat acknowledgement');
    stop(); assert.equal(disconnected, true); assert.equal(listener, null); assert.equal(timers.size, 0);
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
