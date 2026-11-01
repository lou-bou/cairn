import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  ExportFile,
  ImportPreview,
  ImportResult,
  Milestone,
  Mutation,
  Transaction,
} from '@cairn/shared';
import { readBackupStatus } from '../src/routes/data.js';
import { call, testApp } from './helpers.js';

let a: FastifyInstance;
let b: FastifyInstance;
beforeEach(async () => {
  a = await testApp();
  b = await testApp();
});
afterEach(async () => {
  await a.close();
  await b.close();
});

const addTx = (app: FastifyInstance, body: Record<string, unknown>) =>
  call<Mutation<Transaction>>(
    app,
    'POST',
    '/api/transactions',
    {
      type: 'in',
      date: '2026-10-01',
      amountOriginal: 10000,
      currency: 'EUR',
      categoryId: 'income',
      ...body,
    },
    201,
  );
const exportOf = (app: FastifyInstance) => call<ExportFile>(app, 'GET', '/api/export');
const strip = (f: ExportFile) => ({ ...f, exportedAt: '' });

async function populate(app: FastifyInstance) {
  await addTx(app, { note: 'Salary, "Oct"', amountOriginal: 150000 });
  await addTx(app, {
    type: 'out',
    categoryId: 'living',
    amountOriginal: 2750000,
    currency: 'DZD',
    note: 'Rent',
    source: 'bna',
  });
  await call(
    app,
    'POST',
    '/api/milestones',
    { name: 'Laptop', costOriginal: 90000, currency: 'EUR' },
    201,
  );
  await call(app, 'PUT', '/api/goal', {
    name: 'Germany',
    mode: 'custom',
    customOriginal: 3_200_000,
    currency: 'EUR',
  });
  await call(app, 'PUT', '/api/settings', {
    defaultRate: 262500,
    reconcileFrequency: 'monthly',
    reconcileDay: 15,
  });
  await call(
    app,
    'POST',
    '/api/reconciliations',
    { countedOriginal: 130000, currency: 'EUR', adjustment: { categoryId: 'living' } },
    201,
  );
}

const importAll = (app: FastifyInstance, file: unknown, resolution: Record<string, unknown> = {}) =>
  call<Mutation<ImportResult>>(app, 'POST', '/api/import', {
    file,
    resolution: { conflicts: 'replace', goal: 'replace', settings: 'replace', ...resolution },
  });

