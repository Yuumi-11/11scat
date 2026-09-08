import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicTaskNotice } from '../app/public-task-notice.ts';

function fixture() {
  const values = new Map();
  const storage = () => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  return { storage, tracker: member => createPublicTaskNotice(storage, member) };
}

test('historical tasks form the baseline; only unseen additions show until actually viewed', () => {
  const f = fixture(), t = f.tracker('alice');
  assert.equal(t.observe(['old']), 0);
  assert.equal(t.observe(['old','new']), 1);
  assert.equal(t.observe(['old','new']), 1, 'polling or unsuccessful opening must not mark read');
  assert.equal(t.observe(['old','new'], true), 0);
  assert.equal(t.observe(['old','new']), 0);
  assert.equal(t.observe(['old','new','live'], true), 0, 'new tasks rendered in the visible board are read');
});

test('same-count replacement is new; edits, removal, and reappearance of seen IDs are not', () => {
  const t = fixture().tracker('alice');
  t.observe(['a','b']);
  assert.equal(t.observe(['a','c']), 1);
  assert.equal(t.observe(['a']), 0);
  assert.equal(t.observe(['a','b']), 0);
  assert.equal(t.observe(['a','c','c']), 1);
});

test('read state survives reloads, merges between tabs, and is isolated by member', () => {
  const f = fixture(), a = f.tracker('alice');
  a.observe(['old']);
  assert.equal(a.observe(['old','new']), 1);
  const second = f.tracker('alice');
  assert.equal(second.observe(['old','new']), 1);
  second.observe(['old','new'], true);
  assert.equal(a.observe(['old','new']), 0);
  assert.equal(f.tracker('alice').observe(['old','new']), 0);
  const bob = f.tracker('bob');
  assert.equal(bob.observe(['old','new']), 0);
  assert.equal(bob.observe(['old','new','later']), 1);
  a.observe(['old','new','later'], true);
  assert.equal(bob.observe(['old','new','later']), 1);
});

test('blocked or malformed storage retains in-session notice behavior', () => {
  for (const storage of [() => { throw new Error('blocked'); }, () => ({getItem: () => '{broken',setItem: () => {}})]) {
    const t = createPublicTaskNotice(storage,'alice');
    assert.equal(t.observe([]),0);
    assert.equal(t.observe(['new']),1);
    assert.equal(t.observe(['new'],true),0);
    assert.equal(t.observe(['new']),0);
  }
});
