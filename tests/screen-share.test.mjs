import test from 'node:test';
import assert from 'node:assert/strict';
import { requestScreenShare } from '../app/screen-share.ts';

const track = (kind, readyState = 'live') => ({ kind, readyState, stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; } });
const stream = tracks => ({ getTracks: () => tracks, getVideoTracks: () => tracks.filter(item => item.kind === 'video'), getAudioTracks: () => tracks.filter(item => item.kind === 'audio') });

test('screen click invokes the browser picker immediately and accepts a video-only choice', async () => {
  const chosen = stream([track('video')]);
  let calls = 0;
  const pending = requestScreenShare({ getDisplayMedia(options) {
    calls++;
    assert.equal(options.audio, true, 'the browser should offer its audio choice');
    return Promise.resolve(chosen);
  } });
  assert.equal(calls, 1, 'no asynchronous preflight may lose the click gesture');
  assert.equal(await pending, chosen);
  assert.equal(chosen.getTracks()[0].stopped, false);
});

test('browser-authorized audio remains attached to the returned screen stream', async () => {
  const audio = track('audio'), chosen = stream([track('video'), audio]);
  const result = await requestScreenShare({ getDisplayMedia: async () => chosen });
  assert.deepEqual(result.getAudioTracks(), [audio]);
  assert.ok(result.getTracks().every(item => !item.stopped));
});

test('a rejected or cancelled picker is not automatically retried', async () => {
  const denied = new DOMException('Cancelled', 'NotAllowedError');
  let calls = 0;
  await assert.rejects(requestScreenShare({ getDisplayMedia: async () => { calls++; throw denied; } }), error => error === denied);
  assert.equal(calls, 1);
});

test('a missing live screen track releases every acquired track', async () => {
  for (const tracks of [[track('audio')], [track('video', 'ended'), track('audio')]]) {
    await assert.rejects(requestScreenShare({ getDisplayMedia: async () => stream(tracks) }), /没有取得共享画面/);
    assert.ok(tracks.every(item => item.stopped));
  }
});
