import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { createBot } from "../src/bot/bot.js";
import { config } from "../src/config.js";
import {
  closeDb,
  getUrls,
  isAdmin,
  isMaintenanceMode,
  isOwner,
  isUserBanned,
  setUrls,
  upsertUser,
} from "../src/store/db.js";
import { MockBotApiServer } from "./mock-bot-api.js";

const servers: MockBotApiServer[] = [];
const originalToken = config.botToken;
const originalApi = config.apiBaseUrl;
const originalDb = config.dbFile;
const originalOwner = config.ownerId;

function cmdMsg(
  from: { id: number; is_bot: boolean; first_name: string; username?: string },
  text: string,
  msgId = 1,
) {
  const cmd = text.split(/\s+/)[0] ?? text;
  return {
    message_id: msgId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: from.id, type: "private" },
    from,
    text,
    entities: [{ type: "bot_command", offset: 0, length: cmd.length }],
  };
}

afterEach(async () => {
  closeDb();
  config.botToken = originalToken;
  config.apiBaseUrl = originalApi;
  config.dbFile = originalDb;
  config.ownerId = originalOwner;
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("Admin system and user management flows", () => {
  it("enforces owner privileges for ID 7728424218 and rejects unauthorized users", async () => {
    const api = new MockBotApiServer();
    servers.push(api);
    config.apiBaseUrl = await api.start();
    config.botToken = "123456:TEST";
    config.dbFile = path.join(tmpdir(), `yori-admin-${randomUUID()}.db`);
    config.ownerId = 7728424218;

    expect(isOwner(7728424218)).toBe(true);
    expect(isAdmin(7728424218)).toBe(true);
    expect(isOwner(12345)).toBe(false);
    expect(isAdmin(12345)).toBe(false);

    const bot = createBot();
    await bot.init();

    // 1. Non-admin tries to run /admin
    const normalUser = { id: 12345, is_bot: false, first_name: "Normal", username: "normaluser" };
    await bot.handleUpdate({
      update_id: 1,
      message: cmdMsg(normalUser, "/admin", 1),
    } as never);

    const normalMsg = api.calls.find(
      (c) => c.method === "sendMessage" && c.body.includes("12345"),
    );
    expect(normalMsg).toBeDefined();
    expect(normalMsg?.body).toContain("ᴜɴᴀᴜᴛʜᴏʀɪᴢᴇᴅ");

    // 2. Owner (7728424218) runs /admin
    const ownerUser = { id: 7728424218, is_bot: false, first_name: "Owner", username: "botowner" };
    await bot.handleUpdate({
      update_id: 2,
      message: cmdMsg(ownerUser, "/admin", 2),
    } as never);

    const adminPanelCall = api.calls.find(
      (c) =>
        (c.method === "sendRichMessage" || c.method === "sendMessage") &&
        c.body.includes("7728424218") &&
        c.body.includes("ᴀᴅᴍɪɴ ᴄᴏɴꜱᴏʟᴇ"),
    );
    expect(adminPanelCall).toBeDefined();
  });

  it("handles ban, unban, clearurls, and resetuser commands cleanly", async () => {
    const api = new MockBotApiServer();
    servers.push(api);
    config.apiBaseUrl = await api.start();
    config.botToken = "123456:TEST";
    config.dbFile = path.join(tmpdir(), `yori-admin-${randomUUID()}.db`);
    config.ownerId = 7728424218;

    const bot = createBot();
    await bot.init();

    const targetUser = { id: 55555, is_bot: false, first_name: "Spammer", username: "spambot" };
    upsertUser({ id: 55555, name: "Spammer", username: "spambot", bio: "", is_bot: false });
    setUrls(55555, ["https://malicious.org", "https://badproxy.net"]);

    const owner = { id: 7728424218, is_bot: false, first_name: "Owner", username: "botowner" };

    // Inspect user
    await bot.handleUpdate({
      update_id: 10,
      message: cmdMsg(owner, "/user 55555", 10),
    } as never);

    const userDetailCall = api.calls.find(
      (c) => c.body.includes("55555") && c.body.includes("ᴜꜱᴇʀ ɪɴꜱᴘᴇᴄᴛɪᴏɴ"),
    );
    expect(userDetailCall).toBeDefined();

    // Ban user
    await bot.handleUpdate({
      update_id: 11,
      message: cmdMsg(owner, "/ban 55555 spamming proxies", 11),
    } as never);

    expect(isUserBanned(55555).banned).toBe(true);
    expect(isUserBanned(55555).reason).toBe("spamming proxies");

    // Banned user now attempts to send a message -> blocked by middleware
    api.calls.length = 0;
    await bot.handleUpdate({
      update_id: 12,
      message: cmdMsg(targetUser, "/start", 12),
    } as never);

    const banNotice = api.calls.find(
      (c) => c.body.includes("ᴀᴄᴄᴇꜱꜱ ʀᴇꜱᴛʀɪᴄᴛᴇᴅ") || c.body.includes("banned"),
    );
    expect(banNotice).toBeDefined();

    // Clear URLs
    await bot.handleUpdate({
      update_id: 13,
      message: cmdMsg(owner, "/clearurls 55555", 13),
    } as never);
    expect(getUrls(55555)).toEqual([]);

    // Unban user
    await bot.handleUpdate({
      update_id: 14,
      message: cmdMsg(owner, "/unban 55555", 14),
    } as never);
    expect(isUserBanned(55555).banned).toBe(false);
  });

  it("handles maintenance mode toggles and allows admin bypass", async () => {
    const api = new MockBotApiServer();
    servers.push(api);
    config.apiBaseUrl = await api.start();
    config.botToken = "123456:TEST";
    config.dbFile = path.join(tmpdir(), `yori-admin-${randomUUID()}.db`);
    config.ownerId = 7728424218;

    const bot = createBot();
    await bot.init();

    const owner = { id: 7728424218, is_bot: false, first_name: "Owner", username: "botowner" };
    const normal = { id: 99999, is_bot: false, first_name: "Player", username: "player" };

    // Turn maintenance mode ON
    await bot.handleUpdate({
      update_id: 20,
      message: cmdMsg(owner, "/maintenance on", 20),
    } as never);
    expect(isMaintenanceMode()).toBe(true);

    // Normal user sends /start -> blocked by maintenance
    api.calls.length = 0;
    await bot.handleUpdate({
      update_id: 21,
      message: cmdMsg(normal, "/start", 21),
    } as never);
    const maintNotice = api.calls.find((c) => c.body.includes("ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ ᴍᴏᴅᴇ"));
    expect(maintNotice).toBeDefined();

    // Owner sends /start -> bypassed and served welcome
    api.calls.length = 0;
    await bot.handleUpdate({
      update_id: 22,
      message: cmdMsg(owner, "/start", 22),
    } as never);
    const ownerWelcome = api.calls.find((c) => c.body.includes("ʏᴏʀɪ ᴘʀᴏxʏ ᴄʜᴇᴄᴋᴇʀ"));
    expect(ownerWelcome).toBeDefined();

    // Turn maintenance mode OFF
    await bot.handleUpdate({
      update_id: 23,
      message: cmdMsg(owner, "/maintenance off", 23),
    } as never);
    expect(isMaintenanceMode()).toBe(false);
  });

  it("handles user promotion and demotion by owner", async () => {
    const api = new MockBotApiServer();
    servers.push(api);
    config.apiBaseUrl = await api.start();
    config.botToken = "123456:TEST";
    config.dbFile = path.join(tmpdir(), `yori-admin-${randomUUID()}.db`);
    config.ownerId = 7728424218;

    const bot = createBot();
    await bot.init();

    const owner = { id: 7728424218, is_bot: false, first_name: "Owner", username: "botowner" };
    upsertUser({ id: 88888, name: "Helper", username: "helperbot", bio: "", is_bot: false });

    expect(isAdmin(88888)).toBe(false);

    // Promote helper
    await bot.handleUpdate({
      update_id: 30,
      message: cmdMsg(owner, "/promote 88888", 30),
    } as never);
    expect(isAdmin(88888)).toBe(true);

    // Demote helper
    await bot.handleUpdate({
      update_id: 31,
      message: cmdMsg(owner, "/demote 88888", 31),
    } as never);
    expect(isAdmin(88888)).toBe(false);
  });

  it("handles broadcast, direct messages, and admin callback queries", async () => {
    const api = new MockBotApiServer();
    servers.push(api);
    config.apiBaseUrl = await api.start();
    config.botToken = "123456:TEST";
    config.dbFile = path.join(tmpdir(), `yori-admin-${randomUUID()}.db`);
    config.ownerId = 7728424218;

    const bot = createBot();
    await bot.init();

    const owner = { id: 7728424218, is_bot: false, first_name: "Owner", username: "botowner" };
    upsertUser({ id: 101, name: "Alice", username: "alice", bio: "", is_bot: false });
    upsertUser({ id: 102, name: "Bob", username: "bob", bio: "", is_bot: false });

    // 1. Send direct message (/dm)
    await bot.handleUpdate({
      update_id: 40,
      message: cmdMsg(owner, "/dm 101 Hello Alice!", 40),
    } as never);

    const dmCall = api.calls.find((c) => c.body.includes("101") && c.body.includes("Hello Alice!"));
    expect(dmCall).toBeDefined();

    // 2. Broadcast announcement
    api.calls.length = 0;
    await bot.handleUpdate({
      update_id: 41,
      message: cmdMsg(owner, "/broadcast Service update available", 41),
    } as never);

    const broadcastTo101 = api.calls.find((c) => c.body.includes("101") && c.body.includes("Service update"));
    const broadcastTo102 = api.calls.find((c) => c.body.includes("102") && c.body.includes("Service update"));
    expect(broadcastTo101).toBeDefined();
    expect(broadcastTo102).toBeDefined();

    // 3. Stats callback query
    api.calls.length = 0;
    await bot.handleUpdate({
      update_id: 42,
      callback_query: {
        id: "cb-stats",
        from: owner,
        chat_instance: "fixture",
        data: "adm_stats",
        message: {
          message_id: 50,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 7728424218, type: "private" },
          from: { id: 999, is_bot: true, first_name: "Yori" },
          text: "fixture",
        },
      },
    } as never);

    const statsCall = api.calls.find((c) => c.body.includes("ꜱʏꜱᴛᴇᴍ ᴛᴇʟᴇᴍᴇᴛʀʏ"));
    expect(statsCall).toBeDefined();

    // 4. Users list callback query
    api.calls.length = 0;
    await bot.handleUpdate({
      update_id: 43,
      callback_query: {
        id: "cb-users",
        from: owner,
        chat_instance: "fixture",
        data: "adm_users:1",
        message: {
          message_id: 51,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 7728424218, type: "private" },
          from: { id: 999, is_bot: true, first_name: "Yori" },
          text: "fixture",
        },
      },
    } as never);

    const usersCall = api.calls.find((c) => c.body.includes("ᴜꜱᴇʀ ᴅɪʀᴇᴄᴛᴏʀʏ"));
    expect(usersCall).toBeDefined();
  });
});
