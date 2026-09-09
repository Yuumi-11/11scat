import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createHmac, randomUUID } from "node:crypto";

test(
  "real music HTTP endpoint authorizes both members, rejects CSRF, and never enables sync or production fixtures",
  { timeout: 30000 },
  async () => {
    await mkdir("codex-generated", { recursive: true });
    const dir = await mkdtemp(path.resolve("codex-generated/music-http-"));
    await writeFile(
      path.join(dir, "identities.json"),
      JSON.stringify({
        version: 1,
        users: { a: { nickname: "A" }, b: { nickname: "B" } },
      }),
    );
    const secret = randomUUID(),
      socket = createServer();
    await new Promise((r) => socket.listen(0, "127.0.0.1", r));
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        env: {
          ...process.env,
          DATA_DIR: dir,
          AUTH_SESSION_SECRET: secret,
          SITE_PASSWORD: "fixture",
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    const origin = `http://127.0.0.1:${port}`;
    const cookie = (id) => {
      const payload = `${id}.${Math.floor(Date.now() / 1000) + 600}`;
      return `ss_access=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    };
    const call = (id, command, source = origin) =>
      fetch(origin + "/api/room/music", {
        method: command ? "POST" : "GET",
        headers: {
          ...(id ? { Cookie: cookie(id) } : {}),
          ...(command ? { "Content-Type": "application/json" } : {}),
          ...(source ? { Origin: source } : {}),
        },
        ...(command ? { body: JSON.stringify(command) } : {}),
        redirect: "manual",
      });
    try {
      let ready = false;
      for (let i = 0; i < 70; i++) {
        try {
          if ((await fetch(origin + "/access")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(ready);
      assert.ok([307, 401].includes((await call("")).status));
      assert.equal((await call("unknown")).status, 401);
      assert.equal(
        (
          await call(
            "a",
            { action: "sharing", enabled: true },
            "https://evil.example",
          )
        ).status,
        403,
      );
      assert.equal(
        (await call("a", { action: "sharing", enabled: true }, null)).status,
        403,
      );
      const initial = await call("a");
      assert.match(initial.headers.get("cache-control"), /no-store/);
      assert.equal((await initial.json()).sharing, false);
      const sent = await call("a", {
        action: "invite",
        to: "b",
        title: "HTTP test",
        url: "https://music.163.com/",
      });
      assert.equal(sent.status, 200);
      const id = (await sent.json()).invitation.id;
      assert.equal((await call("a", { action: "accept", id })).status, 403);
      const b = await (await call("b")).json();
      assert.equal(b.invitation.id, id);
      assert.equal(b.invitation.status, "pending");
      const accepted = await (await call("b", { action: "accept", id })).json();
      assert.equal(accepted.invitation.status, "accepted");
      assert.equal(accepted.session, undefined);
      assert.equal(accepted.sharing, false);
      await call("a", { action: "end" });
      assert.equal((await (await call("b")).json()).invitation, undefined);
      assert.equal(
        (
          await fetch(origin + "/music-preview", {
            headers: { Cookie: cookie("a") },
          })
        ).status,
        404,
      );
    } finally {
      server.kill();
    }
  },
);
