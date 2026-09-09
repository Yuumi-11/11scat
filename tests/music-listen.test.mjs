import { test } from "node:test";
import assert from "node:assert/strict";
import { createListenState } from "../app/api/room/music/listen/state.ts";
const people = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];
test("audio sharing requires independent source and recipient consent; signaling is participant scoped", () => {
  let now = 10000;
  const store = createListenState(() => now);
  const call = (who, body) => store.command(who, body, people);
  const heart = (who, extra = {}) =>
    call(who, {
      action: "heartbeat",
      device: "test-device-123456-" + who,
      connected: true,
      sharing: false,
      ...extra,
    });
  heart("a");
  assert.equal(store.view("b", people).members[0].connected, false);
  assert.throws(
    () => call("a", { action: "invite", to: "b", leader: "a" }),
    /尚未开启/,
  );
  heart("a", { sharing: true });
  const pending = call("b", {
    action: "invite",
    to: "a",
    leader: "a",
  }).invitation;
  assert.equal(pending.status, "pending");
  assert.throws(
    () =>
      call("b", {
        action: "signal",
        kind: "answer",
        sdp: "v=0\r\n",
        id: pending.id,
      }),
    /分享已停止/,
  );
  assert.throws(() => call("b", { action: "accept", id: pending.id }), /无权/);
  call("a", { action: "accept", id: pending.id });
  assert.throws(
    () =>
      call("c", {
        action: "signal",
        kind: "answer",
        sdp: "v=0\r\n",
        id: pending.id,
      }),
    /已结束/,
  );
  call("a", { action: "ready", id: pending.id });
  assert.equal(store.view("b", people).invitation.ready.length, 1);
  call("b", { action: "ready", id: pending.id });
  assert.equal(store.view("a", people).invitation.ready.length, 2);
  heart("b", { id: pending.id, receiving: false });
  assert.deepEqual(store.view("a", people).invitation.ready, ["a"]);
  call("b", { action: "end", id: pending.id });
  assert.throws(
    () =>
      call("a", {
        action: "signal",
        kind: "answer",
        sdp: "v=0\r\n",
        id: pending.id,
      }),
    /已结束/,
  );
  now += 20000;
  assert.equal(store.view("b", people).members[0].connected, false);
});
test("single source owner, invitation expiry and duplicate prevention", () => {
  let now = 0;
  const store = createListenState(() => now);
  const call = (a, b) => store.command(a, b, people);
  call("a", {
    action: "heartbeat",
    device: "test-device-123456-a",
    connected: true,
    sharing: true,
  });
  assert.throws(
    () =>
      call("a", {
        action: "heartbeat",
        device: "another-device-123456",
        connected: true,
        sharing: true,
      }),
    /另一个/,
  );
  const invite = call("a", {
    action: "invite",
    to: "b",
    leader: "a",
  }).invitation;
  assert.throws(
    () => call("c", { action: "invite", to: "b", leader: "a" }),
    /已有/,
  );
  now = 120001;
  assert.equal(store.view("b", people).invitation, undefined);
  assert.throws(() => call("b", { action: "accept", id: invite.id }), /已结束/);
});