describe('export / import (AC 11)', () => {
  it('round-trips into a fresh install without data loss', async () => {
    await populate(a);
    const file = await exportOf(a);
    await importAll(b, file);
    expect(strip(await exportOf(b))).toEqual(strip(file));
  });

  it('importing the same file twice changes nothing', async () => {
    await populate(a);
    const file = await exportOf(a);
    await importAll(b, file);
    const after1 = await exportOf(b);
    const preview = await call<{ data: ImportPreview }>(b, 'POST', '/api/import?dryRun=1', {
      file,
    });
    expect(preview.data.counts.transactions).toEqual({ new: 0, identical: 3, conflicts: 0 });
    expect(preview.data.counts.milestones).toEqual({ new: 0, identical: 6, conflicts: 0 });
    expect(preview.data.goalDiffers).toBe(false);
    await importAll(b, file);
    expect(strip(await exportOf(b))).toEqual(strip(after1));
  });

  it('keeps sources, and imports older exports without them as other', async () => {
    await populate(a);
    const file = await exportOf(a);
    expect(file.transactions.map((t) => t.source).sort()).toEqual(['bna', 'other', 'other']);
    const old = {
      ...file,
      // undefined is dropped when the request is serialized, like a file from before sources.
      transactions: file.transactions.map((t) => ({ ...t, source: undefined })),
    };
    await importAll(b, old);
    expect((await exportOf(b)).transactions.every((t) => t.source === 'other')).toBe(true);
  });

  it('matches seed milestones by id instead of duplicating them', async () => {
    const file = await exportOf(a);
    const preview = await call<{ data: ImportPreview }>(b, 'POST', '/api/import?dryRun=1', {
      file,
    });
    expect(preview.data.counts.milestones).toEqual({ new: 0, identical: 5, conflicts: 0 });
  });

  it('dry run changes nothing', async () => {
    await populate(a);
    const before = await exportOf(b);
    await call(b, 'POST', '/api/import?dryRun=1', { file: await exportOf(a) });
    expect(strip(await exportOf(b))).toEqual(strip(before));
  });

  describe('conflicts', () => {
    let txId: string;
    let file: ExportFile;
    beforeEach(async () => {
      const { data } = await addTx(a, { note: 'Original' });
      txId = data.id;
      file = await exportOf(a);
      await importAll(b, file);
      // Diverge: edit the transaction and Phase 1 in A, export again.
      await call(a, 'PUT', `/api/transactions/${txId}`, {
        type: 'in',
        date: '2026-10-01',
        amountOriginal: 20000,
        currency: 'EUR',
        categoryId: 'income',
        note: 'Edited',
      });
      const p1 = (await call<{ data: Milestone[] }>(a, 'GET', '/api/milestones')).data[0]!;
      await call(a, 'PUT', `/api/milestones/${p1.id}`, {
        name: p1.name,
        costOriginal: 150000,
        currency: 'EUR',
      });
      file = await exportOf(a);
    });

    it('previews conflicts with both versions', async () => {
      const { data } = await call<{ data: ImportPreview }>(b, 'POST', '/api/import?dryRun=1', {
        file,
      });
      expect(data.counts.transactions.conflicts).toBe(1);
      expect(data.counts.milestones.conflicts).toBe(1);
      expect(data.conflicts.find((c) => c.id === txId)).toMatchObject({
        existing: 'Original · 2026-10-01 · +€100.00',
        incoming: 'Edited · 2026-10-01 · +€200.00',
      });
    });

    it('replace', async () => {
      const { data } = await importAll(b, file, { conflicts: 'replace' });
      expect(data).toMatchObject({ replaced: 2, keptBoth: 0, skipped: 0 });
      const tx = await call<{ data: Transaction }>(b, 'GET', `/api/transactions/${txId}`);
      expect(tx.data.note).toBe('Edited');
    });

    it('skip', async () => {
      const { data } = await importAll(b, file, { conflicts: 'skip' });
      expect(data).toMatchObject({ replaced: 0, skipped: 2 });
      const tx = await call<{ data: Transaction }>(b, 'GET', `/api/transactions/${txId}`);
      expect(tx.data.note).toBe('Original');
    });

    it('keep both, naming milestone copies like a file manager', async () => {
      const { data } = await importAll(b, file, { conflicts: 'keepBoth' });
      expect(data.keptBoth).toBe(2);
      const ms = (await call<{ data: Milestone[] }>(b, 'GET', '/api/milestones')).data.map(
        (m) => m.name,
      );
      expect(ms.at(-1)).toBe('Phase 1: Pre-admission (1)');
      // Keeping both again picks the next free number.
      await importAll(b, file, { conflicts: 'keepBoth' });
      const again = (await call<{ data: Milestone[] }>(b, 'GET', '/api/milestones')).data.map(
        (m) => m.name,
      );
      expect(again.at(-1)).toBe('Phase 1: Pre-admission (2)');
      const txs = (await call<{ data: Transaction[] }>(b, 'GET', '/api/transactions')).data;
      expect(txs.map((t) => t.note).sort()).toEqual(['Edited', 'Edited', 'Original']);
    });

    it('per-record choices override the default', async () => {
      const { data } = await importAll(b, file, {
        conflicts: 'skip',
        perRecord: { [txId]: 'replace' },
      });
      expect(data).toMatchObject({ replaced: 1, skipped: 1 });
    });
  });

  it('keeps the current goal and settings unless asked', async () => {
    await populate(a);
    await call(b, 'POST', '/api/import', { file: await exportOf(a) });
    const goal = (await call<{ data: { name: string } }>(b, 'GET', '/api/goal')).data;
    expect(goal.name).toBe('Study abroad (Germany)');
  });

  it('rejects files that are not Cairn exports, or have unknown categories', async () => {
    await call(b, 'POST', '/api/import', { file: { hello: 'world' } }, 400);
    const file = await exportOf(a);
    const bad = { ...file, transactions: [{ ...(await addTx(a, {})).data, categoryId: 'pizza' }] };
    const res = await call<{ error: string }>(b, 'POST', '/api/import', { file: bad }, 400);
    expect(res.error).toMatch(/unknown or mismatched category "pizza"/);
  });

  it('exports transactions as CSV', async () => {
    await populate(a);
    const res = await a.inject({ method: 'GET', url: '/api/export?format=csv' });
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]).toBe(
      'id,date,type,category,amount,currency,rate_dzd_per_eur,amount_eur,source,note,adjustment',
    );
    expect(
      lines.some((l) => l.includes(',Income,1500.00,EUR,275,1500.00,Other,"Salary, ""Oct""",no')),
    ).toBe(true);
    expect(lines.some((l) => l.includes(',Living,27500,DZD,275,100.00,BNA,Rent,no'))).toBe(true);
  });

  it('backs up the database before a real import', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-import-'));
    const app = await testApp({ dbPath: path.join(dir, 'cairn.db') });
    try {
      const res = await call<Mutation<ImportResult>>(app, 'POST', '/api/import', {
        file: await exportOf(a),
      });
      expect(res.data.backupFile).toMatch(/^pre-import-\d{8}-\d{6}\.db$/);
      expect(fs.existsSync(path.join(dir, res.data.backupFile!))).toBe(true);
    } finally {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('backup status', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-backup-'));
  const file = path.join(dir, 'status.json');
  const now = Date.parse('2026-11-01T12:00:00Z');

  it('is unknown and stale with no status file', () => {
    expect(readBackupStatus(path.join(dir, 'missing.json'), now)).toMatchObject({
      state: 'unknown',
      stale: true,
    });
  });

  it('is ok when the last success is recent', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        lastSuccessAt: '2026-11-01T03:00:00Z',
        sizeBytes: 2048,
        file: 'cairn-x.db.gz',
      }),
    );
    expect(readBackupStatus(file, now)).toMatchObject({
      state: 'ok',
      stale: false,
      sizeBytes: 2048,
    });
  });

  it('warns when older than 36 hours or failing', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ lastSuccessAt: '2026-10-30T03:00:00Z', error: 'rclone: token expired' }),
    );
    expect(readBackupStatus(file, now)).toMatchObject({
      state: 'error',
      stale: true,
      error: 'rclone: token expired',
    });
  });
});
