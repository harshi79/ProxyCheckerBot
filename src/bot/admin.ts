/**
 * Admin flows and developer control center.
 */
import fs from "node:fs";
import { Context, InputFile } from "grammy";
import { config } from "../config.js";
import {
  banUser,
  clearUserUrls,
  findUser,
  getAdminMetrics,
  getAllBroadcastUserIds,
  getUser,
  getUrls,
  getUsersList,
  isAdmin,
  isMaintenanceMode,
  isOwner,
  resetUserStats,
  setMaintenanceMode,
  setUserAdmin,
  unbanUser,
} from "../store/db.js";
import { jobStore } from "./jobs.js";
import { setState } from "./state.js";
import {
  adminBackKb,
  adminDashboardKb,
  adminStatsKb,
  adminUserDetailKb,
  adminUsersListKb,
  broadcastDoneKb,
} from "./ui/keyboards.js";
import {
  adminDashboardScreen,
  adminHelpScreen,
  adminStatsScreen,
  adminUserDetailScreen,
  adminUsersListScreen,
  broadcastPromptScreen,
  broadcastReportScreen,
} from "./ui/templates.js";
import type { Deps } from "./handlers.js";
import { stylize, header } from "../util/stylize.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function requireAdmin(ctx: Context): boolean {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) return false;
  return true;
}

export function requireOwner(ctx: Context): boolean {
  const from = ctx.from;
  if (!from || !isOwner(from.id)) return false;
  return true;
}

/* ─────────────────────────── dashboard & stats ─────────────────────────── */

export async function handleAdminDashboard(ctx: Context, deps: Deps, edit = false): Promise<void> {
  if (!requireAdmin(ctx)) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: stylize("unauthorized — admin only"), show_alert: true });
    } else {
      await ctx.reply(`⛔ ${stylize("unauthorized — admin only")}`);
    }
    return;
  }

  const metrics = getAdminMetrics();
  const queue = jobStore.getMetrics();
  const maintenance = isMaintenanceMode();
  const botMode = deps.sender.richSupported ? "Rich Bot API 10.x" : "Legacy Fallback";

  const screen = adminDashboardScreen(
    { metrics, queue, maintenance, botMode },
    adminDashboardKb(maintenance),
  );

  if (edit && ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: ctx.from! });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleAdminStats(ctx: Context, deps: Deps): Promise<void> {
  if (!requireAdmin(ctx)) return;

  const mem = process.memoryUsage();
  let dbBytes = 0;
  try {
    if (fs.existsSync(config.dbFile)) {
      dbBytes = fs.statSync(config.dbFile).size;
    }
  } catch {
    /* non-fatal */
  }

  const queue = jobStore.getMetrics();
  const screen = adminStatsScreen(
    {
      uptimeSec: process.uptime(),
      nodeVersion: process.version,
      memory: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed },
      dbBytes,
      queue,
      limits: {
        maxRunning: config.maxRunningJobs,
        jobConcurrency: config.jobConcurrency,
        globalConcurrency: config.globalConcurrency,
      },
    },
    adminStatsKb(),
  );

  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: ctx.from! });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleAdminHelp(ctx: Context, deps: Deps): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const screen = adminHelpScreen(adminBackKb());
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: ctx.from! });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleAdminMaintenanceToggle(ctx: Context, deps: Deps): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const current = isMaintenanceMode();
  setMaintenanceMode(!current);
  await handleAdminDashboard(ctx, deps, true);
}

/* ─────────────────────────── users list & detail ─────────────────────────── */

export async function handleAdminUsers(ctx: Context, deps: Deps, page = 1): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const { users, total, page: curPage, totalPages } = getUsersList({ page, pageSize: 6 });
  const screen = adminUsersListScreen(
    users,
    curPage,
    totalPages,
    total,
    adminUsersListKb(users, curPage, totalPages),
  );

  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: ctx.from! });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleAdminUserDetail(
  ctx: Context,
  deps: Deps,
  query: string | number,
): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const targetUser = findUser(query);
  if (!targetUser) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: stylize("user not found"), show_alert: true });
    } else {
      await ctx.reply(`✕ ${stylize("user not found in database")}`);
    }
    return;
  }

  const urls = getUrls(targetUser.id);
  const isOwnerUser = isOwner(targetUser.id);
  const screen = adminUserDetailScreen(targetUser, urls, isOwnerUser, adminUserDetailKb(targetUser, isOwnerUser));

  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: ctx.from! });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

