// Render the logo concepts to PNG previews (light/dark, large/16px) for eyeballing. Dev only.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { resolveSvg } from './brand-lib.mjs';

const [outDir] = process.argv.slice(2);
const dir = 'design/logo-concepts';
const rows = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const mode of ['light', 'dark']) {
    const svg = resolveSvg(src, mode);
    const bg = mode === 'light' ? '#f6f5f2' : '#121211';
    for (const size of [192, 32, 16]) {
      const png = await sharp(Buffer.from(svg))
        .resize(size, size)
        .flatten({ background: bg })
        .png()
        .toBuffer();
      rows.push({ file, mode, size, png });
    }
  }
}
// Compose a contact sheet: one row per concept/mode; small sizes shown 1:1 and upscaled 6x.
const cell = 210;
const sheetRows = rows.length / 3;
const composites = [];
let r = 0;
for (let i = 0; i < rows.length; i += 3) {
  const [big, s32, s16] = rows.slice(i, i + 3);
  const top = r * cell + 9;
  composites.push({ input: big.png, left: 9, top });
  composites.push({ input: s32.png, left: 220, top });
  composites.push({ input: s16.png, left: 270, top });
  composites.push({
    input: await sharp(s16.png).resize(96, 96, { kernel: 'nearest' }).png().toBuffer(),
    left: 300,
    top,
  });
  composites.push({
    input: await sharp(s32.png).resize(96, 96, { kernel: 'nearest' }).png().toBuffer(),
    left: 410,
    top,
  });
  r++;
}
const bgRows = [];
for (let i = 0; i < sheetRows; i++) {
  const mode = rows[i * 3].mode;
  bgRows.push({
    input: {
      create: {
        width: 520,
        height: cell,
        channels: 3,
        background: mode === 'light' ? '#f6f5f2' : '#121211',
      },
    },
    left: 0,
    top: i * cell,
  });
}
await sharp({ create: { width: 520, height: sheetRows * cell, channels: 3, background: '#888' } })
  .composite([...bgRows, ...composites])
  .png()
  .toFile(path.join(outDir, 'logo-sheet.png'));
console.log('wrote', path.join(outDir, 'logo-sheet.png'));
