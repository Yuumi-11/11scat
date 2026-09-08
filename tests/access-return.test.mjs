import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAccessReturn } from '../app/access-return.ts';

test('login retains the requested diagnostic path while rejecting external destinations and login loops', () => {
  assert.equal(safeAccessReturn('/api/ticktick/diagnostics'), '/api/ticktick/diagnostics');
  assert.equal(safeAccessReturn('/?view=tasks'), '/?view=tasks');
  for (const value of [null, '', 'https://outside.example', '//outside.example', '/\\outside.example', '/access?next=/api', '/api/access', '/hello\nworld']) assert.equal(safeAccessReturn(value), '/');
});