/* ─────────────────────────── user management actions ─────────────────────────── */

export async function handleAdminBan(
  ctx: Context,
  deps: Deps,
  query: string | number,
  reason = "administrative action",
): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const targetUser = findUser(query);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }
  if (isOwner(targetUser.id)) {
    await ctx.reply(`⛔ ${stylize("cannot ban the bot owner")}`);
    return;
  }

  banUser(targetUser.id, reason);
  jobStore.abortUserJobs(targetUser.id);

  const notice = `🔨 ${stylize("user")} \`${targetUser.id}\` ${stylize("has been banned.")}`;
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: `Banned ${targetUser.id}`, show_alert: false });
    await handleAdminUserDetail(ctx, deps, targetUser.id);
  } else {
    await ctx.reply(notice, { parse_mode: "Markdown" });
  }
}

export async function handleAdminUnban(
  ctx: Context,
  deps: Deps,
  query: string | number,
): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const targetUser = findUser(query);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }

  unbanUser(targetUser.id);

  const notice = `✅ ${stylize("user")} \`${targetUser.id}\` ${stylize("has been unbanned.")}`;
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: `Unbanned ${targetUser.id}`, show_alert: false });
    await handleAdminUserDetail(ctx, deps, targetUser.id);
  } else {
    await ctx.reply(notice, { parse_mode: "Markdown" });
  }
}

export async function handleAdminClearUrls(
  ctx: Context,
  deps: Deps,
  query: string | number,
): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const targetUser = findUser(query);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }

  clearUserUrls(targetUser.id);

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: "Target URLs cleared", show_alert: false });
    await handleAdminUserDetail(ctx, deps, targetUser.id);
  } else {
    await ctx.reply(`🗑 ${stylize("cleared target urls for user")} \`${targetUser.id}\``, {
      parse_mode: "Markdown",
    });
  }
}

export async function handleAdminResetStats(
  ctx: Context,
  deps: Deps,
  query: string | number,
): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const targetUser = findUser(query);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }

  resetUserStats(targetUser.id);

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: "User counters reset", show_alert: false });
    await handleAdminUserDetail(ctx, deps, targetUser.id);
  } else {
    await ctx.reply(`🔄 ${stylize("reset check stats for user")} \`${targetUser.id}\``, {
      parse_mode: "Markdown",
    });
  }
}

export async function handleAdminDirectMessage(
  ctx: Context,
  deps: Deps,
  targetId: number,
  text: string,
): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const targetUser = getUser(targetId);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }

  const formattedMsg =
    `📩 **${header("admin notification")}**\n\n` +
    `${text}\n\n` +
    `> ${stylize("sent directly by the bot administration team.")}`;

  try {
    await deps.bot.api.sendMessage(targetId, formattedMsg, { parse_mode: "Markdown" });
    await ctx.reply(`✅ ${stylize("message delivered to user")} \`${targetId}\``, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    await ctx.reply(
      `✕ ${stylize("could not deliver message (user blocked bot or deactivated)")}: ${(err as Error).message}`,
    );
  }
}

/* ─────────────────────────── broadcast ─────────────────────────── */

export async function handleAdminBroadcastPrompt(ctx: Context, deps: Deps): Promise<void> {
  if (!requireAdmin(ctx)) return;
  setState(ctx.from!.id, "awaiting_broadcast");
  const screen = broadcastPromptScreen(adminBackKb());
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: ctx.from! });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
  await ctx.reply(stylize("💬 reply with the text to broadcast:"), {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Type your broadcast here…" },
  });
}

