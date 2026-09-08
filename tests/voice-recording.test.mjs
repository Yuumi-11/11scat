import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceRecording, microphoneError } from '../app/voice-recording.ts';

function fixture({ support = ['audio/mp4'], permission, failConstruction = false, empty = false } = {}) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), previousRecorder = globalThis.MediaRecorder;
  const files = [], errors = [], states = [], recorders = [], track = { stopped: false, stop() { this.stopped = true; } }, stream = { getTracks: () => [track] };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => permission ? permission() : stream } } });
  class Recorder {
    static isTypeSupported(type) { return support.includes(type); }
    constructor(_stream, options) { if (failConstruction) throw new Error('unsupported'); this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { assert.equal(this.state, 'recording'); this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable({ data: new Blob(empty ? [] : ['actual audio bytes'], { type: this.mimeType }) }); this.onstop(); }); }
  }
  globalThis.MediaRecorder = Recorder;
  const session = new VoiceRecording({ recorded: file => files.push(file), error: error => errors.push(error), state: state => states.push(state) });
  const restore = () => { session.dispose(); if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator; if (previousRecorder === undefined) delete globalThis.MediaRecorder; else globalThis.MediaRecorder = previousRecorder; };
  return { session, files, errors, states, track, recorders, stream, restore };
}
const drain = () => new Promise(resolve => setImmediate(resolve));

test('stop emits complete recording once, prefers mobile AAC and releases microphone', async () => {
  const f = fixture({ support: ['audio/mp4', 'audio/webm;codecs=opus'] });
  try { await f.session.start(); f.session.stop(); f.session.stop(); await drain(); assert.equal(f.files.length, 1); assert.match(f.files[0].name, /\.m4a$/); assert.equal(f.files[0].type, 'audio/mp4'); assert.equal(await f.files[0].text(), 'actual audio bytes'); assert.ok(f.track.stopped); assert.equal(f.states.at(-1).phase, 'idle'); } finally { f.restore(); }
});
test('delete discards final chunk and cannot be reversed by a second stop tap', async () => {
  const f = fixture(); try { await f.session.start(); f.session.stop(true); f.session.stop(); await drain(); assert.equal(f.files.length, 0); assert.ok(f.track.stopped); } finally { f.restore(); }
});
test('unsupported AAC falls back to actual browser format without mislabelling extension', async () => {
  const f = fixture({ support: ['audio/webm;codecs=opus'] }); try { await f.session.start(); f.session.stop(); await drain(); assert.equal(f.files[0].type, 'audio/webm;codecs=opus'); assert.match(f.files[0].name, /\.webm$/); } finally { f.restore(); }
});
test('unmount while permission is pending releases late stream and never sends', async () => {
  let resolve; const permission = new Promise(done => { resolve = done; }); const f = fixture({ permission: () => permission });
  try { const start = f.session.start(); f.session.dispose(); resolve(f.stream); await start; assert.ok(f.track.stopped); assert.equal(f.files.length, 0); assert.equal(f.recorders.length, 0); } finally { f.restore(); }
});
test('unmount while recording discards and repeated start cannot create parallel recorders', async () => {
  const f = fixture(); try { await Promise.all([f.session.start(), f.session.start()]); assert.equal(f.recorders.length, 1); f.session.dispose(); await drain(); assert.equal(f.files.length, 0); assert.ok(f.track.stopped); } finally { f.restore(); }
});
test('recorder errors and empty recordings are not sent', async () => {
  for (const empty of [true, false]) { const f = fixture({ empty }); try { await f.session.start(); if (empty) f.session.stop(); else f.recorders[0].onerror(); await drain(); assert.equal(f.files.length, 0); assert.ok(f.errors.at(-1)); assert.ok(f.track.stopped); } finally { f.restore(); } }
});
test('construction failure releases microphone and permission failure gives an actionable message', async () => {
  const f = fixture({ failConstruction: true }); try { await f.session.start(); assert.ok(f.track.stopped); assert.equal(f.states.at(-1).phase, 'idle'); } finally { f.restore(); }
  assert.match(microphoneError(new DOMException('denied', 'NotAllowedError')), /权限/);
  assert.match(microphoneError(new DOMException('missing', 'NotFoundError')), /没有找到/);
});
