import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/db/index.js';

describe('database', () => {
  const db = openDb(':memory:', { defaultRateMilli: 275000 });

  it('seeds the fixed categories', () => {
    const rows = db.prepare('SELECT id, type FROM categories ORDER BY sort_order').all();
    expect(rows).toEqual([
      { id: 'income', type: 'in' },
      { id: 'funding', type: 'in' },
      { id: 'savings', type: 'in' },
      { id: 'other', type: 'in' },
      { id: 'administrative', type: 'out' },
      { id: 'luxury', type: 'out' },
      { id: 'living', type: 'out' },
    ]);
  });

  it('refuses category changes at the database level (AC 6)', () => {
    expect(() => db.prepare("UPDATE categories SET name = 'X' WHERE id = 'income'").run()).toThrow(
      /Categories are fixed/,
    );
    expect(() => db.prepare("DELETE FROM categories WHERE id = 'income'").run()).toThrow(
      /Categories are fixed/,
    );
    expect(() =>
      db
        .prepare("INSERT INTO categories (id, type, name, sort_order) VALUES ('x', 'in', 'X', 9)")
        .run(),
    ).toThrow(/Categories are fixed/);
  });

  it('seeds the goal and milestones (spec §6)', () => {
    const goal = db.prepare('SELECT name, mode, custom_eur FROM goal').get();
    expect(goal).toEqual({ name: 'Study abroad (Germany)', mode: 'custom', custom_eur: 3_000_000 });
    const costs = db.prepare('SELECT cost_eur FROM milestones ORDER BY sort_order').pluck().all();
    expect(costs).toEqual([136500, 243500, 110000, 1190400, 700000]);
  });

  it('seeds settings with the configured rate', () => {
    const rate = db.prepare("SELECT value FROM settings WHERE key = 'default_rate'").pluck().get();
    expect(rate).toBe('275000');
  });

  it('runs migrations only once', () => {
    expect(migrate(db, { defaultRateMilli: 275000, now: new Date().toISOString() })).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) FROM milestones').pluck().get()).toBe(5);
  });
});
