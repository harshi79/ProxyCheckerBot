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
import {
  executeBroadcast,
  handleAdminBan,
  handleAdminBroadcastPrompt,
  handleAdminClearUrls,
  handleAdminDashboard,
  handleAdminDemote,
  handleAdminDirectMessage,
  handleAdminExportDb,
  handleAdminHelp,
  handleAdminMaintenanceToggle,
  handleAdminPromote,
  handleAdminResetStats,
  handleAdminStats,
  handleAdminUnban,
  handleAdminUserDetail,
  handleAdminUsers,
} from "./admin.js";
import { Sender } from "./ui/send.js";
import { setState } from "./state.js";
import {
  findUser,
  isAdmin,
  isMaintenanceMode,
  isOwner,
  isUserBanned,
  setMaintenanceMode,
  upsertUser,
} from "../store/db.js";
import { bannedScreen, maintenanceScreen } from "./ui/templates.js";
import { stylize } from "../util/stylize.js";

/** Tiny per-user throttle: max 12 messages / 10s (admins and tests exempt). */
const bursts = new Map<number, { count: number; resetAt: number }>();
function throttled(userId: number): boolean {
  if (isOwner(userId) || isAdmin(userId)) return false;
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

    const adminUser = isAdmin(from.id);

    // Ban check: banned users are blocked unless admin
    const ban = isUserBanned(from.id);
    if (ban.banned && !adminUser) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: stylize("access restricted"), show_alert: true });
      } else {
        await deps.sender.sendScreen(ctx, bannedScreen(ban.reason));
      }
      return;
    }

    // Maintenance check: non-admins blocked during maintenance
    if (isMaintenanceMode() && !adminUser) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: stylize("maintenance mode"), show_alert: true });
      } else {
        await deps.sender.sendScreen(ctx, maintenanceScreen());
      }
      return;
    }

    await next();
  });

  /* ── commands: user ─────────────────────────────────────── */

  bot.command(["start", "help"], (ctx) => showWelcome(ctx, deps));

  /* ── commands: admin & developer ────────────────────────── */

  bot.command(["admin", "panel"], async (ctx) => {
    const text = (ctx.message?.text ?? "").trim();
    const args = text.split(/\s+/).slice(1);
    if (args[0] === "help") {
      return await handleAdminHelp(ctx, deps);
    }
    await handleAdminDashboard(ctx, deps);
  });

  bot.command("users", async (ctx) => {
    const args = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const firstArg = args[0];
    const page = firstArg ? Number.parseInt(firstArg, 10) : 1;
    await handleAdminUsers(ctx, deps, Number.isFinite(page) && page > 0 ? page : 1);
  });

  bot.command("user", async (ctx) => {
    const args = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const target = args[0];
    if (!target) {
      setState(ctx.from!.id, "awaiting_user_lookup");
      await ctx.reply(stylize("🔍 send user id or @username to inspect:"), {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }
    await handleAdminUserDetail(ctx, deps, target);
  });

  bot.command("ban", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const target = parts[0];
    if (!target) {
      await ctx.reply(stylize("usage: /ban <id|@username> [reason]"));
      return;
    }
    const reason = parts.slice(1).join(" ");
    await handleAdminBan(ctx, deps, target, reason || undefined);
  });

  bot.command("unban", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const target = parts[0];
    if (!target) {
      await ctx.reply(stylize("usage: /unban <id|@username>"));
      return;
    }
    await handleAdminUnban(ctx, deps, target);
  });

  bot.command("clearurls", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const target = parts[0];
    if (!target) {
      await ctx.reply(stylize("usage: /clearurls <id|@username>"));
      return;
    }
    await handleAdminClearUrls(ctx, deps, target);
  });

  bot.command("resetuser", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const target = parts[0];
    if (!target) {
      await ctx.reply(stylize("usage: /resetuser <id|@username>"));
      return;
    }
    await handleAdminResetStats(ctx, deps, target);
  });

  bot.command(["dm", "msg"], async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    const targetQuery = parts[0];
    if (!targetQuery || parts.length < 2) {
      await ctx.reply(stylize("usage: /dm <id|@username> <message>"));
      return;
    }
    const target = findUser(targetQuery);
    if (!target) {
      await ctx.reply(`✕ ${stylize("user not found")}`);
      return;
    }
    await handleAdminDirectMessage(ctx, deps, target.id, parts.slice(1).join(" "));
  });

  bot.command(["broadcast", "bcast"], async (ctx) => {
    const text = (ctx.message?.text ?? "").trim();
    const msg = text.replace(/^\/(?:broadcast|bcast)\s*/i, "");
    if (!msg) {
      return await handleAdminBroadcastPrompt(ctx, deps);
    }
    await executeBroadcast(ctx, deps, msg);
  });

  bot.command(["maintenance", "maint"], async (ctx) => {
    const args = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    if (args[0] === "on") {
      setMaintenanceMode(true);
    } else if (args[0] === "off") {
      setMaintenanceMode(false);
    } else {
      setMaintenanceMode(!isMaintenanceMode());
    }
    await ctx.reply(
      isMaintenanceMode()
        ? `🚧 ${stylize("maintenance mode ENABLED (users blocked)")}`
        : `✅ ${stylize("maintenance mode DISABLED (open)")}`,
    );
  });

  bot.command("stats", (ctx) => handleAdminStats(ctx, deps));
  bot.command(["backup", "exportdb"], (ctx) => handleAdminExportDb(ctx, deps));

  bot.command("promote", async (ctx) => {
    const args = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    if (!args[0]) {
      await ctx.reply(stylize("usage: /promote <id|@username>"));
      return;
    }
    await handleAdminPromote(ctx, deps, args[0]);
  });

  bot.command("demote", async (ctx) => {
    const args = (ctx.message?.text ?? "").trim().split(/\s+/).slice(1);
    if (!args[0]) {
      await ctx.reply(stylize("usage: /demote <id|@username>"));
      return;
    }
    await handleAdminDemote(ctx, deps, args[0]);
  });

  /* ── callbacks ──────────────────────────────────────────── */

  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data) {
      await ctx.answerCallbackQuery();
      return;
    }
    const handledByCheckFlow = data.startsWith("chk:") || data.startsWith("skip:");
    if (!handledByCheckFlow) await ctx.answerCallbackQuery();

    // User navigation
    if (data === "dev") return await handleDeveloper(ctx, deps);
    if (data === "prf") return await handleProfile(ctx, deps);
    if (data === "setu") return await handleSetUrlMenu(ctx, deps);
    if (data === "set") return await handleSetPrompt(ctx, deps);
    if (data === "mgr") return await handleManageActions(ctx, deps);
    if (data === "rmv") return await handleRemovePrompt(ctx, deps);
    if (data === "see") return await handleSeeUrls(ctx, deps);
    if (data === "back") return await handleBack(ctx, deps);

    // Admin dashboard & actions
    if (data === "adm_menu" || data === "adm_refresh") {
      return await handleAdminDashboard(ctx, deps, true);
    }
    if (data === "adm_stats") return await handleAdminStats(ctx, deps);
    if (data === "adm_help") return await handleAdminHelp(ctx, deps);
    if (data === "adm_maint") return await handleAdminMaintenanceToggle(ctx, deps);
    if (data === "adm_bcast") return await handleAdminBroadcastPrompt(ctx, deps);
    if (data === "adm_find") {
      setState(ctx.from!.id, "awaiting_user_lookup");
      await ctx.reply(stylize("🔍 send user id or @username to inspect:"), {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }
    if (data === "adm_noop") return;

    if (data.startsWith("adm_users:")) {
      const page = Number.parseInt(data.slice(10), 10) || 1;
      return await handleAdminUsers(ctx, deps, page);
    }
    if (data.startsWith("usr:")) {
      const targetId = Number.parseInt(data.slice(4), 10);
      return await handleAdminUserDetail(ctx, deps, targetId);
    }
    if (data.startsWith("u_ban:")) {
      const targetId = Number.parseInt(data.slice(6), 10);
      return await handleAdminBan(ctx, deps, targetId);
    }
    if (data.startsWith("u_unban:")) {
      const targetId = Number.parseInt(data.slice(8), 10);
      return await handleAdminUnban(ctx, deps, targetId);
    }
    if (data.startsWith("u_clr:")) {
      const targetId = Number.parseInt(data.slice(6), 10);
      return await handleAdminClearUrls(ctx, deps, targetId);
    }
    if (data.startsWith("u_rst:")) {
      const targetId = Number.parseInt(data.slice(6), 10);
      return await handleAdminResetStats(ctx, deps, targetId);
    }
    if (data.startsWith("u_dm:")) {
      const targetId = Number.parseInt(data.slice(5), 10);
      setState(ctx.from!.id, "awaiting_dm_text", targetId);
      await ctx.reply(stylize(`✉️ send message to deliver to user ${targetId}:`), {
        reply_markup: { force_reply: true, selective: true },
      });
      return;
    }

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
      { command: "admin", description: stylize("admin control panel") },
    ])
    .catch(() => {
      /* command registration is not critical during startup */
    });

  bot.catch((err) => {
    console.error("[bot] unhandled:", err.error);
  });

  return bot;
}
