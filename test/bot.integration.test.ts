import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { createBot } from "../src/bot/bot.js";
import { config } from "../src/config.js";
import { closeDb, getUrls, setUrls } from "../src/store/db.js";
import { MockBotApiServer } from "./mock-bot-api.js";

const servers: MockBotApiServer[] = [];
const originalToken = config.botToken;
const originalApi = config.apiBaseUrl;
const originalDb = config.dbFile;

afterEach(async () => {
  closeDb();
  config.botToken = originalToken;
  config.apiBaseUrl = originalApi;
  config.dbFile = originalDb;
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("Telegram routing against the mock Bot API", () => {
  it("sends the rich welcome screen and morphs into the URL manager", async () => {
    const api = new MockBotApiServer();
    servers.push(api);
    config.apiBaseUrl = await api.start();
    config.botToken = "123456:TEST";
    config.dbFile = path.join(tmpdir(), `yori-${randomUUID()}.db`);

    const bot = createBot();
    await bot.init();
    const from = { id: 42, is_bot: false, first_name: "Test", username: "tester" };
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 42, type: "private" },
        from,
        text: "/start",
      },
    } as never);

    expect(api.calls.some((call) => call.method === "sendRichMessage")).toBe(true);
    const welcome = api.calls.find((call) => call.method === "sendRichMessage");
    expect(welcome?.body).toContain("ʏᴏʀɪ ᴘʀᴏxʏ ᴄʜᴇᴄᴋᴇʀ");
    expect(welcome?.body).toContain("welcome.jpg");
    expect(welcome?.contentType).toMatch(/multipart\/form-data|application\/json/);

    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: "callback-1",
        from,
        chat_instance: "fixture",
        data: "setu",
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 42, type: "private" },
          from: { id: 999, is_bot: true, first_name: "Yori" },
          text: "fixture",
        },
      },
    } as never);

    const richCalls = api.calls.filter((call) => call.method === "sendRichMessage");
    expect(richCalls.length).toBeGreaterThanOrEqual(2);
    expect(richCalls.at(-1)?.body).toContain("ᴍᴀɴᴀɢᴇ ᴜʀʟꜱ");

    setUrls(42, ["https://example.com"]);
    await bot.handleUpdate({
      update_id: 3,
      callback_query: {
        id: "callback-2",
        from,
        chat_instance: "fixture",
        data: "mgr",
        message: { message_id: 2, date: 1, chat: { id: 42, type: "private" }, from: { id: 999, is_bot: true, first_name: "Yori" }, text: "fixture" },
      },
    } as never);
    await bot.handleUpdate({
      update_id: 4,
      callback_query: {
        id: "callback-3",
        from,
        chat_instance: "fixture",
        data: "see",
        message: { message_id: 3, date: 1, chat: { id: 42, type: "private" }, from: { id: 999, is_bot: true, first_name: "Yori" }, text: "fixture" },
      },
    } as never);
    expect(api.calls.some((call) => call.method === "sendDocument")).toBe(true);

    await bot.handleUpdate({
      update_id: 5,
      callback_query: {
        id: "callback-4",
        from,
        chat_instance: "fixture",
        data: "rmv",
        message: { message_id: 4, date: 1, chat: { id: 42, type: "private" }, from: { id: 999, is_bot: true, first_name: "Yori" }, text: "fixture" },
      },
    } as never);
    await bot.handleUpdate({
      update_id: 6,
      message: { message_id: 5, date: 1, chat: { id: 42, type: "private" }, from, text: "0" },
    } as never);
    expect(getUrls(42)).toEqual([]);
    expect(api.calls.some((call) => call.method === "sendRichMessage" && call.body.includes("ᴍᴀɴᴀɢᴇ ᴜʀʟꜱ"))).toBe(true);
  });
});
