import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBoard, INITIAL_BOARD_EPOCH } from '../app/board-state.ts';
import { encodeRoomPackets, createPacketReceiver } from '../app/room-packets.ts';

const board = () => ({ id: crypto.randomUUID(), name: 'board', epoch: INITIAL_BOARD_EPOCH, strokes: [], texts: [], deletedStrokeIds: [], deletedTextIds: [], createdAt: 1 });
const stroke = (id, revision, count = 1) => ({ id, revision, createdAt: 1, color: '#000000', width: 6, points: Array.from({ length: count }, (_, i) => ({ x: i % 1200, y: i % 720 })) });
test('concurrent strokes converge across duplicate and reversed snapshots', () => {
  const initial = board();
  const left = { ...initial, strokes: [stroke('a', '001')] };
  const right = { ...initial, strokes: [stroke('b', '001'), stroke('a', '002', 10)] };
  const merged = mergeBoard(left, right);
  assert.deepEqual(merged, mergeBoard(right, left));
  assert.deepEqual(mergeBoard(merged, left), merged);
  assert.equal(merged.strokes.find((s) => s.id === 'a').points.length, 10);
});
test('erasures and newer clears survive stale peers', () => {
  const initial = { ...board(), strokes: [stroke('a', '001'), stroke('eraser', '002')] };
  const erased = { ...initial, strokes: [], deletedStrokeIds: ['a', 'eraser'] };
  assert.equal(mergeBoard(erased, initial).strokes.length, 0);
  const cleared = { ...board(), id: initial.id, epoch: '9999999999999:clear' };
  assert.deepEqual(mergeBoard(cleared, initial), cleared);
});
test('large Unicode snapshots fit transport packets and reassemble out of order', () => {
  const source = { type: 'board-snapshot', boards: [{ ...board(), name: '中文画板🐱', strokes: [stroke('long', '001', 10000)] }] };
  const packets = encodeRoomPackets(source);
  assert.ok(packets.length > 1);
  assert.ok(packets.every((p) => new TextEncoder().encode(JSON.stringify(p)).length < 15000));
  const receive = createPacketReceiver();
  assert.equal(receive(packets.at(-1)), null);
  let complete;
  for (const packet of packets.toReversed()) complete = receive(packet) || complete;
  assert.deepEqual(complete, source);
});
