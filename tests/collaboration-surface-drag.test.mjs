import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the component's actual pointer handlers with controlled capture and hit testing.
const source = readFileSync('app/RoomCollaboration.tsx', 'utf8');
const tree = ts.createSourceFile('RoomCollaboration.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = [], names = ['startDrag', 'lostDrag', 'pointerMove', 'finishDrag'];
let surface;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) handlers.push(node.getText(tree));
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === 'article') surface = node.attributes.properties.find(prop => prop.name?.getText(tree) === 'onPointerDown').initializer.expression.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
const code = ts.transpileModule(`${handlers.join('\n')}\nreturn {${names.join(',')}, surfaceDown: ${surface}};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(enabled = true) {
  const drag = { current: null }, ghosts = [], drops = [], task = { id: 'task' };
  class Target { constructor(interactive = false) { this.interactive = interactive; } closest() { return this.interactive ? this : null; } }
  const handle = { captured: null, closest: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 200 }) }), setPointerCapture(id) { this.captured = id; }, hasPointerCapture(id) { return this.captured === id; }, releasePointerCapture() { this.captured = null; } };
  const document = { elementFromPoint: () => ({ closest: selector => selector === '[data-coop-owner]' ? { dataset: { coopOwner: 'bob' } } : null }) };
  const api = new Function('drag', 'setKeyboardDrag', 'setGhost', 'setHoverOwner', 'membersPane', 'canDrop', 'move', 'document', 'Element', 'surfaceDraggable', 'task', code)(drag, () => {}, value => ghosts.push(value), () => {}, { current: null }, () => true, (...args) => drops.push(args), document, Target, enabled, task);
  const event = (extra = {}) => ({ currentTarget: handle, target: new Target(), button: 0, isPrimary: true, pointerId: 1, clientX: 30, clientY: 40, preventDefault() {}, ...extra });
  return { api, drag, ghosts, drops, handle, event, Target };
}
test('card surface drag shares the pin threshold, offset, pointer capture and one drop', () => {
  for (const start of ['surfaceDown', 'startDrag']) {
    const f = fixture(); f.api[start](f.event(), { id: 'task' });
    assert.equal(f.handle.captured, 1);
    f.api.pointerMove(f.event({ clientX: 34 })); assert.equal(f.ghosts.length, 0);
    f.api.pointerMove(f.event({ clientX: 50, clientY: 70 }));
    assert.deepEqual(f.ghosts.at(-1), { x: 30, y: 50, task: { id: 'task' }, width: 200 });
    f.api.finishDrag(f.event()); f.api.finishDrag(f.event());
    assert.equal(f.drops.length, 1); assert.equal(f.drops[0][1], 'bob'); assert.equal(f.handle.captured, null);
  }
});
test('interactive descendants and locked card surfaces never capture a pointer', () => {
  const f = fixture(); f.api.surfaceDown(f.event({ target: new f.Target(true) })); assert.equal(f.drag.current, null);
  const locked = fixture(false); locked.api.surfaceDown(locked.event()); assert.equal(locked.drag.current, null);
  f.api.surfaceDown(f.event({ button: 2 })); f.api.surfaceDown(f.event({ isPrimary: false })); assert.equal(f.drag.current, null);
});
test('bubbled events and a second finger cannot move or end an active gesture', () => {
  const f = fixture(); f.api.surfaceDown(f.event());
  for (const extra of [{ currentTarget: {} }, { pointerId: 2 }]) {
    f.api.pointerMove(f.event({ ...extra, clientX: 80 })); f.api.finishDrag(f.event(extra)); f.api.lostDrag(f.event(extra));
    assert.ok(f.drag.current); assert.equal(f.ghosts.length, 0); assert.equal(f.drops.length, 0);
  }
});
test('tap, pointer cancellation and capture loss never submit a transfer', () => {
  for (const end of ['tap', 'cancel', 'lost']) {
    const f = fixture(); f.api.surfaceDown(f.event());
    if (end !== 'tap') f.api.pointerMove(f.event({ clientX: 80 }));
    if (end === 'lost') f.api.lostDrag(f.event()); else f.api.finishDrag(f.event(), end === 'cancel');
    assert.equal(f.drag.current, null); assert.equal(f.ghosts.at(-1), null); assert.equal(f.drops.length, 0);
  }
});
