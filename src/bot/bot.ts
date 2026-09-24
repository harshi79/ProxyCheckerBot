/**
 * Bot assembly: middleware + routing for every flow.
 */
import { Bot, Context, NextFunction } from "grammy";
import { config } from "../config.js";
import {
  handleBack,
  handleCheckCallback,
  handleDeveloper,
  handleIncomingDocument,
  handleIncomingText,
  handleManageActions,
  handleProfile,
  handleRemovePrompt,
  handleSeeUrls,
  handleSetPrompt,
  handleSetUrlMenu,
  handleSkipCallback,
  handleStoppedGeneration,
  showWelcome,
  Deps,
} from "./handlers.js";
import { Sender } from "./ui/send.js";
import { upsertUser } from "../store/db.js";
import { stylize } from "../util/stylize.js";

/** Tiny per-user throttle: max 12 messages / 10s. */
const bursts = new Map<number, { count: number; resetAt: number }>();
function throttled(userId: number): boolean {
  const now = Date.now();
  let b = bursts.get(userId);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + 10_000 };
    bursts.set(userId, b);
  }
  b.count += 1;
  return b.count > 12;
}

export function createBot(): Bot {
  const bot = new Bot(config.botToken, {
    client: { apiRoot: config.apiBaseUrl },
  });
  const deps: Deps = { bot, sender: new Sender(bot) };

  /* ── middleware ─────────────────────────────────────────── */

  bot.use(async (ctx: Context, next: NextFunction) => {
    const from = ctx.from;
    const chat = ctx.chat;
    if (!from || from.is_bot) return;
    if (!chat || chat.type !== "private") return; // private chats only
    const stopped = ctx.update.stopped_message_generation;
    if (stopped) {
      handleStoppedGeneration(deps, String(stopped.chat.id), stopped.draft_id);
      return;
    }
    if (throttled(from.id)) return;
    try {
      upsertUser({
        id: from.id,
        name: (from.first_name ?? "") + (from.last_name ? ` ${from.last_name}` : ""),
        username: from.username ?? "",
        bio: "",
        is_bot: from.is_bot,
      });
    } catch {
      /* db hiccup — non-fatal */
    }
    await next();
  });

  /* ── commands ───────────────────────────────────────────── */

  bot.command(["start", "help"], (ctx) => showWelcome(ctx, deps));

  /* ── callbacks ──────────────────────────────────────────── */

  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data) {
      await ctx.answerCallbackQuery();
      return;
    }
    const handledByCheckFlow = data.startsWith("chk:") || data.startsWith("skip:");
    if (!handledByCheckFlow) await ctx.answerCallbackQuery();
    if (data === "dev") return await handleDeveloper(ctx, deps);
    if (data === "prf") return await handleProfile(ctx, deps);
    if (data === "setu") return await handleSetUrlMenu(ctx, deps);
    if (data === "set") return await handleSetPrompt(ctx, deps);
    if (data === "mgr") return await handleManageActions(ctx, deps);
    if (data === "rmv") return await handleRemovePrompt(ctx, deps);
    if (data === "see") return await handleSeeUrls(ctx, deps);
    if (data === "back") return await handleBack(ctx, deps);
    if (data.startsWith("chk:")) {
      await handleCheckCallback(ctx, deps, data.slice(4));
      return;
    }
    if (data.startsWith("skip:")) {
      await handleSkipCallback(ctx, deps, data.slice(5));
      return;
    }
  });

  /* ── messages ───────────────────────────────────────────── */

  bot.on("message:document", (ctx) => handleIncomingDocument(ctx, deps));
  bot.on("message:text", (ctx) => handleIncomingText(ctx, deps));

  /* ── menu & errors ──────────────────────────────────────── */

  void bot.api
    .setMyCommands([
      { command: "start", description: stylize("open the main menu") },
    ])
    .catch(() => {
      /* command registration is not critical during startup */
    });

  bot.catch((err) => {
    console.error("[bot] unhandled:", err.error);
  });

  return bot;
}
