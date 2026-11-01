import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface Config {
  host: string;
  port: number;
  dbPath: string;
  defaultRate: string;
  webDist: string;
  backupStatusPath: string;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number, got "${raw}"`);
  return Number(raw);
}

export function loadConfig(): Config {
  return {
    host: process.env.HOST ?? '0.0.0.0',
    port: intFromEnv('PORT', 8080),
    dbPath: process.env.DB_PATH ?? path.resolve('data/cairn.db'),
    // Kept as a string: it is parsed into an exact integer rate by the money module.
    defaultRate: process.env.DEFAULT_RATE ?? '275',
    // src/ in dev, dist/ in prod: both sit one level below server/.
    webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
    backupStatusPath: process.env.BACKUP_STATUS_PATH ?? path.resolve('backups/status.json'),
  };
}
