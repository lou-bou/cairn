// Build every brand asset from the chosen hand-written mark (design/logo-concepts/a-stack.svg).
// Run: npm run brand. Outputs are committed; rerun only when the logo changes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import { resolveSvg } from './brand-lib.mjs';

const require = createRequire(import.meta.url);
const PUBLIC = 'web/public';
const BRAND = path.join(PUBLIC, 'brand');
const SRC_BRAND = 'web/src/brand';
fs.mkdirSync(BRAND, { recursive: true });
fs.mkdirSync(SRC_BRAND, { recursive: true });

const LIGHT_BG = '#f6f5f2';
const LOGO_SOURCE = 'design/logo-concepts/a-stack.svg';
const mark = fs.readFileSync(LOGO_SOURCE, 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
const style = /<style>[\s\S]*?<\/style>/.exec(mark)[0];
const body = mark.slice(mark.indexOf('</style>') + 8, mark.lastIndexOf('</svg>')).trim();
const withoutFace = body
  .replace(/\s*<circle class="face"[^>]*\/>/g, '')
  .replace(/\s*<path class="smile"[^>]*\/>/g, '');

// Wordmark: lowercase "cairn" in Nunito ExtraBold, outlined so it renders identically everywhere.
const fontFile = require.resolve('@fontsource/nunito/files/nunito-latin-800-normal.woff');
const font = opentype.parse(fs.readFileSync(fontFile).buffer.slice(0));
const FONT_SIZE = 40;
const BASELINE = 47;
// Lay glyphs out by hand (opentype.js chokes on some of Nunito's substitution tables).
function textPath(text, x, y) {
  const scale = FONT_SIZE / font.unitsPerEm;
  const glyphs = [...text].map((c) => font.charToGlyph(c));
  const out = new opentype.Path();
  glyphs.forEach((g, i) => {
    out.extend(g.getPath(x, y, FONT_SIZE));
    const next = glyphs[i + 1];
    x += g.advanceWidth * scale + (next ? font.getKerningValue(g, next) * scale : 0);
  });
  return out;
}
const bb = textPath('cairn', 0, 0).getBoundingBox();
const WORD_X = 74;
// Serialize commands ourselves: opentype.js 2's toPathData emits NaN for some curves.
const n = (v) => String(Math.round(v * 100) / 100);
const wordPath = textPath('cairn', WORD_X - bb.x1, BASELINE)
  .commands.map((c) => {
    if (c.type === 'M' || c.type === 'L') return `${c.type}${n(c.x)} ${n(c.y)}`;
    if (c.type === 'Q') return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    if (c.type === 'C') return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    return 'Z';
  })
  .join('');
const fullWidth = Math.ceil(WORD_X + (bb.x2 - bb.x1) + 2);

const wordStyle = style
  .replace('</style>', '  .word { fill: var(--logo-word, #1c1b19); }\n    </style>')
  .replace(
    /(@media \(prefers-color-scheme: dark\) \{)/,
    '$1\n      .word { fill: var(--logo-word, #f1efea); }',
  );

const svg = (viewBox, inner, label = 'Cairn') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">\n  ${inner}\n</svg>\n`;

const files = {
  'logo-mark.svg': svg('0 0 64 64', `${style}\n  ${body}`),
  'logo.svg': svg(
    `0 0 ${fullWidth} 64`,
    `${wordStyle}\n  ${body}\n  <path class="word" d="${wordPath}"/>`,
  ),
  // Monochrome: one color (currentColor); the face is knocked out of the top stone.
  'logo-mono.svg': svg(
    `0 0 ${fullWidth} 64`,
    `<defs>
    <mask id="face">
      <rect width="64" height="64" fill="#fff"/>
      <g transform="rotate(6 33 15)">
        <circle cx="29.6" cy="14.2" r="1.35" fill="#000"/>
        <circle cx="36.4" cy="14.2" r="1.35" fill="#000"/>
        <path d="M30.9 17.4 Q33 19.3 35.1 17.4" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round"/>
      </g>
    </mask>
  </defs>
  <g fill="currentColor">
    <ellipse cx="32" cy="50" rx="24" ry="9.5"/>
    <ellipse cx="30.5" cy="31.5" rx="17" ry="7.5" transform="rotate(-5 30.5 31.5)"/>
    <ellipse cx="33" cy="15" rx="11.5" ry="8.5" transform="rotate(6 33 15)" mask="url(#face)"/>
    <path d="${wordPath}"/>
  </g>`,
  ),
};
for (const [name, content] of Object.entries(files))
  fs.writeFileSync(path.join(BRAND, name), content);

// Favicon: no face (it turns to noise at 16px), follows light/dark on its own.
const favicon = svg('0 0 64 64', `${style}\n  ${withoutFace}`);
fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), favicon);

// Raster icons are baked to the default light theme colors.
const markLight = Buffer.from(resolveSvg(svg('0 0 64 64', `${style}\n  ${body}`)));
const faviconLight = Buffer.from(resolveSvg(favicon));

async function onBackground(size, markScale) {
  const inner = Math.round(size * markScale);
  const markPng = await sharp(markLight, { density: 1200 }).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: LIGHT_BG } })
    .composite([{ input: markPng, gravity: 'center' }])
    .png()
    .toBuffer();
}

fs.mkdirSync(path.join(PUBLIC, 'icons'), { recursive: true });
fs.writeFileSync(path.join(PUBLIC, 'icons/icon-192.png'), await onBackground(192, 0.78));
fs.writeFileSync(path.join(PUBLIC, 'icons/icon-512.png'), await onBackground(512, 0.78));
// Maskable: keep the mark inside the central 80% safe zone.
fs.writeFileSync(path.join(PUBLIC, 'icons/icon-maskable-512.png'), await onBackground(512, 0.6));
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await onBackground(180, 0.72));

const icoPngs = await Promise.all(
  [16, 32, 48].map((s) => sharp(faviconLight, { density: 600 }).resize(s, s).png().toBuffer()),
);
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), await pngToIco(icoPngs));

// The React logo component reuses the outlined wordmark.
fs.writeFileSync(
  path.join(SRC_BRAND, 'wordmark.ts'),
  `// Generated by scripts/gen-brand.mjs: lowercase "cairn" in Nunito ExtraBold, as outlines.\n` +
    `export const WORDMARK_PATH =\n  '${wordPath}';\nexport const LOGO_WIDTH = ${fullWidth};\n`,
);

console.log('Brand assets written.');
