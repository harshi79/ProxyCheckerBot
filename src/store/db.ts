/**
 * SQLite persistence (better-sqlite3, synchronous — fine at this scale).
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase, RunResult } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let db: BetterSqliteDatabase | null = null;

function ensureSchema(d: BetterSqliteDatabase): void {
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      is_bot INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      checks_done INTEGER NOT NULL DEFAULT 0,
      proxies_tested INTEGER NOT NULL DEFAULT 0,
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT NOT NULL DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS url_settings (
      user_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (user_id, seq)
    );
    CREATE TABLE IF NOT EXISTS jobs (
      job_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      finished_at INTEGER,
      total INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running'
    );
    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs (user_id, created_at);
  `);

  // Backwards compatibility for existing SQLite databases
  const userCols = d.pragma(`table_info(users)`) as Array<{ name: string }>;
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has("banned")) {
    d.exec(`ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0`);
  }
  if (!colNames.has("ban_reason")) {
    d.exec(`ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''`);
  }
  if (!colNames.has("is_admin")) {
    d.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  }
}

export function getDb(): BetterSqliteDatabase {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new Database(config.dbFile);
  ensureSchema(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export interface UserRow {
  id: number;
  name: string;
  username: string;
  bio: string;
  is_bot: number;
  created_at: number;
  last_seen_at: number;
  checks_done: number;
  proxies_tested: number;
  banned?: number;
  ban_reason?: string;
  is_admin?: number;
}

export function upsertUser(user: {
  id: number;
  name: string;
  username: string;
  bio: string;
  is_bot: boolean;
}): UserRow {
  const d = getDb();
  const now = Date.now();
  const isOwnerUser = user.id === config.ownerId || config.adminIds.includes(user.id);
  d
    .prepare(
      `INSERT INTO users (id, name, username, bio, is_bot, created_at, last_seen_at, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         username = excluded.username,
         bio = CASE WHEN excluded.bio = '' THEN users.bio ELSE excluded.bio END,
         last_seen_at = excluded.last_seen_at,
         is_admin = CASE WHEN excluded.is_admin = 1 THEN 1 ELSE users.is_admin END`,
    )
    .run(user.id, user.name, user.username, user.bio, user.is_bot ? 1 : 0, now, now, isOwnerUser ? 1 : 0);
  const row = d.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as UserRow;
  return row;
}

export function setBio(id: number, bio: string): void {
  getDb().prepare(`UPDATE users SET bio = ? WHERE id = ?`).run(bio.slice(0, 255), id);
}

export function getUser(id: number): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export function getUserByUsername(username: string): UserRow | undefined {
  const clean = username.replace(/^@/, "").toLowerCase().trim();
  if (!clean) return undefined;
  return getDb()
    .prepare(`SELECT * FROM users WHERE LOWER(username) = ?`)
    .get(clean) as UserRow | undefined;
}

export function findUser(query: string | number): UserRow | undefined {
  if (typeof query === "number") return getUser(query);
  const trimmed = String(query).trim();
  const num = Number.parseInt(trimmed, 10);
  if (Number.isFinite(num) && String(num) === trimmed) {
    const byId = getUser(num);
    if (byId) return byId;
  }
  return getUserByUsername(trimmed);
}

export function isOwner(userId: number): boolean {
  return userId === config.ownerId;
}

export function isAdmin(userId: number): boolean {
  if (isOwner(userId)) return true;
  if (config.adminIds.includes(userId)) return true;
  const u = getUser(userId);
  return u ? u.is_admin === 1 : false;
}

export function banUser(id: number, reason = ""): void {
  getDb()
    .prepare(`UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?`)
    .run(reason.slice(0, 255), id);
}

export function unbanUser(id: number): void {
  getDb()
    .prepare(`UPDATE users SET banned = 0, ban_reason = '' WHERE id = ?`)
    .run(id);
}

export function isUserBanned(id: number): { banned: boolean; reason: string } {
  const u = getUser(id);
  if (!u) return { banned: false, reason: "" };
  return { banned: u.banned === 1, reason: u.ban_reason || "" };
}

export function setUserAdmin(id: number, admin: boolean): void {
  getDb()
    .prepare(`UPDATE users SET is_admin = ? WHERE id = ?`)
    .run(admin ? 1 : 0, id);
}

export function resetUserStats(id: number): void {
  getDb()
    .prepare(`UPDATE users SET checks_done = 0, proxies_tested = 0 WHERE id = ?`)
    .run(id);
}

export function clearUserUrls(id: number): void {
  getDb().prepare(`DELETE FROM url_settings WHERE user_id = ?`).run(id);
}

export function getUsersList(options: { page?: number; pageSize?: number } = {}): {
  users: UserRow[];
  total: number;
  page: number;
  totalPages: number;
} {
  const pageSize = Math.max(1, options.pageSize ?? 6);
  const total = Number(
    (getDb().prepare(`SELECT COUNT(*) AS count FROM users`).get() as { count: number }).count,
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), totalPages);
  const offset = (page - 1) * pageSize;
  const users = getDb()
    .prepare(`SELECT * FROM users ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`)
    .all(pageSize, offset) as UserRow[];
  return { users, total, page, totalPages };
}

export interface AdminMetrics {
  totalUsers: number;
  active24h: number;
  bannedUsers: number;
  adminUsers: number;
  totalJobs: number;
  totalProxiesTested: number;
  totalHits: number;
}

export function getAdminMetrics(): AdminMetrics {
  const d = getDb();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const userStats = d
    .prepare(
      `SELECT
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS active24h,
        SUM(CASE WHEN banned = 1 THEN 1 ELSE 0 END) AS bannedUsers,
        SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS adminUsers,
        SUM(proxies_tested) AS totalProxiesTested
      FROM users`,
    )
    .get(dayAgo) as {
      totalUsers: number;
      active24h: number;
      bannedUsers: number;
      adminUsers: number;
      totalProxiesTested: number;
    } | undefined;

  const jobStats = d
    .prepare(
      `SELECT
        COUNT(*) AS totalJobs,
        SUM(hits) AS totalHits
      FROM jobs`,
    )
    .get() as {
      totalJobs: number;
      totalHits: number;
    } | undefined;

  const totalUsers = userStats?.totalUsers ?? 0;
  const active24h = userStats?.active24h ?? 0;
  const bannedUsers = userStats?.bannedUsers ?? 0;
  const adminUsers = Math.max(1, (userStats?.adminUsers ?? 0) + (config.ownerId ? 1 : 0));
  const totalJobs = jobStats?.totalJobs ?? 0;
  const totalProxiesTested = userStats?.totalProxiesTested ?? 0;
  const totalHits = jobStats?.totalHits ?? 0;

  return {
    totalUsers,
    active24h,
    bannedUsers,
    adminUsers,
    totalJobs,
    totalProxiesTested,
    totalHits,
  };
}

export function getSetting(key: string, def = ""): string {
  const row = getDb().prepare(`SELECT value FROM bot_settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : def;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function isMaintenanceMode(): boolean {
  return getSetting("maintenance", "0") === "1";
}

export function setMaintenanceMode(enabled: boolean): void {
  setSetting("maintenance", enabled ? "1" : "0");
}

export function getAllBroadcastUserIds(): number[] {
  const rows = getDb()
    .prepare(`SELECT id FROM users WHERE banned = 0 ORDER BY last_seen_at DESC`)
    .all() as Array<{ id: number }>;
  return rows.map((r) => r.id);
}

export function bumpUserStats(id: number, checks: number, proxies: number): void {
  getDb()
    .prepare(
      `UPDATE users SET checks_done = checks_done + ?, proxies_tested = proxies_tested + ? WHERE id = ?`,
    )
    .run(checks, proxies, id);
}

export function getUrls(userId: number): string[] {
  const rows = getDb()
    .prepare(`SELECT url FROM url_settings WHERE user_id = ? ORDER BY seq`)
    .all(userId) as Array<{ url: string }>;
  return rows.map((r) => r.url);
}

export function setUrls(userId: number, urls: string[]): void {
  const d = getDb();
  d.exec(`BEGIN`);
  try {
    d.prepare(`DELETE FROM url_settings WHERE user_id = ?`).run(userId);
    const ins = d.prepare(`INSERT INTO url_settings (user_id, seq, url) VALUES (?, ?, ?)`);
    urls.forEach((url, i) => ins.run(userId, i, url));
    d.exec(`COMMIT`);
  } catch (err) {
    d.exec(`ROLLBACK`);
    throw err;
  }
}

export function startJob(userId: number, total: number): number {
  const r: RunResult = getDb()
    .prepare(`INSERT INTO jobs (user_id, created_at, total, status) VALUES (?, ?, ?, 'running')`)
    .run(userId, Date.now(), total);
  return Number(r.lastInsertRowid);
}

export function finishJob(jobId: number, hits: number, status: "done" | "cancelled" | "error"): void {
  getDb()
    .prepare(`UPDATE jobs SET finished_at = ?, hits = ?, status = ? WHERE job_id = ?`)
    .run(Date.now(), hits, status, jobId);
}

export function dailyJobCount(userId: number): number {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const r = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND created_at >= ?`)
    .get(userId, dayStart.getTime()) as { n: number };
  return Number(r.n);
}
