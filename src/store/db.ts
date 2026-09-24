/**
 * SQLite persistence (better-sqlite3, synchronous — fine at this scale).
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase, RunResult } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let db: BetterSqliteDatabase | null = null;

export function getDb(): BetterSqliteDatabase {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new Database(config.dbFile);
  db.exec(`
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
      proxies_tested INTEGER NOT NULL DEFAULT 0
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
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs (user_id, created_at);
  `);
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
  d
    .prepare(
      `INSERT INTO users (id, name, username, bio, is_bot, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         username = excluded.username,
         bio = CASE WHEN excluded.bio = '' THEN users.bio ELSE excluded.bio END,
         last_seen_at = excluded.last_seen_at`,
    )
    .run(user.id, user.name, user.username, user.bio, user.is_bot ? 1 : 0, now, now);
  const row = d.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as UserRow;
  return row;
}

export function setBio(id: number, bio: string): void {
  getDb().prepare(`UPDATE users SET bio = ? WHERE id = ?`).run(bio.slice(0, 255), id);
}

export function getUser(id: number): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
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
