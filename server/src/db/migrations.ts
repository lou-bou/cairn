import type { Database } from 'better-sqlite3';
import { CATEGORIES, DEFAULT_SOURCE, SOURCE_IDS } from '@cairn/shared';

export interface MigrationContext {
  defaultRateMilli: number;
  now: string;
}

interface Migration {
  version: number;
  name: string;
  up: (db: Database, ctx: MigrationContext) => void;
}

// Fixed ids, so a backup imported into a fresh install matches the seed instead of duplicating it.
const SEED_MILESTONES = [
  {
    id: '5eed0000-0000-4000-8000-000000000001',
    name: 'Phase 1: Pre-admission',
    costEur: 136500,
    note: 'IELTS with retake, B2 exam, apostilles, translations, application fees, postage',
  },
  {
    id: '5eed0000-0000-4000-8000-000000000002',
    name: 'Phase 2: Admission to departure',
    costEur: 243500,
    note: 'Blocked account fee, visa, insurance, flight, housing deposit and first rent',
  },
  {
    id: '5eed0000-0000-4000-8000-000000000003',
    name: 'Phase 3: Arrival',
    costEur: 110000,
    note: 'Residence permit, semester fee, setup costs',
  },
  {
    id: '5eed0000-0000-4000-8000-000000000004',
    name: 'Blocked account',
    costEur: 1190400,
    note: 'The blocked amount',
  },
  {
    id: '5eed0000-0000-4000-8000-000000000005',
    name: 'Car',
    costEur: 700000,
    note: 'Car purchase',
  },
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up(db) {
      db.exec(`
        CREATE TABLE categories (
          id          TEXT PRIMARY KEY,
          type        TEXT NOT NULL CHECK (type IN ('in', 'out')),
          name        TEXT NOT NULL,
          sort_order  INTEGER NOT NULL
        ) STRICT;

        CREATE TABLE transactions (
          id               TEXT PRIMARY KEY,
          type             TEXT NOT NULL CHECK (type IN ('in', 'out')),
          date             TEXT NOT NULL,
          note             TEXT NOT NULL DEFAULT '',
          amount_original  INTEGER NOT NULL CHECK (amount_original > 0),
          currency         TEXT NOT NULL CHECK (currency IN ('EUR', 'DZD')),
          rate             INTEGER NOT NULL CHECK (rate > 0),
          amount_eur       INTEGER NOT NULL CHECK (amount_eur >= 0),
          category_id      TEXT NOT NULL REFERENCES categories (id),
          is_adjustment    INTEGER NOT NULL DEFAULT 0 CHECK (is_adjustment IN (0, 1)),
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL
        ) STRICT;
        CREATE INDEX transactions_date ON transactions (date);

        CREATE TABLE goal (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          name              TEXT NOT NULL,
          mode              TEXT NOT NULL CHECK (mode IN ('auto', 'custom')),
          custom_original   INTEGER CHECK (custom_original > 0),
          currency          TEXT CHECK (currency IN ('EUR', 'DZD')),
          rate              INTEGER CHECK (rate > 0),
          custom_eur        INTEGER CHECK (custom_eur > 0),
          amount_eur        INTEGER NOT NULL DEFAULT 0,
          achieved_at       TEXT,
          celebration_seen  INTEGER NOT NULL DEFAULT 1 CHECK (celebration_seen IN (0, 1))
        ) STRICT;

        CREATE TABLE milestones (
          id                TEXT PRIMARY KEY,
          name              TEXT NOT NULL,
          note              TEXT NOT NULL DEFAULT '',
          sort_order        INTEGER NOT NULL,
          cost_original     INTEGER NOT NULL CHECK (cost_original > 0),
          currency          TEXT NOT NULL CHECK (currency IN ('EUR', 'DZD')),
          rate              INTEGER NOT NULL CHECK (rate > 0),
          cost_eur          INTEGER NOT NULL CHECK (cost_eur >= 0),
          achieved_at       TEXT,
          celebration_seen  INTEGER NOT NULL DEFAULT 1 CHECK (celebration_seen IN (0, 1))
        ) STRICT;

        CREATE TABLE reconciliations (
          id                          TEXT PRIMARY KEY,
          date                        TEXT NOT NULL,
          counted_original            INTEGER NOT NULL CHECK (counted_original >= 0),
          currency                    TEXT NOT NULL CHECK (currency IN ('EUR', 'DZD')),
          rate                        INTEGER NOT NULL CHECK (rate > 0),
          counted_eur                 INTEGER NOT NULL,
          app_balance_eur             INTEGER NOT NULL,
          difference_eur              INTEGER NOT NULL,
          adjustment_transaction_id   TEXT REFERENCES transactions (id) ON DELETE SET NULL,
          created_at                  TEXT NOT NULL
        ) STRICT;

        CREATE TABLE settings (
          key    TEXT PRIMARY KEY,
          value  TEXT
        ) STRICT;
      `);
    },
  },
  {
    version: 2,
    name: 'fixed categories',
    up(db) {
      const insert = db.prepare(
        'INSERT INTO categories (id, type, name, sort_order) VALUES (?, ?, ?, ?)',
      );
      for (const c of CATEGORIES) insert.run(c.id, c.type, c.name, c.sortOrder);
      // Categories are fixed (spec §2, AC 6): the database itself refuses changes.
      db.exec(`
        CREATE TRIGGER categories_no_insert BEFORE INSERT ON categories
          BEGIN SELECT RAISE(ABORT, 'Categories are fixed'); END;
        CREATE TRIGGER categories_no_update BEFORE UPDATE ON categories
          BEGIN SELECT RAISE(ABORT, 'Categories are fixed'); END;
        CREATE TRIGGER categories_no_delete BEFORE DELETE ON categories
          BEGIN SELECT RAISE(ABORT, 'Categories are fixed'); END;
      `);
    },
  },
  {
    version: 3,
    name: 'seed goal, milestones and settings',
    up(db, { defaultRateMilli, now }) {
      db.prepare(
        `INSERT INTO goal (id, name, mode, custom_original, currency, rate, custom_eur, amount_eur)
         VALUES (1, ?, 'custom', ?, 'EUR', ?, ?, ?)`,
      ).run('Study abroad (Germany)', 3_000_000, defaultRateMilli, 3_000_000, 3_000_000);

      const insert = db.prepare(
        `INSERT INTO milestones (id, name, note, sort_order, cost_original, currency, rate, cost_eur)
         VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?)`,
      );
      SEED_MILESTONES.forEach((m, i) =>
        insert.run(m.id, m.name, m.note, i + 1, m.costEur, defaultRateMilli, m.costEur),
      );

      const setting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      setting.run('default_rate', String(defaultRateMilli));
      setting.run('reconcile_frequency', 'weekly');
      setting.run('reconcile_day', '0');
      // Start the clock now, so the first reminder comes on the next scheduled day, not at install.
      setting.run('last_reconciled_at', now);
      setting.run('reconcile_snoozed_until', null);
    },
  },
  {
    version: 4,
    name: 'transaction source',
    up(db) {
      // Existing entries can't know their source, so they start as the default and can be edited.
      const list = SOURCE_IDS.map((s) => `'${s}'`).join(', ');
      db.exec(
        `ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT '${DEFAULT_SOURCE}'
           CHECK (source IN (${list}))`,
      );
    },
  },
];
