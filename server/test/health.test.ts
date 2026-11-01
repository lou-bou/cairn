import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

describe('server shell', () => {
  let app: FastifyInstance;
  let webDist: string;

  beforeAll(async () => {
    webDist = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-web-'));
    fs.writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><title>Cairn</title>');
    app = await buildApp(testConfig({ webDist }));
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(webDist, { recursive: true, force: true });
  });

  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 404 for missing assets rather than index.html', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/missing-abc123.js' });
    expect(res.statusCode).toBe(404);
  });

  it('serves index.html for client-side routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Cairn</title>');
  });
});
