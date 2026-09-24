/**
 * Target URL validation + SSRF guard.
 *
 * User-supplied target URLs must be public http/https URLs that resolve to
 * public addresses. Without this guard the bot is a free SSRF/scanning tool:
 * "set url http://169.254.169.254/latest/meta-data" would be a disaster.
 */
import dns from "node:dns/promises";
import net from "node:net";
import { TargetUrl } from "./types.js";

function v4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 255) return true; // 255.255.255.255
  return false;
}

function v6IsPrivate(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified / loopback
  const full = expandV6(lower);
  if (!full) return true;
  const mapped = full.match(/^0{20}(?:ffff)?([0-9a-f]{8})$/i);
  if (mapped?.[1]) {
    const hex = mapped[1];
    const ipv4 = [0, 2, 4, 6].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(".");
    return v4IsPrivate(ipv4);
  }
  const first = parseInt(full.slice(0, 4), 16);
  if ((first & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  return false;
}

function expandV6(ip: string): string | null {
  let head = ip;
  let tail = "";
  const zip = ip.indexOf("::");
  if (zip !== -1) {
    head = ip.slice(0, zip);
    tail = ip.slice(zip + 2);
    if (ip.indexOf("::", zip + 1) !== -1) return null;
  }
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (zip === -1) {
    if (headParts.length !== 8) return null;
  } else if (missing < 1) return null;
  const all = [
    ...headParts,
    ...Array.from({ length: missing }, () => "0"),
    ...tailParts,
  ];
  for (const p of all) {
    if (!/^[0-9a-f]{0,4}$/.test(p) || p.length > 4) return null;
  }
  return all.map((p) => (p === "" ? "0" : p).padStart(4, "0")).join("");
}

export function isPrivateIp(ip: string): boolean {
  const value = ip.replace(/^\[|\]$/g, "");
  const family = net.isIP(value);
  if (family === 4) return v4IsPrivate(value);
  if (family === 6) return v6IsPrivate(value);
  // Hostnames are not IP literals; their resolved addresses are checked by
  // validateTargetUrl before they are accepted as targets.
  return false;
}

export interface TargetValidation {
  ok: boolean;
  /** Reason for rejection (stylize-friendly English). */
  error?: string;
  target?: TargetUrl;
}

/**
 * Validate a user-supplied target URL. `allowLoopback` exists for the test
 * suite only (local mock targets).
 */
export async function validateTargetUrl(
  input: string,
  allowLoopback = false,
): Promise<TargetValidation> {
  const raw = input.trim();
  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "only http/https" };
  }
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) return { ok: false, error: "no host" };

  if (net.isIP(hostname) !== 0) {
    if (!allowLoopback && isPrivateIp(hostname)) {
      return { ok: false, error: "private network address" };
    }
  } else if (!allowLoopback) {
    let addrs: Array<{ address: string }>;
    try {
      addrs = await dns.lookup(hostname, { all: true });
    } catch {
      return { ok: false, error: "dns lookup failed" };
    }
    if (addrs.length === 0) return { ok: false, error: "dns lookup failed" };
    if (addrs.some((a) => isPrivateIp(a.address))) {
      return { ok: false, error: "resolves to private network" };
    }
  }

  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  return {
    ok: true,
    target: {
      display: raw,
      url: u.toString(),
      hostname: hostname.replace(/^\[|\]$/g, ""),
      port,
    },
  };
}

/** Sanitize a hostname for use as a result file name. */
export function sanitizeFileName(hostname: string, suffix = ".txt"): string {
  const clean = hostname
    .replace(/[\[\]]/g, "")
    .replace(/[^a-zA-Z0-9.\-]/g, "_")
    .slice(0, 55);
  return `${clean}${suffix}`;
}
