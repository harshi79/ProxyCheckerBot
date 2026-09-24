/**
 * All conversation flows.
 */
import { Bot, Context, InputFile } from "grammy";

type User = NonNullable<Context["from"]>;
import { config } from "../config.js";
import { jobStore, Job } from "./jobs.js";
import { getState, setState } from "./state.js";
import {
  developerKbFor,
  backKb,
  checkKb,
  manageActionsKb,
  manageUrlsKb,
  mainMenuKb,
  resultKb,
  setUrlsPromptKb,
  skipKb,
} from "./ui/keyboards.js";
import { imageBlock, hasAsset } from "./ui/images.js";
import { Sender } from "./ui/send.js";
import {
  cancelledScreen,
  developerScreen,
  errorScreen,
  manageActionsScreen,
  manageUrlsScreen,
  noHitsScreen,
  parseReportScreen,
  profileScreen,
  queuedScreen,
  removePrompt,
  resultScreen,
  setUrlsPrompt,
  welcomeScreen,
} from "./ui/templates.js";
import { parseProxies, looksLikeProxyList } from "../checker/parse.js";
import { runJob } from "../checker/engine.js";
import { buildResultFiles } from "../checker/report.js";
import { validateTargetUrl } from "../checker/targets.js";
import { TargetUrl } from "../checker/types.js";
import { ProgressStreamer } from "./ui/send.js";
import {
  bumpUserStats,
  dailyJobCount,
  finishJob,
  getUrls,
  setUrls,
  setBio,
  startJob,
  upsertUser,
  isAdmin,
} from "../store/db.js";
import { downloadFile } from "../util/files.js";
import { stylize, groupNum } from "../util/stylize.js";
import { getStateData } from "./state.js";
import {
  executeBroadcast,
  handleAdminUserDetail,
  handleAdminDirectMessage,
} from "./admin.js";

export interface Deps {
  bot: Bot;
  sender: Sender;
}

/** Every handler runs behind the private-chat + sender middleware. */
function user(ctx: Context): User {
  const from = ctx.from;
  if (!from) throw new Error("update without a sender");
  return from;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function img(name: string) {
  return hasAsset(name) ? imageBlock(name) : undefined;
}

/* ─────────────────────────── screens ─────────────────────────── */

export async function showWelcome(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const isAdm = isAdmin(from.id);
  await deps.sender.sendScreen(ctx, welcomeScreen(img("welcome.jpg"), mainMenuKb(isAdm)));
}

export async function handleDeveloper(ctx: Context, deps: Deps): Promise<void> {
  const screen = developerScreen(img("developer.jpg"), developerKbFor(config.developerUrl));
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: user(ctx) });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleProfile(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const row = upsertUser({
    id: from.id,
    name: from.first_name + (from.last_name ? ` ${from.last_name}` : ""),
    username: from.username ?? "",
    bio: "",
    is_bot: from.is_bot,
  });
  let bio = row.bio;
  try {
    const chat = await deps.bot.api.getChat(from.id);
    if (typeof chat === "object" && chat !== null && "bio" in chat && typeof chat.bio === "string") {
      bio = chat.bio;
      setBio(from.id, bio);
    }
  } catch {
    // Some Bot API deployments do not expose the user's bio; keep the cached value.
  }
  const screen = profileScreen(img("profile.jpg"), {
    name: row.name,
    username: row.username || undefined,
    id: row.id,
    isBot: row.is_bot === 1,
    bio: bio || undefined,
    checksDone: row.checks_done,
    proxiesTested: row.proxies_tested,
  });
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

/* ─────────────────────────── url management ─────────────────────────── */

export async function handleSetUrlMenu(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const urls = getUrls(from.id);
  const screen = manageUrlsScreen(img("manager.jpg"), urls, manageUrlsKb());
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleSetPrompt(ctx: Context, deps: Deps): Promise<void> {
  setState(user(ctx).id, "awaiting_set_urls");
  const screen = setUrlsPrompt(img("manager.jpg"), config.maxTargetUrls, setUrlsPromptKb());
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: user(ctx) });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
  // nudge: user should reply with the urls
  await ctx.reply(stylize(" waiting for your urls…"), {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "https://… (one per line)" },
  });
}

export async function handleManageActions(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const urls = getUrls(from.id);
  const screen = manageActionsScreen(img("manager.jpg"), urls, manageActionsKb());
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}

export async function handleSeeUrls(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const urls = getUrls(from.id);
  await ctx.reply(stylize("ʜᴇʀ ʀᴇ ʏᴏᴜʀ ʀʟꜱ") + ` (${urls.length})`);
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(urls.join("\n") + (urls.length ? "\n" : ""), "utf8"), "urls.txt"),
  );
}

