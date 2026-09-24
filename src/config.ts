/**
 * Central configuration. Every tunable lives here, sourced from env with sane defaults.
 */
import "dotenv/config";
import path from "node:path";

function envStr(key: string, def: string): string {
  const v = process.env[key];
  return v === undefined || v === "" ? def : v;
}

function envInt(key: string, def: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export interface BotConfig {
  /** Bot token from @BotFather. */
  botToken: string;
  /** Base URL of the Bot API. Default: public API. Point at a local server for 2GB files. */
  apiBaseUrl: string;
  /** Display name used in branding copy. */
  botName: string;
  /** Developer profile link. */
  developerUrl: string;

  /** Primary bot owner / super-admin Telegram ID. */
  ownerId: number;
  /** Optional secondary admin Telegram IDs from env. */
  adminIds: number[];

  /** Max target URLs a user can store. */
  maxTargetUrls: number;
  /** Max incoming proxy-list file size in MB (hard API cap is 20). */
  maxFileMb: number;
  /** Hard cap on lines accepted per list. */
  maxLines: number;

  /** Concurrent checks inside one job. */
  jobConcurrency: number;
  /** Global cap of in-flight checks across all jobs. */
  globalConcurrency: number;
  /** Max jobs running at once; the rest queue. */
  maxRunningJobs: number;
  /** Soft per-user daily job cap. */
  dailyJobsPerUser: number;

  /** Used when the user chooses "skip" (no stored URLs). */
  defaultTargetUrl: string;

  /** Per-stage timeouts, ms. */
  connectTimeoutMs: number;
  totalTimeoutMs: number;

  /** SQLite file. */
  dbFile: string;

  /**
   * HTTP health-check listen port. Platforms that require a bound TCP port
   * (and local smoke tests) use this; the Telegram bot still long-polls.
   */
  port: number;
}

export const config: BotConfig = {
  botToken: envStr("BOT_TOKEN", ""),
  apiBaseUrl: envStr("API_BASE_URL", "https://api.telegram.org"),
  botName: "Yori Proxy Checker",
  developerUrl: "https://t.me/WhoEvenYori",

  ownerId: envInt("OWNER_ID", 7728424218),
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0),

  maxTargetUrls: envInt("MAX_TARGET_URLS", 5),
  maxFileMb: envInt("MAX_FILE_MB", 20),
  maxLines: envInt("MAX_LINES", 300_000),

  jobConcurrency: envInt("JOB_CONCURRENCY", 200),
  globalConcurrency: envInt("GLOBAL_CONCURRENCY", 600),
  maxRunningJobs: envInt("MAX_RUNNING_JOBS", 4),
  dailyJobsPerUser: envInt("DAILY_JOBS_PER_USER", 20),

  defaultTargetUrl: envStr("DEFAULT_TARGET_URL", "https://api.ipify.org"),

  connectTimeoutMs: 5_000,
  totalTimeoutMs: 12_000,

  dbFile: envStr("DB_FILE", path.join("data", "bot.db")),

  // Prefer platform PORT; fall back to HEALTH_PORT, then 8080.
  port: envInt("PORT", envInt("HEALTH_PORT", 8080)),
};

export const isTestMode = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

/**
 * In tests we run local mock proxies on loopback, which the SSRF guard would
 * otherwise refuse. Production must never enable this.
 */
export const allowLoopbackTargets = isTestMode;
