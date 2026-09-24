/**
 * All message templates. Every screen has:
 *  - rich markdown (rich clients: images embedded, native buttons)
 *  - plain HTML (legacy clients: photo sent separately)
 *  - optional keyboard
 *  - optional image asset
 */
import { InlineKeyboard } from "grammy";
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
