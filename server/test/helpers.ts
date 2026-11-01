import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:',
    defaultRate: '275',
    webDist: '/nonexistent',
    backupStatusPath: '/nonexistent/status.json',
    ...overrides,
  };
}

export async function testApp(overrides: Partial<Config> = {}): Promise<FastifyInstance> {
  return buildApp(testConfig(overrides));
}

/** inject() + JSON parse, failing loudly on unexpected status codes. */
export async function call<T = unknown>(
  app: FastifyInstance,
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
  expectStatus = 200,
): Promise<T> {
  const res = await app.inject({
    method,
    url,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  if (res.statusCode !== expectStatus) {
    throw new Error(`${method} ${url} → ${res.statusCode} (expected ${expectStatus}): ${res.body}`);
  }
  return res.body ? (res.json() as T) : (undefined as T);
}
