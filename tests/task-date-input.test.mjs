import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInput, apiDate } from '../app/task-date-input.ts';

test('task editors retain Shanghai dates across UTC day boundaries and preserve empty/all-day fields', () => {
  assert.equal(dateInput(null, true), '');
  assert.equal(dateInput('2026-09-11T16:00:00Z', true), '2026-09-12');
  assert.equal(dateInput('2026-09-11T22:00:00Z', false), '2026-09-12T06:00');
  assert.equal(dateInput('2026-09-12T05:59:00+0800', false), '2026-09-12T05:59');
  assert.equal(apiDate('', true), null);
  assert.equal(apiDate('2026-09-12', true), '2026-09-12T00:00:00+0800');
  assert.equal(apiDate('2026-09-12', true, true), '2026-09-12T23:59:00+0800');
  assert.equal(apiDate('2026-09-12T06:00', false, true), '2026-09-12T06:00:00+0800');
});
