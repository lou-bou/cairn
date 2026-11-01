// Shared helpers for brand asset scripts.

/**
 * Raster tools can't read CSS custom properties, so bake an SVG to fixed colors:
 * keep the light (or dark) var() fallbacks and drop the media query.
 */
export function resolveSvg(src, mode = 'light') {
  let svg = src.replace(/<!--[\s\S]*?-->\s*/g, '');
  const media = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\s*\}\n/;
  const dark = media.exec(svg)?.[1] ?? '';
  svg = svg.replace(media, '');
  if (mode === 'dark') {
    for (const m of dark.matchAll(/\.(\w[\w-]*) \{ fill: var\(--[\w-]+, (#[0-9a-f]+)\); \}/g)) {
      svg = svg.replace(
        new RegExp(`\\.${m[1]} \\{ fill: var\\(--[\\w-]+, #[0-9a-f]+\\); \\}`),
        `.${m[1]} { fill: ${m[2]}; }`,
      );
    }
  }
  return svg.replace(/var\(--[\w-]+, (#[0-9a-f]+)\)/g, '$1');
}
