import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { loadConfig } from "../config";
import * as schema from "./schema";
import { seed } from "./seed";

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    "group" TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '',
    exclude_from_summary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    hash TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL,
    raw_description TEXT NOT NULL,
    clean_description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance INTEGER,
    source TEXT,
    category_id INTEGER REFERENCES categories(id),
    suggested_by TEXT,
    confidence REAL,
    status TEXT NOT NULL DEFAULT 'uncategorized',
    llm_label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS categorization_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    old_category_id INTEGER,
    new_category_id INTEGER NOT NULL,
    changed_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function initSqlite(path: string) {
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(SCHEMA_SQL);
  return sqlite;
}

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const config = loadConfig();
    mkdirSync(dirname(config.dbPath), { recursive: true });
    const sqlite = initSqlite(config.dbPath);
    _db = drizzle(sqlite, { schema });
    seed(_db);
  }
  return _db;
}

export function createDb(path: string) {
  return drizzle(initSqlite(path), { schema });
}

export type Db = ReturnType<typeof getDb>;
