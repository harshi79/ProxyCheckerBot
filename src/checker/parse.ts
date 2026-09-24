/**
 * Permissive proxy parser. It accepts common URL, host:port, protocol-suffix,
 * and host:port username password forms while preserving each original line.
 */
import type { ParseResult, ProxyEntry, ProxyProto } from "./types.js";

const URL_RE = /^(?:(socks(?:4a?|5h?)?|sockss|http|https):\/\/)?(?:(\S+?)(?::([^@\s]*))?@)?(\[[^\]]+\]|[^\s:/]+)(?::(\d{1,5}))?(?:\/(4a?|5h?|socks4a?|socks5|http|https))?(?:\s+(\S+)(?:\s+(\S+))?)?$/i;
const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function normalizeHost(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host || host.length > 255) return null;
  const v4 = V4_RE.exec(host);
  if (v4) {
    for (let i = 1; i <= 4; i += 1) {
      const part = Number(v4[i]);
      if (!Number.isInteger(part) || part < 0 || part > 255) return null;
    }
    return host;
  }
  if (host.includes(":")) {
    return /^[0-9a-f:]+$/i.test(host) && !host.includes("..") ? host : null;
  }
  return /^[a-z0-9.-]+$/i.test(host) && !host.startsWith(".") && !host.endsWith(".") ? host : null;
}

function protocol(token: string | undefined): ProxyProto | null {
  if (!token) return null;
  switch (token.toLowerCase()) {
    case "http":
    case "https":
      return "http";
    case "5":
    case "socks5":
    case "socks5h":
    case "sockss":
    case "socks":
      return "socks5";
    case "4":
    case "4a":
    case "socks4":
    case "socks4a":
      return "socks4";
    default:
      return null;
  }
}

function makeEntry(
  raw: string,
  hostToken: string,
  portToken: string | undefined,
  protoToken?: string,
  user?: string,
  pass?: string,
): ProxyEntry | null {
  const host = normalizeHost(hostToken);
  if (!host) return null;
  const proto = protocol(protoToken) ?? "auto";
  const port = Number(portToken ?? (proto === "http" ? 80 : proto === "socks5" || proto === "socks4" ? 1080 : 0));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const entry: ProxyEntry = { raw, host, port, proto };
  if (user !== undefined) {
    entry.user = user;
    entry.pass = pass ?? "";
  }
  return entry;
}

function parseLine(line: string): ProxyEntry | null {
  const match = URL_RE.exec(line);
  if (match) {
    const [, protoToken, urlUser, urlPass, hostToken, portToken, suffix, bareUser, barePass] = match;
    let user = urlUser ?? bareUser;
    let pass = urlUser !== undefined ? (urlPass ?? "") : barePass;
    if (urlUser === undefined && bareUser !== undefined && barePass === undefined && bareUser.includes(":")) {
      const separator = bareUser.indexOf(":");
      user = bareUser.slice(0, separator);
      pass = bareUser.slice(separator + 1);
    }
    return makeEntry(line, hostToken ?? "", portToken, protoToken ?? suffix, user, pass);
  }

  // Common export formats: host port [user pass], host:port:user:pass,
  // and pipe/comma/semicolon-delimited columns.
  const columns = line.split(/[|,;\t]/).map((part) => part.trim()).filter(Boolean);
  if (columns.length >= 2 && columns.length <= 4) {
    const hostPort = columns[0]?.match(/^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/);
    if (hostPort && /^\d{1,5}$/.test(columns[1] ?? "")) {
      return makeEntry(line, hostPort[1] ?? "", hostPort[2] ?? columns[1], undefined, columns[2], columns[3]);
    }
    if (hostPort && hostPort[2] && columns[1]) {
      return makeEntry(line, hostPort[1] ?? "", hostPort[2], undefined, columns[1], columns[2]);
    }
  }

  const colon = line.split(":");
  if (colon.length === 4 && /^\d{1,5}$/.test(colon[1] ?? "")) {
    return makeEntry(line, colon[0] ?? "", colon[1], undefined, colon[2], colon[3]);
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 4 && /^\d{1,5}$/.test(words[1] ?? "")) {
    return makeEntry(line, words[0] ?? "", words[1], undefined, words[2], words[3]);
  }
  return null;
}

export interface ParseOptions {
  maxLines?: number;
}

export function parseProxies(text: string, opts: ParseOptions = {}): ParseResult {
  const maxLines = opts.maxLines ?? Number.MAX_SAFE_INTEGER;
  const entries: ProxyEntry[] = [];
  const seen = new Set<string>();
  const counts = { http: 0, socks4: 0, socks5: 0, auto: 0 };
  let rejected = 0;
  let totalLines = 0;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)) {
    if (totalLines >= maxLines) break;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    totalLines += 1;
    const entry = parseLine(line);
    if (!entry) {
      rejected += 1;
      continue;
    }
    const key = `${entry.proto}:${entry.host}:${entry.port}:${entry.user ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    counts[entry.proto] += 1;
  }

  return { entries, counts, rejected, totalLines };
}

export function looksLikeProxyList(text: string): boolean {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean).slice(0, 10);
  if (lines.length === 0) return false;
  const parsed = lines.filter((line) => parseLine(line) !== null);
  return parsed.length / lines.length >= 0.5;
}
