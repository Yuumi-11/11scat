import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMusicStore } from "../app/api/room/music/store.ts";
import {
  visibleTrack,
  musicStatus,
  neteaseInvitationUrl,
} from "../app/music-types.ts";

test("two member external invitation consent, role checks, reload, expiry, no fabricated synchronization", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "music-test-"));
  let now = 10000;
  const people = async () => [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  const store = createMusicStore(dir, people, () => now);
  try {
    await assert.rejects(store.snapshot("intruder"), (e) => e.status === 401);
    const initial = await store.snapshot("a");
    assert.equal(initial.sharing, false);
    assert.equal(initial.session, undefined);
    await assert.rejects(
      store.command("a", {
        action: "invite",
        to: "a",
        url: "https://music.163.com/",
        title: "song",
      }),
    );
    await assert.rejects(
      store.command("a", {
        action: "invite",
        to: "b",
        url: "https://music.163.com.evil.com/",
        title: "song",
      }),
    );
    const sent = await store.command("a", {
      action: "invite",
      to: "b",
      url: "https://music.163.com/",
      title: "song",
    });
    const id = sent.invitation.id;
    assert.equal(sent.invitation.status, "pending");
    assert.equal(sent.sharing, false);
    assert.equal((await store.snapshot("c")).invitation, undefined);
    await assert.rejects(
      store.command("a", { action: "accept", id }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      store.command("b", { action: "cancel", id }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      store.command("b", {
        action: "invite",
        to: "a",
        url: "https://music.163.com/",
        title: "overlap",
      }),
      (e) => e.status === 409,
    );
    const accepted = await store.command("b", { action: "accept", id });
    assert.equal(accepted.invitation.status, "accepted");
    assert.equal(accepted.session, undefined);
    assert.equal(accepted.capabilities.sync, false);
    assert.equal(accepted.sharing, false);
    assert.equal(
      (await createMusicStore(dir, people, () => now).snapshot("a")).invitation
        .status,
      "accepted",
    );
    await assert.rejects(
      store.command("b", { action: "accept", id }),
      (e) => e.status === 409,
    );
    await assert.rejects(
      store.command("b", { action: "play" }),
      (e) => e.status === 422,
    );
    await store.command("b", { action: "end" });
    assert.equal((await store.snapshot("a")).invitation, undefined);
    const next = await store.command("a", {
      action: "invite",
      to: "b",
      url: "https://music.163.com/",
      title: "song",
    });
    await store.command("b", { action: "decline", id: next.invitation.id });
    assert.equal((await store.snapshot("a")).invitation, undefined);
    await store.command("a", { action: "sharing", enabled: true });
    assert.equal((await store.snapshot("b")).members[0].sharing, true);
    const expiring = await store.command("a", {
      action: "invite",
      to: "b",
      url: "https://music.163.com/",
      title: "song",
    });
    now += 600001;
    await assert.rejects(
      store.command("b", { action: "accept", id: expiring.invitation.id }),
      (e) => e.status === 409,
    );
    await store.command("a", { action: "sharing", enabled: false });
    assert.equal((await store.snapshot("b")).members[0].sharing, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("privacy and status projection never leaks cached music after consent withdrawn", () => {
  const m = {
    id: "a",
    name: "A",
    connected: true,
    sharing: false,
    state: "playing",
    track: { title: "private", artist: "artist" },
  };
  assert.equal(visibleTrack(m), undefined);
  assert.equal(musicStatus(m), "未共享听歌状态");
  assert.equal(visibleTrack({ ...m, sharing: true, online: false }), undefined);
  assert.equal(musicStatus({ ...m, sharing: true, online: false }), "对方离线");
  assert.equal(
    musicStatus({ ...m, sharing: true, state: "unavailable" }),
    "状态暂不可用",
  );
  assert.equal(musicStatus({ ...m, sharing: true, state: "idle" }), "暂未播放");
  for (const url of [
    "javascript:alert(1)",
    "https://music.163.com@evil.com",
    "http://music.163.com",
    "https://music.163.com:444/",
    "https://evil.com",
  ])
    assert.equal(neteaseInvitationUrl(url), null);
  assert.equal(
    neteaseInvitationUrl("https://music.163.com/#/song?id=1"),
    "https://music.163.com/#/song?id=1",
  );
});
