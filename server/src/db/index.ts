import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS, type MigrationContext } from './migrations.js';

export type Db = Database.Database;

export function openDb(dbPath: string, ctx: Omit<MigrationContext, 'now'>): Db {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db, { ...ctx, now: new Date().toISOString() });
  return db;
}

export function migrate(db: Db, ctx: MigrationContext): number[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    db.prepare('SELECT version FROM schema_version').pluck().all() as number[],
  );
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      m.up(db, ctx);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        ctx.now,
      );
    })();
    ran.push(m.version);
  }
  return ran;
}
