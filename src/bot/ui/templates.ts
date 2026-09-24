/**
 * All message templates. Every screen has:
 *  - rich markdown (rich clients: images embedded, native buttons)
 *  - plain HTML (legacy clients: photo sent separately)
 *  - optional keyboard
 *  - optional image asset
 */
import { InlineKeyboard } from "grammy";
import { config } from "../../config.js";
import type { AdminMetrics, UserRow } from "../../store/db.js";
import { stylize, header, groupNum, humanBytes, humanMs } from "../../util/stylize.js";
import type { ScreenImage } from "./images.js";

export interface Screen {
  image?: ScreenImage;
  rich: string;
  /** HTML for the legacy fallback path (no media refs). */
  plain: string;
  kb?: InlineKeyboard;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(ts: number): string {
  if (!ts) return "never";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").substring(0, 16);
}

function timeAgo(ts: number): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ─────────────────────────── welcome ─────────────────────────── */

export function welcomeScreen(img: ScreenImage | undefined, kb?: InlineKeyboard): Screen {
  const rich =
    `${img ? `${img.markdown}\n\n` : ""}` +
    `**${header("yori proxy checker")}**\n\n` +
    `⚡ ${stylize("fast")} · ${stylize("stealth")} · ${stylize("free")}\n\n` +
    `${stylize("send me your proxy list (any format — file or text)")}\n` +
    `${stylize("i test every single proxy and return only the hits")}\n\n` +
    `> ${stylize("checks run against your saved urls (max 5) or a universal default")}`;
  const plain =
    `<b>${esc(header("yori proxy checker"))}</b>\n\n` +
    `⚡ ${esc(stylize("fast"))} · ${esc(stylize("stealth"))} · ${esc(stylize("free"))}\n\n` +
    `${esc(stylize("send me your proxy list (any format — file or text)"))}\n` +
    `${esc(stylize("i test every single proxy and return only the hits"))}\n\n` +
    `${esc(stylize("checks run against your saved urls (max 5) or a universal default"))}`;
  return { image: img, rich, plain, kb };
}

/* ─────────────────────────── developer ─────────────────────────── */

export function developerScreen(img: ScreenImage | undefined, kb: InlineKeyboard): Screen {
  const rich =
    `${img ? `${img.markdown}\n\n` : ""}` +
    `**${header("developer")}**\n\n` +
    `${stylize("the mind behind the bot")}`;
  const plain = `<b>${esc(header("developer"))}</b>\n\n${esc(stylize("the mind behind the bot"))}`;
  return { image: img, rich, plain, kb };
}

/* ─────────────────────────── profile ─────────────────────────── */

export interface ProfileData {
  name: string;
  username?: string;
  id: number;
  isBot: boolean;
  bio?: string;
  checksDone: number;
  proxiesTested: number;
}

export function profileScreen(img: ScreenImage | undefined, p: ProfileData): Screen {
  const name = p.name || stylize("unknown");
  const uname = p.username ? `@${p.username}` : stylize("none");
  const type = p.isBot ? stylize("bot") : stylize("human");
  const bio = p.bio ? p.bio : stylize("none");
  const rows = [
    `[↯] ${stylize("name")} ➣ ${name} 𓁺`,
    `[↯] ${stylize("username")} ➣ ${uname}`,
    `[↯] ${stylize("id")} ➣ \`${String(p.id)}\``,
    `[↯] ${stylize("type")} ➣ ${type}`,
    `[↯] ${stylize("bio")} ➣ ${bio} ゟ`,
  ];
  const stats = `──\n${stylize("checks run")} ➣ ${groupNum(p.checksDone)}   ${stylize("proxies seen")} ➣ ${groupNum(p.proxiesTested)}`;
  const rich =
    `${img ? `${img.markdown}\n\n` : ""}` +
    `**${header("user information")}**\n\n` +
    rows.join("\n") +
    `\n\n${stats}`;
  const plain =
    `<b>${esc(header("user information"))}</b>\n\n` +
    rows.map((r) => esc(r).replace(/\`([^\`]*)\`/g, "<code>$1</code>")).join("\n") +
    `\n\n${esc(stats)}`;
  return { image: img, rich, plain };
}

/* ─────────────────────────── manage urls ─────────────────────────── */

export function manageUrlsScreen(img: ScreenImage | undefined, urls: string[], kb: InlineKeyboard): Screen {
  const count = `${urls.length} / 5`;
  const list = urls.length
    ? urls.map((u) => `› ${u}`).join("\n")
    : `▸ ${stylize("none stored yet")}`;
  const rich =
    `${img ? `${img.markdown}\n\n` : ""}` +
    `**${header("manage urls")}**\n\n` +
    `${stylize("the sites your proxies get tested against")}\n\n` +
    `${stylize("stored")}: ${count}\n${list}`;
  const plain =
    `<b>${esc(header("manage urls"))}</b>\n\n` +
    `${esc(stylize("the sites your proxies get tested against"))}\n\n` +
    `${esc(stylize("stored"))}: ${count}\n${esc(list)}`;
  return { image: img, rich, plain, kb };
}

export function setUrlsPrompt(img: ScreenImage | undefined, max: number, kb: InlineKeyboard): Screen {
  const text =
    `📥 ${stylize("send me up to")} ${max} ${stylize("urls — one per line")}\n\n` +
    `${stylize("example")}\n\`\`\`\nhttps://yourproxies.com\nhttps://another.site/page\n\`\`\``;
  const rich = (img ? `${img.markdown}\n\n` : "") + text;
  const plain = text;
  return { image: img, rich, plain, kb };
}

export function manageActionsScreen(img: ScreenImage | undefined, urls: string[], kb: InlineKeyboard): Screen {
  const list = urls.length ? urls.map((u) => `› ${u}`).join("\n") : `▸ ${stylize("nothing stored")}`;
  const rich =
    `${img ? `${img.markdown}\n\n` : ""}` +
    `**${header("manage")}**\n\n` +
    list +
    `\n\n${stylize("remove one url or clear everything")}`;
  const plain =
    `<b>${esc(header("manage"))}</b>\n\n${esc(list)}\n\n${esc(stylize("remove one url or clear everything"))}`;
  return { image: img, rich, plain, kb };
}

export function removePrompt(img: ScreenImage | undefined, kb: InlineKeyboard): Screen {
  const text = `🗑 ${stylize("send the url to remove")}\n\n${stylize("send")} \`0\` ${stylize("to clear all")}`;
  const rich = (img ? `${img.markdown}\n\n` : "") + text;
  const plain = text;
  return { image: img, rich, plain, kb };
}

/* ─────────────────────────── parse report ─────────────────────────── */

export interface ParseReportData {
  fileName?: string;
  fileSize?: number;
  lines: number;
  counts: { http: number; socks4: number; socks5: number; auto: number };
  rejected: number;
  targets: string[];
}

export function parseReportScreen(d: ParseReportData, kb: InlineKeyboard): Screen {
  const src =
    d.fileName === undefined
      ? `${stylize("source")}: ${stylize("text message")}`
      : `📄 ${d.fileName} ${d.fileSize !== undefined ? `(${humanBytes(d.fileSize)})` : ""}`;
  const rich =
    `**${header("proxies loaded")}**\n\n` +
    `${src}\n` +
    `📊 ${stylize("lines")} ➣ ${groupNum(d.lines)}\n\n` +
    `| ${stylize("type")} | ${stylize("count")} |\n` +
    `|:---|---:|\n` +
    `| ${stylize("http")} | ${groupNum(d.counts.http)} |\n` +
    `| ${stylize("socks4")} | ${groupNum(d.counts.socks4)} |\n` +
    `| ${stylize("socks5")} | ${groupNum(d.counts.socks5)} |\n` +
    `| ${stylize("auto-detect")} | ${groupNum(d.counts.auto)} |\n` +
    `| ${stylize("rejected")} | ${groupNum(d.rejected)} |\n\n` +
    `🎯 ${stylize("check targets")}:\n` +
    d.targets.map((t) => `› ${t}`).join("\n");
  const plain =
    `<b>${esc(header("proxies loaded"))}</b>\n\n` +
    `${esc(src)}\n` +
    `📊 ${esc(stylize("lines"))} ➣ ${groupNum(d.lines)}\n\n` +
    `${esc(stylize("http"))}: ${groupNum(d.counts.http)} · ` +
    `${esc(stylize("socks4"))}: ${groupNum(d.counts.socks4)} · ` +
    `${esc(stylize("socks5"))}: ${groupNum(d.counts.socks5)} · ` +
    `${esc(stylize("auto"))}: ${groupNum(d.counts.auto)} · ` +
    `${esc(stylize("rejected"))}: ${groupNum(d.rejected)}\n\n` +
    `🎯 ${esc(stylize("check targets"))}:\n${esc(d.targets.map((t) => "› " + t).join("\n"))}`;
  return { rich, plain, kb };
}

/* ─────────────────────────── progress (variant B) ─────────────────────────── */

const SPINNER = ["⠋", "⠙", "⠏", "⠟", "⠗", "⠎"];

export interface ProgressData {
  total: number;
  done: number;
  hits: number;
  startedAt: number;
  now: number;
  targets: Array<{ display: string; done: number; hits: number }>;
}

function bar(pct: number, width = 10): string {
  const filled = Math.round((pct / 100) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/**
 * Variant B: one row per target URL with live hit counts.
 * Output is plain markdown — valid on both the rich and legacy paths.
 */
export function progressScreen(d: ProgressData, spinIndex: number): string {
  const pct = d.total === 0 ? 0 : Math.floor((d.done / d.total) * 100);
  const elapsed = d.now - d.startedAt;
  const rate = elapsed > 0 ? d.done / (elapsed / 1000) : 0;
  const remain = rate > 0 ? (d.total - d.done) / rate : 0;
  const tPct = d.total === 0 || d.targets.length === 0 ? 0 : Math.floor((d.done / d.total) * 100);
  const tRows = d.targets
    .map((t) => {
      const short = t.display.length > 26 ? t.display.slice(0, 23) + "…" : t.display;
      const tbar = bar(tPct, 6);
      return `▸ ${tbar} ${short} · ${groupNum(t.hits)} ✓`;
    })
    .join("\n");
  const foot =
    `────\n` +
    `✅ ${stylize("hits")} ${groupNum(d.hits)}   ` +
    `⏳ ${groupNum(d.done)}/${groupNum(d.total)}   ` +
    `⏱ ${humanMs(elapsed)}` +
    (rate > 0 ? ` · ${stylize("eta")} ${humanMs(remain * 1000)}` : "");
  const head = `${SPINNER[spinIndex % SPINNER.length]} ⟨ ${stylize("proxy hunter")} ⟩\n` + bar(pct) + ` ${pct}%`;
  return `${head}\n${tRows}\n${foot}`;
}

/* ─────────────────────────── results ─────────────────────────── */

export interface ResultData {
  targets: Array<{ display: string; file: string; hits: number }>;
  totalHits: number;
  durationMs: number;
  tested: number;
}

export function resultScreen(img: ScreenImage | undefined, d: ResultData, kb: InlineKeyboard): Screen {
  const rows = d.targets
    .map((t) => `› ${t.display}   ✅ ${groupNum(t.hits)} ${stylize(t.hits === 1 ? "hit" : "hits")}   \`${t.file}\``)
    .join("\n");
  const rich =
    `${img ? `${img.markdown}\n\n` : ""}` +
    `**${header("check complete")}**\n\n` +
    `⏱ ${humanMs(d.durationMs)} · ${groupNum(d.tested)} ${stylize("proxies tested")}\n\n` +
    rows +
    `\n\n**${stylize("total unique hits")}: ${groupNum(d.totalHits)}**`;
  const plain =
    `<b>${esc(header("check complete"))}</b>\n\n` +
    `⏱ ${humanMs(d.durationMs)} · ${groupNum(d.tested)} ${esc(stylize("proxies tested"))}\n\n` +
    d.targets.map((t) => esc(`› ${t.display}   ✅ ${groupNum(t.hits)} ${stylize(t.hits === 1 ? "hit" : "hits")}   \`${t.file}\``).replace(/\`([^\`]*)\`/g, "<code>$1</code>")).join("\n") +
    `\n\n<b>${esc(stylize("total unique hits"))}: ${groupNum(d.totalHits)}</b>`;
  return { image: img, rich, plain, kb };
}

export function noHitsScreen(img: ScreenImage | undefined, d: ResultData, kb: InlineKeyboard): Screen {
  const text =
    `**${header("no hits found")}**\n\n` +
    `${groupNum(d.tested)} ${stylize("proxies tested against")}:\n` +
    d.targets.map((t) => `› ${t.display}`).join("\n") +
    `\n\n${stylize("the list may be stale, or those sites block datacenter exits")}`;
  const plain =
    `<b>${esc(header("no hits found"))}</b>\n\n` +
    `${groupNum(d.tested)} ${esc(stylize("proxies tested against"))}:\n${esc(d.targets.map((t) => "› " + t.display).join("\n"))}\n\n` +
    `${esc(stylize("the list may be stale, or those sites block datacenter exits"))}`;
  return { image: img, rich: text, plain, kb };
}

export function cancelledScreen(kb: InlineKeyboard): Screen {
  const text = `⏹ ${header("job cancelled")}\n\n${stylize("checking stopped — nothing was saved")}`;
  return { rich: text, plain: text, kb };
}

export function queuedScreen(pos: number): Screen {
  const text = `⏸ ${header("queued")}\n\n${stylize("your check starts when a slot frees up — position")} ${pos}`;
  return { rich: text, plain: text };
}

export function errorScreen(message: string): Screen {
  const text = `⚠ ${header("error")}\n\n${message}`;
  return { rich: text, plain: esc(text) };
}

/* ─────────────────────────── admin screens ─────────────────────────── */

export interface AdminDashboardData {
  metrics: AdminMetrics;
  queue: { running: number; queued: number };
  maintenance: boolean;
  botMode: string;
}

export function adminDashboardScreen(d: AdminDashboardData, kb: InlineKeyboard): Screen {
  const m = d.metrics;
  const maintStatus = d.maintenance
    ? `⛔ ${stylize("enabled (users blocked)")}`
    : `✅ ${stylize("disabled (open)")}`;

  const rich =
    `**${header("admin console")}**\n\n` +
    `👑 ${stylize("owner")} ➣ \`${config.ownerId}\`\n` +
    `⚡ ${stylize("system")} ➣ ${d.botMode}\n` +
    `🚧 ${stylize("maintenance")} ➣ ${maintStatus}\n\n` +
    `| ${stylize("telemetry")} | ${stylize("metric")} |\n` +
    `|:---|---:|\n` +
    `| ${stylize("total users")} | ${groupNum(m.totalUsers)} |\n` +
    `| ${stylize("active 24h")} | ${groupNum(m.active24h)} |\n` +
    `| ${stylize("banned users")} | ${groupNum(m.bannedUsers)} |\n` +
    `| ${stylize("admin team")} | ${groupNum(m.adminUsers)} |\n` +
    `| ${stylize("checks completed")} | ${groupNum(m.totalJobs)} |\n` +
    `| ${stylize("proxies tested")} | ${groupNum(m.totalProxiesTested)} |\n` +
    `| ${stylize("active jobs")} | ${d.queue.running} / ${config.maxRunningJobs} |\n` +
    `| ${stylize("queued jobs")} | ${d.queue.queued} |\n\n` +
    `> ${stylize("tap buttons below to manage users, toggle maintenance, or run broadcasts.")}`;

  const plain =
    `<b>${esc(header("admin console"))}</b>\n\n` +
    `👑 ${esc(stylize("owner"))} ➣ <code>${config.ownerId}</code>\n` +
    `⚡ ${esc(stylize("system"))} ➣ ${esc(d.botMode)}\n` +
    `🚧 ${esc(stylize("maintenance"))} ➣ ${esc(maintStatus)}\n\n` +
    `👥 ${esc(stylize("users"))}: ${groupNum(m.totalUsers)} · ` +
    `⚡ ${esc(stylize("active 24h"))}: ${groupNum(m.active24h)} · ` +
    `⛔ ${esc(stylize("banned"))}: ${groupNum(m.bannedUsers)}\n` +
    `📊 ${esc(stylize("checks"))}: ${groupNum(m.totalJobs)} · ` +
    `🌐 ${esc(stylize("proxies"))}: ${groupNum(m.totalProxiesTested)}\n` +
    `⏳ ${esc(stylize("jobs running"))}: ${d.queue.running}/${config.maxRunningJobs} · ` +
    `큐 ${esc(stylize("queued"))}: ${d.queue.queued}\n\n` +
    `<i>${esc(stylize("tap buttons below to manage users, toggle maintenance, or run broadcasts."))}</i>`;

  return { rich, plain, kb };
}

export interface AdminDetailedStats {
  uptimeSec: number;
  nodeVersion: string;
  memory: { rss: number; heapTotal: number; heapUsed: number };
  dbBytes: number;
  queue: { running: number; queued: number; total: number };
  limits: { maxRunning: number; jobConcurrency: number; globalConcurrency: number };
}

export function adminStatsScreen(s: AdminDetailedStats, kb: InlineKeyboard): Screen {
  const uptime = humanMs(s.uptimeSec * 1000);
  const rich =
    `**${header("system telemetry")}**\n\n` +
    `| ${stylize("component")} | ${stylize("status / value")} |\n` +
    `|:---|---:|\n` +
    `| ${stylize("process uptime")} | ${uptime} |\n` +
    `| ${stylize("node runtime")} | ${s.nodeVersion} |\n` +
    `| ${stylize("memory rss")} | ${humanBytes(s.memory.rss)} |\n` +
    `| ${stylize("heap used")} | ${humanBytes(s.memory.heapUsed)} / ${humanBytes(s.memory.heapTotal)} |\n` +
    `| ${stylize("database size")} | ${humanBytes(s.dbBytes)} |\n` +
    `| ${stylize("running jobs")} | ${s.queue.running} / ${s.limits.maxRunning} |\n` +
    `| ${stylize("queued jobs")} | ${s.queue.queued} |\n` +
    `| ${stylize("job concurrency")} | ${s.limits.jobConcurrency} |\n` +
    `| ${stylize("global concurrency")} | ${s.limits.globalConcurrency} |\n\n` +
    `> ${stylize("real-time memory and engine diagnostics")}`;

  const plain =
    `<b>${esc(header("system telemetry"))}</b>\n\n` +
    `⏱ ${esc(stylize("process uptime"))}: ${uptime}\n` +
    `⚙ ${esc(stylize("node runtime"))}: ${esc(s.nodeVersion)}\n` +
    `🧠 ${esc(stylize("memory rss"))}: ${humanBytes(s.memory.rss)} (Heap: ${humanBytes(s.memory.heapUsed)}/${humanBytes(s.memory.heapTotal)})\n` +
    `💾 ${esc(stylize("database size"))}: ${humanBytes(s.dbBytes)}\n` +
    `⚡ ${esc(stylize("running jobs"))}: ${s.queue.running}/${s.limits.maxRunning} (Queued: ${s.queue.queued})\n` +
    `🌐 ${esc(stylize("concurrency"))}: ${s.limits.jobConcurrency} job / ${s.limits.globalConcurrency} global`;

  return { rich, plain, kb };
}

export function adminUsersListScreen(
  users: UserRow[],
  page: number,
  totalPages: number,
  totalUsers: number,
  kb: InlineKeyboard,
): Screen {
  const head =
    `**${header("user directory")}**\n\n` +
    `📖 ${stylize("page")} ${page} / ${totalPages} · ${stylize("total users")}: ${groupNum(totalUsers)}\n\n`;

  const rowsRich = users
    .map((u, i) => {
      const num = (page - 1) * 6 + i + 1;
      const name = u.name ? u.name : stylize("anonymous");
      const uname = u.username ? ` (@${u.username})` : "";
      const badge = u.banned
        ? ` ⛔ ${stylize("banned")}`
        : u.is_admin
        ? ` 👑 ${stylize("admin")}`
        : "";
      return (
        `**${num}.** ${name}${uname} — \`${u.id}\`${badge}\n` +
        `   ↳ 📊 ${groupNum(u.checks_done)} ${stylize("checks")} · 🌐 ${groupNum(u.proxies_tested)} · ⏱ ${timeAgo(u.last_seen_at)}`
      );
    })
    .join("\n\n");

  const rich =
    head +
    (users.length ? rowsRich : `▸ ${stylize("no users found")}`) +
    `\n\n> ${stylize("select a user below to inspect, ban, or message")}`;

  const headPlain =
    `<b>${esc(header("user directory"))}</b>\n\n` +
    `📖 ${esc(stylize("page"))} ${page} / ${totalPages} · ${esc(stylize("total users"))}: ${groupNum(totalUsers)}\n\n`;

  const rowsPlain = users
    .map((u, i) => {
      const num = (page - 1) * 6 + i + 1;
      const name = u.name ? esc(u.name) : esc(stylize("anonymous"));
      const uname = u.username ? ` (@${esc(u.username)})` : "";
      const badge = u.banned
        ? ` ⛔ ${esc(stylize("banned"))}`
        : u.is_admin
        ? ` 👑 ${esc(stylize("admin"))}`
        : "";
      return (
        `<b>${num}.</b> ${name}${uname} — <code>${u.id}</code>${badge}\n` +
        `   ↳ 📊 ${groupNum(u.checks_done)} ${esc(stylize("checks"))} · 🌐 ${groupNum(u.proxies_tested)} · ⏱ ${timeAgo(u.last_seen_at)}`
      );
    })
    .join("\n\n");

  const plain = headPlain + (users.length ? rowsPlain : `▸ ${esc(stylize("no users found"))}`);

  return { rich, plain, kb };
}

export function adminUserDetailScreen(
  targetUser: UserRow,
  urls: string[],
  isOwnerUser: boolean,
  kb: InlineKeyboard,
): Screen {
  const name = targetUser.name || stylize("unknown");
  const uname = targetUser.username ? `@${targetUser.username}` : stylize("none");
  const role = isOwnerUser
    ? `👑 ${stylize("owner")}`
    : targetUser.is_admin
    ? `🛡 ${stylize("admin")}`
    : `👤 ${stylize("user")}`;
  const status = targetUser.banned
    ? `⛔ ${stylize("banned")}${targetUser.ban_reason ? ` (${targetUser.ban_reason})` : ""}`
    : `✅ ${stylize("active")}`;

  const urlList = urls.length
    ? urls.map((u) => `› ${u}`).join("\n")
    : `▸ ${stylize("none stored")}`;

  const rows = [
    `[↯] ${stylize("name")} ➣ ${name} 𓁺`,
    `[↯] ${stylize("username")} ➣ ${uname}`,
    `[↯] ${stylize("id")} ➣ \`${targetUser.id}\``,
    `[↯] ${stylize("role")} ➣ ${role}`,
    `[↯] ${stylize("status")} ➣ ${status}`,
    `[↯] ${stylize("joined")} ➣ ${formatDate(targetUser.created_at)}`,
    `[↯] ${stylize("last seen")} ➣ ${timeAgo(targetUser.last_seen_at)} (${formatDate(targetUser.last_seen_at)})`,
    `[↯] ${stylize("checks done")} ➣ ${groupNum(targetUser.checks_done)}`,
    `[↯] ${stylize("proxies tested")} ➣ ${groupNum(targetUser.proxies_tested)}`,
  ];

  const rich =
    `**${header("user inspection")}**\n\n` +
    rows.join("\n") +
    `\n\n**${stylize("saved urls")} (${urls.length}/5)**:\n${urlList}`;

  const plain =
    `<b>${esc(header("user inspection"))}</b>\n\n` +
    rows.map((r) => esc(r).replace(/\`([^\`]*)\`/g, "<code>$1</code>")).join("\n") +
    `\n\n<b>${esc(stylize("saved urls"))} (${urls.length}/5)</b>:\n${esc(urlList)}`;

  return { rich, plain, kb };
}

export function adminHelpScreen(kb: InlineKeyboard): Screen {
  const text =
    `**${header("admin commands guide")}**\n\n` +
    `👑 **${stylize("management commands")}**:\n` +
    `• \`/admin\` — ${stylize("open admin control dashboard")}\n` +
    `• \`/users [page]\` — ${stylize("browse paginated user directory")}\n` +
    `• \`/user <id|@username>\` — ${stylize("inspect user profile & manage")}\n` +
    `• \`/ban <id|@username> [reason]\` — ${stylize("ban user from using the bot")}\n` +
    `• \`/unban <id|@username>\` — ${stylize("restore user access")}\n` +
    `• \`/clearurls <id|@username>\` — ${stylize("clear user's saved target urls")}\n` +
    `• \`/resetuser <id|@username>\` — ${stylize("reset user check & proxy counters")}\n` +
    `• \`/dm <id|@username> <msg>\` — ${stylize("send official bot direct message")}\n` +
    `• \`/broadcast <msg>\` — ${stylize("broadcast announcement with live stream")}\n` +
    `• \`/maintenance [on|off]\` — ${stylize("toggle maintenance mode")}\n` +
    `• \`/stats\` — ${stylize("view system and memory telemetry")}\n` +
    `• \`/backup\` — ${stylize("download database snapshot (owner only)")}\n` +
    `• \`/promote <id|@username>\` — ${stylize("promote secondary admin (owner)")}\n` +
    `• \`/demote <id|@username>\` — ${stylize("demote admin (owner)")}\n\n` +
    `> ${stylize("all actions take effect immediately across all active sessions.")}`;

  const plain =
    `<b>${esc(header("admin commands guide"))}</b>\n\n` +
    `👑 <b>${esc(stylize("management commands"))}</b>:\n` +
    `• <code>/admin</code> — ${esc(stylize("open admin control dashboard"))}\n` +
    `• <code>/users [page]</code> — ${esc(stylize("browse paginated user directory"))}\n` +
    `• <code>/user &lt;id|@username&gt;</code> — ${esc(stylize("inspect user profile & manage"))}\n` +
    `• <code>/ban &lt;id|@username&gt; [reason]</code> — ${esc(stylize("ban user from using the bot"))}\n` +
    `• <code>/unban &lt;id|@username&gt;</code> — ${esc(stylize("restore user access"))}\n` +
    `• <code>/clearurls &lt;id|@username&gt;</code> — ${esc(stylize("clear user's saved target urls"))}\n` +
    `• <code>/resetuser &lt;id|@username&gt;</code> — ${esc(stylize("reset user check & proxy counters"))}\n` +
    `• <code>/dm &lt;id|@username&gt; &lt;msg&gt;</code> — ${esc(stylize("send official bot direct message"))}\n` +
    `• <code>/broadcast &lt;msg&gt;</code> — ${esc(stylize("broadcast announcement with live stream"))}\n` +
    `• <code>/maintenance [on|off]</code> — ${esc(stylize("toggle maintenance mode"))}\n` +
    `• <code>/stats</code> — ${esc(stylize("view system and memory telemetry"))}\n` +
    `• <code>/backup</code> — ${esc(stylize("download database snapshot (owner only)"))}\n` +
    `• <code>/promote &lt;id|@username&gt;</code> — ${esc(stylize("promote secondary admin (owner)"))}\n` +
    `• <code>/demote &lt;id|@username&gt;</code> — ${esc(stylize("demote admin (owner)"))}`;

  return { rich: text, plain, kb };
}

export function broadcastPromptScreen(kb: InlineKeyboard): Screen {
  const text =
    `📢 **${header("broadcast announcement")}**\n\n` +
    `${stylize("send the message you want to broadcast to all registered users.")}\n\n` +
    `> ${stylize("text formatting (markdown / links) is supported.")}\n` +
    `> ${stylize("a live progress stream will show delivery status.")}`;
  return { rich: text, plain: text, kb };
}

export function broadcastReportScreen(
  total: number,
  delivered: number,
  failed: number,
  durationMs: number,
  kb: InlineKeyboard,
): Screen {
  const rich =
    `**${header("broadcast complete")}**\n\n` +
    `⏱ ${stylize("duration")} ➣ ${humanMs(durationMs)}\n` +
    `👥 ${stylize("total targets")} ➣ ${groupNum(total)}\n` +
    `✅ ${stylize("delivered")} ➣ ${groupNum(delivered)}\n` +
    `⛔ ${stylize("failed / blocked")} ➣ ${groupNum(failed)}\n\n` +
    `> ${stylize("broadcast report logged successfully.")}`;

  const plain =
    `<b>${esc(header("broadcast complete"))}</b>\n\n` +
    `⏱ ${esc(stylize("duration"))} ➣ ${humanMs(durationMs)}\n` +
    `👥 ${esc(stylize("total targets"))} ➣ ${groupNum(total)}\n` +
    `✅ ${esc(stylize("delivered"))} ➣ ${groupNum(delivered)}\n` +
    `⛔ ${esc(stylize("failed / blocked"))} ➣ ${groupNum(failed)}`;

  return { rich, plain, kb };
}

export function maintenanceScreen(): Screen {
  const text =
    `🚧 **${header("maintenance mode")}**\n\n` +
    `${stylize("the bot is currently undergoing scheduled system maintenance.")}\n` +
    `${stylize("proxy checking will resume shortly — please check back soon!")}`;
  return { rich: text, plain: text };
}

export function bannedScreen(reason?: string): Screen {
  const text =
    `⛔ **${header("access restricted")}**\n\n` +
    `${stylize("your account has been banned from using this bot.")}` +
    (reason ? `\n\n${stylize("reason")}: ${reason}` : "");
  return { rich: text, plain: text };
}
