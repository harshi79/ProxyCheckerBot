/**
 * Bounded proxy-check engine.
 *
 * Each job uses a fixed worker pool; it never creates one Promise per
 * proxy×target pair. A process-wide semaphore enforces the global cap across
 * all concurrently running jobs.
 */
import { directGet, getOverSocket, httpProxyCheck } from "./http.js";
import { socks4Tunnel, socks5Tunnel } from "./socks.js";
import type { CheckOutcome, JobStats, ProxyEntry, ProxyProto, TargetUrl } from "./types.js";
import { isPrivateIp } from "./targets.js";
import { allowLoopbackTargets, config } from "../config.js";

export interface JobResult {
  /** Raw line per target URL (hits only). */
  perTarget: Map<string, string[]>;
  /** Unique raw lines that hit at least one target. */
  allHits: string[];
  tested: number;
  durationMs: number;
}

export interface LiveStats extends JobStats {
  /** Hit count per target URL for the per-URL progress rows. */
  perTargetHits: Map<string, number>;
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active = Math.max(0, this.active - 1);
  }
}

const globalSemaphore = new Semaphore(config.globalConcurrency);

async function checkEntryAgainstTarget(
  entry: ProxyEntry,
  target: TargetUrl,
  proto: Exclude<ProxyProto, "auto">,
): Promise<CheckOutcome> {
  const started = Date.now();
  const proxy: { host: string; port: number; user?: string; pass?: string } = {
    host: entry.host,
    port: entry.port,
  };
  if (entry.user !== undefined) proxy.user = entry.user;
  if (entry.pass !== undefined) proxy.pass = entry.pass;

  const limits = {
    connectTimeoutMs: config.connectTimeoutMs,
    totalTimeoutMs: config.totalTimeoutMs,
  };
  let socket: import("node:net").Socket | null = null;
  try {
    const isHttps = target.url.startsWith("https://");
    if (proto === "http") {
      const response = await httpProxyCheck(proxy, target, limits);
      const ok = response.status >= 100 && response.status <= 599;
      const outcome: CheckOutcome = {
        ok,
        status: response.status,
        ms: Date.now() - started,
        detected: "http",
      };
      if (ok) maybeTagExitIp(outcome, response.head);
      return outcome;
    }

    socket = proto === "socks5"
      ? await socks5Tunnel(proxy, target, limits)
      : await socks4Tunnel(proxy, target, limits);
    const response = await getOverSocket(
      socket,
      target,
      isHttps,
      Math.max(1, limits.totalTimeoutMs - (Date.now() - started)),
    );
    socket.destroy();
    socket = null;
    const ok = response.status >= 100 && response.status <= 599;
    const outcome: CheckOutcome = {
      ok,
      status: response.status,
      ms: Date.now() - started,
      detected: proto,
    };
    if (ok) maybeTagExitIp(outcome, response.head);
    return outcome;
  } catch {
    socket?.destroy();
    return { ok: false, ms: Date.now() - started, detected: proto };
  }
}

function maybeTagExitIp(outcome: CheckOutcome, head: Buffer): void {
  const body = head.toString("utf8").trim();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(body)) outcome.exitIp = body;
}

const AUTO_ORDER: Array<Exclude<ProxyProto, "auto">> = ["http", "socks5", "socks4"];

async function checkOne(entry: ProxyEntry, target: TargetUrl): Promise<CheckOutcome> {
  if (!allowLoopbackTargets && isPrivateIp(entry.host)) return { ok: false, ms: 0 };
  if (entry.proto !== "auto") return checkEntryAgainstTarget(entry, target, entry.proto);

  let last: CheckOutcome = { ok: false, ms: 0 };
  for (const proto of AUTO_ORDER) {
    last = await checkEntryAgainstTarget(entry, target, proto);
    if (last.ok) return last;
  }
  return last;
}

export interface RunJobOptions {
  onProgress?: (stats: LiveStats) => void;
  signal?: AbortSignal;
}

export async function runJob(
  entries: ProxyEntry[],
  targets: TargetUrl[],
  opts: RunJobOptions = {},
): Promise<JobResult> {
  const perTarget = new Map<string, string[]>();
  const perTargetHits = new Map<string, number>();
  for (const target of targets) {
    perTarget.set(target.url, []);
    perTargetHits.set(target.url, 0);
  }
  const allHits = new Set<string>();
  const total = entries.length * targets.length;
  let nextWork = 0;
  let done = 0;
  let hits = 0;
  let lastProgress = 0;
  const startedAt = Date.now();
  const progressMs = 700;

  const statsNow = (): LiveStats => ({
    total,
    done,
    hits,
    startedAt,
    perTargetHits: new Map(perTargetHits),
  });

  const emitProgress = (): void => {
    const now = Date.now();
    const stats = statsNow();
    if (now - lastProgress >= progressMs || done === total) {
      lastProgress = now;
      opts.onProgress?.(stats);
    }
  };

  const workerCount = Math.min(config.jobConcurrency, total);
  const worker = async (): Promise<void> => {
    while (true) {
      if (opts.signal?.aborted) return;
      const index = nextWork++;
      if (index >= total) return;
      const entry = entries[Math.floor(index / targets.length)];
      const target = targets[index % targets.length];
      if (!entry || !target) return;

      const release = await globalSemaphore.acquire();
      try {
        const outcome = await checkOne(entry, target);
        if (outcome.ok) {
          perTarget.get(target.url)?.push(entry.raw);
          perTargetHits.set(target.url, (perTargetHits.get(target.url) ?? 0) + 1);
          allHits.add(entry.raw);
          hits += 1;
        }
        done += 1;
        emitProgress();
      } finally {
        release();
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    perTarget,
    allHits: [...allHits],
    tested: entries.length,
    durationMs: Date.now() - startedAt,
  };
}

/** Probe our own egress IP, cached for ten minutes. */
let egressCache: { ip?: string; at: number } = { at: 0 };
export async function myEgressIp(): Promise<string | undefined> {
  if (Date.now() - egressCache.at < 10 * 60_000) return egressCache.ip;
  try {
    const response = await directGet("https://api.ipify.org", 8_000);
    const ip = response.head.toString("utf8").trim();
    const next: { ip?: string; at: number } = { at: Date.now() };
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) next.ip = ip;
    egressCache = next;
  } catch {
    egressCache = { at: Date.now() };
  }
  return egressCache.ip;
}
