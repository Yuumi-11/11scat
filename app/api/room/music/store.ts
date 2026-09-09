import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  neteaseInvitationUrl,
  type MusicInvitation,
  type MusicSnapshot,
} from "../../../music-types.ts";

type Member = { id: string; name: string };
type Data = {
  version: 1;
  sharing: Record<string, boolean>;
  invitations: MusicInvitation[];
};
export class MusicError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// The installed integration has no authenticated NetEase state/sync provider.
// Accepting a website invitation MUST NOT manufacture a MusicSession.
export function createMusicStore(
  directory: string,
  members: () => Promise<Member[]>,
  now = Date.now,
) {
  let queue: Promise<unknown> = Promise.resolve();
  const file = path.join(directory, "music-v1.json");
  function transaction<T>(
    actor: string,
    update: (data: Data, people: Member[]) => T,
    save: boolean,
  ): Promise<T> {
    const work = queue.then(async () => {
      const people = await members();
      if (!people.some((p) => p.id === actor))
        throw new MusicError("请先登录自习室", 401);
      let data: Data;
      try {
        data = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        data = { version: 1, sharing: {}, invitations: [] };
      }
      if (
        data.version !== 1 ||
        !data.sharing ||
        !Array.isArray(data.invitations)
      )
        throw new MusicError("音乐状态暂不可用", 503);
      for (const invite of data.invitations)
        if (
          invite.expires <= now() &&
          ["pending", "accepted"].includes(invite.status)
        )
          invite.status = "expired";
      const result = update(data, people);
      if (save) {
        data.invitations = data.invitations
          .filter((i) => i.expires > now() - 86400000)
          .slice(-100);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temp = `${file}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
        await rename(temp, file);
      }
      return result;
    });
    queue = work.catch(() => undefined);
    return work;
  }
  function snapshot(
    actor: string,
    data: Data,
    people: Member[],
  ): MusicSnapshot {
    const invitation = [...data.invitations]
      .reverse()
      .find(
        (i) =>
          (i.from === actor || i.to === actor) &&
          ["pending", "accepted"].includes(i.status),
      );
    return {
      selfId: actor,
      sharing: data.sharing[actor] === true,
      capabilities: { liveStatus: false, sync: false },
      members: people.map((p) => ({
        ...p,
        connected: false,
        sharing: data.sharing[p.id] === true,
        state: "unavailable",
      })),
      invitation,
    };
  }
  return {
    snapshot: (actor: string) =>
      transaction(
        actor,
        (data, people) => snapshot(actor, data, people),
        false,
      ),
    command: (actor: string, command: Record<string, unknown>) =>
      transaction(
        actor,
        (data, people) => {
          switch (command.action) {
            case "sharing": {
              if (typeof command.enabled !== "boolean")
                throw new MusicError("共享设置无效");
              data.sharing[actor] = command.enabled;
              if (!command.enabled)
                for (const i of data.invitations)
                  if (
                    (i.from === actor || i.to === actor) &&
                    ["pending", "accepted"].includes(i.status)
                  )
                    i.status = "cancelled";
              break;
            }
            case "invite": {
              if (
                typeof command.to !== "string" ||
                command.to === actor ||
                !people.some((p) => p.id === command.to)
              )
                throw new MusicError("请选择同房间的另一位成员");
              const url = neteaseInvitationUrl(command.url);
              if (!url)
                throw new MusicError("请粘贴网易云生成的 HTTPS 邀请链接");
              const title =
                typeof command.title === "string"
                  ? command.title.trim().slice(0, 100)
                  : "";
              if (!title) throw new MusicError("请填写邀请中的歌曲名称");
              if (
                data.invitations.some(
                  (i) =>
                    ["pending", "accepted"].includes(i.status) &&
                    [i.from, i.to].some(
                      (id) => id === actor || id === command.to,
                    ),
                )
              )
                throw new MusicError("已有邀请进行中，请先处理或结束", 409);
              data.invitations.push({
                id: randomUUID(),
                from: actor,
                to: command.to,
                leader: actor,
                title,
                url,
                mode: "external",
                status: "pending",
                expires: now() + 10 * 60_000,
              });
              break;
            }
            case "accept":
            case "decline":
            case "cancel": {
              const invitation = data.invitations.find(
                (i) => i.id === command.id,
              );
              if (!invitation) throw new MusicError("邀请不存在", 404);
              if (invitation.status !== "pending")
                throw new MusicError("邀请已处理或过期", 409);
              const permitted =
                command.action === "cancel" ? invitation.from : invitation.to;
              if (actor !== permitted)
                throw new MusicError("不能操作这条邀请", 403);
              invitation.status =
                command.action === "accept"
                  ? "accepted"
                  : command.action === "decline"
                    ? "declined"
                    : "cancelled";
              break;
            }
            case "end":
              for (const i of data.invitations)
                if (
                  (i.from === actor || i.to === actor) &&
                  ["pending", "accepted"].includes(i.status)
                )
                  i.status = "cancelled";
              break;
            default:
              throw new MusicError("当前接入不支持这个播放操作", 422);
          }
          return snapshot(actor, data, people);
        },
        true,
      ),
  };
}
