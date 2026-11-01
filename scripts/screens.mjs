// Screenshot app pages for design review. Dev only.
// Usage: node scripts/screens.mjs <baseUrl> <outDir> [paths...]
// Env: SCHEMES=light,dark  WIDTHS=390,1280  THEME=test
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [base, outDir, ...paths] = process.argv.slice(2);
const schemes = (process.env.SCHEMES ?? 'light').split(',');
const widths = (process.env.WIDTHS ?? '390').split(',').map(Number);
const theme = process.env.THEME;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const scheme of schemes) {
  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: width < 600 ? 844 : 860 },
      colorScheme: scheme,
      deviceScaleFactor: width < 600 ? 2 : 1,
    });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
    for (const p of paths.length ? paths : ['/']) {
      const url = new URL(p, base);
      if (theme) url.searchParams.set('theme', theme);
      await page.goto(url.toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const name = `${p.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${width}-${scheme}${theme ? `-${theme}` : ''}.png`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true });
      console.log(name);
    }
    await page.close();
  }
}
await browser.close();
