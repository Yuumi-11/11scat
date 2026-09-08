import test from 'node:test';
import assert from 'node:assert/strict';
import { playVoice, releaseVoice } from '../app/voice-playback-controller.ts';

test('latest voice tap pauses previous voice before starting, including pending playback', async () => {
  const events = [];
  let rejectPending;
  const first = { play: () => { events.push('first:play'); return new Promise((_, reject) => { rejectPending = reject; }); }, pause: () => { events.push('first:pause'); rejectPending?.(new DOMException('Cancelled', 'AbortError')); } };
  const second = { play: async () => { events.push('second:play'); }, pause: () => { events.push('second:pause'); } };
  const pending = playVoice(first);
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  await playVoice(second);
  await cancelled;
  assert.deepEqual(events, ['first:play', 'first:pause', 'second:play']);
  releaseVoice(first); // Unmounting an old message must not clear the active one.
  events.length = 0;
  const third = { play: async () => events.push('third:play'), pause: () => events.push('third:pause') };
  await playVoice(third);
  assert.deepEqual(events, ['second:pause', 'third:play']);
  releaseVoice(third);
});
