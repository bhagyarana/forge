// packages/store/src/db.ts — open + migrate a forge.db (05 §4).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

export type Db = Database.Database;

/**
 * Opens (creating if needed) a SQLite db at `path` — or an in-memory db when
 * `path` is `:memory:` — and applies `001_init.sql` if the schema is not yet
 * present. Idempotent: safe to call once per process per db file.
 */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000"); // 04 §7 — SQLite locked ⇒ one request waits, not fails

  const hasSessions = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get();
  if (!hasSessions) {
    const sql = readFileSync(join(MIGRATIONS_DIR, "001_init.sql"), "utf8");
    db.exec(sql);
  }
  return db;
}

export function closeDb(db: Db): void {
  db.close();
}
