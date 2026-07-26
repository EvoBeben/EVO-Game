import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

let cached: DB | null = null;

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'prices.db');
}

function schemaSql(): string {
  return fs.readFileSync(path.join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');
}

/**
 * Opens (and memoises) the SQLite connection, applying the schema on first use
 * so a fresh checkout works without a separate migration step.
 */
export function getDb(): DB {
  if (cached) return cached;

  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql());

  cached = db;
  return db;
}

/** Drops every table and reapplies the schema. Used by `npm run db:reset`. */
export function resetDb(): void {
  const file = databasePath();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${file}${suffix}`, { force: true });
  }
  cached = null;
  getDb();
}

export function closeDb(): void {
  cached?.close();
  cached = null;
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