export async function handleRemovePrompt(ctx: Context, deps: Deps): Promise<void> {
  setState(user(ctx).id, "awaiting_remove");
  const screen = removePrompt(img("manager.jpg"), backKb());
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from: user(ctx) });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
  await ctx.reply(stylize("⬇ send the url to remove…"), {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "https://… or 0" },
  });
}

function normalizeUrlKey(u: string): string {
  try {
    const x = new URL(u.startsWith("http") ? u : `https://${u}`);
    return `${x.protocol}//${x.hostname}${x.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase().trim();
  }
}

/** Handle text while awaiting_set_urls. */
export async function consumeSetUrls(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const text = ctx.message?.text ?? "";
  const lines = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const stored: string[] = [];

  for (const line of lines.slice(0, config.maxTargetUrls)) {
    const v = await validateTargetUrl(line);
    if (!v.ok || !v.target) {
      errors.push(`${line} — ${v.error ?? "invalid"}`);
      continue;
    }
    const key = normalizeUrlKey(line);
    if (!stored.some((s) => normalizeUrlKey(s) === key)) stored.push(line);
  }
  if (lines.length > config.maxTargetUrls) {
    errors.push(`${stylize("max")} ${config.maxTargetUrls} ${stylize("urls — extras ignored")}`);
  }

  if (stored.length > 0) setUrls(from.id, stored);
  setState(from.id, "idle");

  const head =
    stored.length > 0
      ? `✅ ${stylize("urls saved")} (${stored.length}/${config.maxTargetUrls})`
      : `⚠ ${stylize("no valid urls saved")}`;
  const tail = errors.length ? `\n\n${errors.map((e) => `✕ ${e}`).join("\n")}` : "";
  await ctx.reply(head + tail);
  const pending = jobStore.pendingJob(from.id);
  if (pending && stored.length > 0) {
    pending.report.targetDisplays = stored;
    await deps.sender.sendScreen(
      ctx,
      parseReportScreen(
        {
          fileName: pending.report.fileName,
          fileSize: pending.report.fileSize,
          lines: pending.report.lines,
          counts: pending.report.counts,
          rejected: pending.report.rejected,
          targets: stored,
        },
        checkKb(pending.id, stored.length),
      ),
    );
  } else {
    await handleSetUrlMenu(ctx, deps);
  }
}

/** Handle text while awaiting_remove. */
export async function consumeRemove(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const text = (ctx.message?.text ?? "").trim();
  const urls = getUrls(from.id);
  let msg: string;

  if (text === "0") {
    setUrls(from.id, []);
    msg = `🗑 ${stylize("all urls cleared")}`;
  } else {
    const key = normalizeUrlKey(text);
    const idx = urls.findIndex((u) => normalizeUrlKey(u) === key);
    if (idx === -1) {
      msg = `✕ ${stylize("url not in your list")}`;
    } else {
      const next = [...urls.slice(0, idx), ...urls.slice(idx + 1)];
      setUrls(from.id, next);
      msg = `🗑 ${stylize("removed")}: ${text}\n${stylize("remaining")} (${next.length})`;
    }
  }
  setState(from.id, "idle");
  await ctx.reply(msg);
  await handleSetUrlMenu(ctx, deps);
}

/* ─────────────────────────── proxy intake ─────────────────────────── */

async function prepareParseReport(ctx: Context, deps: Deps, text: string, fileName?: string, fileSize?: number): Promise<void> {
  const from = user(ctx);
  const lineCount = text.split(/\r\n|\n|\r/).length;
  if (lineCount > config.maxLines) {
    await deps.sender.sendScreen(
      ctx,
      errorScreen(
        `${stylize("list too big")} — ${groupNum(lineCount)} ${stylize("lines, max")} ${groupNum(config.maxLines)}`,
      ),
    );
    return;
  }
  const parsed = parseProxies(text, { maxLines: config.maxLines });
  if (parsed.entries.length === 0) {
    await deps.sender.sendScreen(
      ctx,
      errorScreen(`✖ ${stylize("no proxies found in this file — send host:port lines, one per line")}`),
    );
    return;
  }
  jobStore.replaceParsed(from.id);
  const savedUrls = getUrls(from.id);
  const job = jobStore.create(from.id, parsed.entries, {
    fileName,
    fileSize,
    lines: parsed.totalLines,
    counts: parsed.counts,
    rejected: parsed.rejected,
    targetDisplays: savedUrls.length > 0 ? savedUrls : [`${config.defaultTargetUrl} (${stylize("default")})`],
  });
  const targets = savedUrls.length > 0 ? savedUrls : [config.defaultTargetUrl];
  const kb = savedUrls.length > 0 ? checkKb(job.id, savedUrls.length) : skipKb(job.id);
  await deps.sender.sendScreen(
    ctx,
    parseReportScreen(
      {
        fileName,
        fileSize,
        lines: parsed.totalLines,
        counts: parsed.counts,
        rejected: parsed.rejected,
        targets,
      },
      kb,
    ),
  );
}

export async function handleIncomingDocument(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const doc = ctx.message?.document;
  if (!doc) return;
  if (jobStore.blockingJob(from.id)) {
    await ctx.reply(`⏳ ${stylize("a check is already running — wait for it to finish")}`);
    return;
  }
  const maxBytes = config.maxFileMb * 1024 * 1024;
  if (doc.file_size !== undefined && doc.file_size > maxBytes) {
    await deps.sender.sendScreen(
      ctx,
      errorScreen(`⚠ ${stylize("file too big")} — ${config.maxFileMb} ${stylize("mb max (telegram bot limit)")}`),
    );
    return;
  }
  let buf: Buffer;
  try {
    buf = await downloadFile(doc.file_id, maxBytes);
  } catch (err) {
    await deps.sender.sendScreen(
      ctx,
      errorScreen(`⚠ ${stylize("could not download the file")}: ${(err as Error).message}`),
    );
    return;
  }
  await prepareParseReport(ctx, deps, buf.toString("utf8"), doc.file_name, doc.file_size);
}

export async function handleIncomingText(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  const text = ctx.message?.text ?? "";
  const state = getState(from.id);

  if (state === "awaiting_set_urls") return await consumeSetUrls(ctx, deps);
  if (state === "awaiting_remove") return await consumeRemove(ctx, deps);

  if (state === "awaiting_broadcast") {
    setState(from.id, "idle");
    return await executeBroadcast(ctx, deps, text);
  }
  if (state === "awaiting_user_lookup") {
    setState(from.id, "idle");
    return await handleAdminUserDetail(ctx, deps, text.trim());
  }
  if (state === "awaiting_dm_text") {
    const data = getStateData(from.id);
    setState(from.id, "idle");
    if (data?.targetUserId) {
      return await handleAdminDirectMessage(ctx, deps, data.targetUserId, text);
    }
  }

  if (looksLikeProxyList(text)) {
    if (jobStore.blockingJob(from.id)) {
      await ctx.reply(`⏳ ${stylize("a check is already running — wait for it to finish")}`);
      return;
    }
    await prepareParseReport(ctx, deps, text);
    return;
  }
  // anything else → welcome
  await showWelcome(ctx, deps);
}

/* ─────────────────────────── check execution ─────────────────────────── */

async function resolveTargets(userId: number): Promise<{ targets: TargetUrl[]; dropped: string[] }> {
  const urls = getUrls(userId);
  const targets: TargetUrl[] = [];
  const dropped: string[] = [];
  for (const u of urls) {
    const v = await validateTargetUrl(u);
    if (v.ok && v.target) targets.push(v.target);
    else dropped.push(`${u} — ${v.error ?? "invalid"}`);
  }
  return { targets, dropped };
}

async function beginCheck(ctx: Context, deps: Deps, job: Job, targets: TargetUrl[]): Promise<void> {
  const from = user(ctx);
  if (jobStore.blockingJob(from.id)) {
    await ctx.reply(`⏳ ${stylize("a check is already running — wait for it to finish")}`);
    return;
  }
  if (dailyJobCount(from.id) >= config.dailyJobsPerUser) {
    await deps.sender.sendScreen(
      ctx,
      errorScreen(`⛔ ${stylize("daily limit reached")} (${config.dailyJobsPerUser} ${stylize("jobs/day")})`),
    );
    return;
  }
  job.targets = targets;
  if (jobStore.tryStart(job)) {
    void executeJob(deps, job, job.userId);
  } else {
    const pos = jobStore.queue(job);
    await deps.sender.sendScreen(ctx, queuedScreen(pos));
  }
}

async function executeJob(deps: Deps, job: Job, chatId: number): Promise<void> {
  const { bot, sender } = deps;
  const total = job.entries.length * job.targets.length;
  const streamer = new ProgressStreamer(
    bot,
    sender,
    chatId,
    job.userId,
    job.targets.map((t) => ({ display: t.display })),
    total,
  );
  job.abort = new AbortController();
  jobStore.setDraft(job, streamer.draftId);
  job.dbJobId = startJob(job.userId, job.entries.length);

  try {
    await streamer.start();
    const result = await runJob(job.entries, job.targets, {
      signal: job.abort.signal,
      onProgress: (s) => {
        streamer.update({
          done: s.done,
          hits: s.hits,
          perTargetHits: Object.fromEntries(
            job.targets.map((t) => [t.display, s.perTargetHits.get(t.url) ?? 0]),
          ),
          startedAt: s.startedAt,
        });
      },
    });
    await streamer.finish();

    if (job.abort.signal.aborted) {
      finishJob(job.dbJobId, 0, "cancelled");
      jobStore.finish(job, "cancelled");
      await sender.sendTo(chatId, cancelledScreen(backKb()));
      return;
    }

    const files = buildResultFiles(result, job.targets);
    const totalHits = result.allHits.length;
    const summary = {
      targets: job.targets.map((t, i) => ({
        display: t.display,
        file: files[i]?.name ?? "",
        hits: files[i] ? files[i].content.split("\n").filter(Boolean).length : 0,
      })),
      totalHits,
      durationMs: result.durationMs,
      tested: job.entries.length,
    };

    if (totalHits > 0) {
      await sender.sendTo(chatId, resultScreen(img("results.jpg"), summary, resultKb()));
      for (const f of files) {
        if (!f.content) continue;
        await bot.api.sendDocument(
          chatId,
          new InputFile(Buffer.from(f.content, "utf8"), f.name),
        );
        await sleep(1_050); // stay under 1 msg/s
      }
    } else {
      await sender.sendTo(chatId, noHitsScreen(img("results.jpg"), summary, resultKb()));
    }

    finishJob(job.dbJobId, totalHits, "done");
    bumpUserStats(job.userId, 1, job.entries.length);
    jobStore.finish(job, "done");
  } catch (err) {
    console.error(`[job ${job.id}] failed:`, err);
    try {
      await streamer.finish();
      await sender.sendTo(chatId, errorScreen(`⚠ ${stylize("check crashed — try again later")}`));
    } catch {
      /* last chance */
    }
    finishJob(job.dbJobId, 0, "error");
    jobStore.finish(job, "error");
  } finally {
    jobStore.sweep();
    const next = jobStore.nextJob();
    if (next) void executeJob(deps, next, next.userId);
  }
}

export async function handleCheckCallback(ctx: Context, deps: Deps, jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job || job.userId !== user(ctx).id || job.status !== "parsed") {
    await ctx.answerCallbackQuery({ text: stylize("expired — send the list again"), show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  const { targets, dropped } = await resolveTargets(job.userId);
  if (targets.length === 0) {
    await deps.sender.sendScreen(
      ctx,
      errorScreen(`⚠ ${stylize("no usable target urls")}${dropped.length ? `:\n${dropped.map((d) => "✕ " + d).join("\n")}` : " — set some first"}`),
    );
    return;
  }
  if (dropped.length > 0) {
    await ctx.reply(`${stylize("skipped invalid urls")}:\n${dropped.map((d) => "✕ " + d).join("\n")}`);
  }
  await beginCheck(ctx, deps, job, targets);
}

export async function handleSkipCallback(ctx: Context, deps: Deps, jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job || job.userId !== user(ctx).id || job.status !== "parsed") {
    await ctx.answerCallbackQuery({ text: stylize("expired — send the list again"), show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  const v = await validateTargetUrl(config.defaultTargetUrl);
  if (!v.ok || !v.target) {
    await deps.sender.sendScreen(ctx, errorScreen(`⚠ ${stylize("default target unreachable")}`));
    return;
  }
  await beginCheck(ctx, deps, job, [v.target]);
}

/** User pressed the native Stop button on a rich draft. */
export function handleStoppedGeneration(deps: Deps, chatId: string, draftId: number): void {
  const job = jobStore.byDraft(draftId);
  if (job && job.status === "running" && String(job.userId) === chatId) {
    job.abort?.abort();
    void deps.bot
      .api.sendMessage(chatId, `⏹ ${stylize("stopping — finalizing…")}`)
      .catch(() => {});
  }
}

/* ─────────────────────────── back ─────────────────────────── */

export async function handleBack(ctx: Context, deps: Deps): Promise<void> {
  const from = user(ctx);
  setState(from.id, "idle");
  const isAdm = isAdmin(from.id);
  const screen = welcomeScreen(img("welcome.jpg"), mainMenuKb(isAdm));
  if (ctx.callbackQuery) {
    await deps.sender.morph(ctx, screen, { id: ctx.callbackQuery.id, from });
  } else {
    await deps.sender.sendScreen(ctx, screen);
  }
}