export async function executeBroadcast(ctx: Context, deps: Deps, text: string): Promise<void> {
  const targetIds = getAllBroadcastUserIds();
  if (targetIds.length === 0) {
    await ctx.reply(`⚠️ ${stylize("no active users found in database.")}`);
    return;
  }

  const initialMsg = await ctx.reply(
    `📢 ⟨ ${stylize("broadcasting")} ⟩\n` +
      `▱▱▱▱▱▱▱▱▱▱ 0%\n` +
      `✅ ${stylize("sent")}: 0 · ⛔ ${stylize("failed")}: 0 · 👥 ${stylize("total")}: ${targetIds.length}`,
  );

  const startedAt = Date.now();
  let delivered = 0;
  let failed = 0;
  let lastEditAt = Date.now();

  for (let i = 0; i < targetIds.length; i++) {
    const uid = targetIds[i];
    if (uid === undefined) continue;
    try {
      try {
        await deps.bot.api.sendMessage(uid, text, { parse_mode: "HTML" });
      } catch {
        await deps.bot.api.sendMessage(uid, text);
      }
      delivered += 1;
    } catch {
      failed += 1;
    }

    const now = Date.now();
    if (now - lastEditAt > 1500 || i === targetIds.length - 1) {
      const pct = Math.floor(((i + 1) / targetIds.length) * 100);
      const filled = Math.round(pct / 10);
      const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
      try {
        await deps.bot.api.editMessageText(
          ctx.chat!.id,
          initialMsg.message_id,
          `📢 ⟨ ${stylize("broadcasting")} ⟩\n` +
            `${bar} ${pct}%\n` +
            `✅ ${stylize("sent")}: ${delivered} · ⛔ ${stylize("failed")}: ${failed} · 👥 ${stylize("total")}: ${targetIds.length}`,
        );
      } catch {
        /* ignore intermediate edit collisions */
      }
      lastEditAt = now;
    }

    // Rate-limiting delay to respect Telegram flood thresholds (approx 28/s)
    await sleep(35);
  }

  const durationMs = Date.now() - startedAt;
  const report = broadcastReportScreen(targetIds.length, delivered, failed, durationMs, broadcastDoneKb());
  await deps.sender.sendScreen(ctx, report);
}

/* ─────────────────────────── promote / demote & backup ─────────────────────────── */

export async function handleAdminPromote(
  ctx: Context,
  deps: Deps,
  query: string | number,
): Promise<void> {
  if (!requireOwner(ctx)) {
    await ctx.reply(`⛔ ${stylize("unauthorized — owner only.")}`);
    return;
  }
  const targetUser = findUser(query);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }

  setUserAdmin(targetUser.id, true);
  await ctx.reply(`👑 ${stylize("promoted user")} \`${targetUser.id}\` ${stylize("to bot admin.")}`, {
    parse_mode: "Markdown",
  });
}

export async function handleAdminDemote(
  ctx: Context,
  deps: Deps,
  query: string | number,
): Promise<void> {
  if (!requireOwner(ctx)) {
    await ctx.reply(`⛔ ${stylize("unauthorized — owner only.")}`);
    return;
  }
  const targetUser = findUser(query);
  if (!targetUser) {
    await ctx.reply(`✕ ${stylize("user not found")}`);
    return;
  }
  if (isOwner(targetUser.id)) {
    await ctx.reply(`⛔ ${stylize("cannot demote the primary bot owner.")}`);
    return;
  }

  setUserAdmin(targetUser.id, false);
  await ctx.reply(`🛡 ${stylize("demoted user")} \`${targetUser.id}\` ${stylize("from bot admin.")}`, {
    parse_mode: "Markdown",
  });
}

export async function handleAdminExportDb(ctx: Context, deps: Deps): Promise<void> {
  if (!requireOwner(ctx)) {
    await ctx.reply(`⛔ ${stylize("unauthorized — owner only.")}`);
    return;
  }
  if (!fs.existsSync(config.dbFile)) {
    await ctx.reply(`⚠️ ${stylize("database file does not exist yet.")}`);
    return;
  }

  const fileBuf = fs.readFileSync(config.dbFile);
  await ctx.replyWithDocument(new InputFile(fileBuf, "bot-backup.db"), {
    caption: `💾 **${header("database backup")}**\n${stylize("generated at")} ${new Date().toISOString()}`,
    parse_mode: "Markdown",
  });
}
