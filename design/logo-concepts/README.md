# Logo concepts

Three hand-written SVG concepts. All colors come from theme tokens (`--logo-*`), with fallbacks for standalone use.

| File            | Concept                                                                     | Status     |
| --------------- | --------------------------------------------------------------------------- | ---------- |
| `a-stack.svg`   | Three hand-stacked pebbles at slight angles; the top stone has a small face | **In use** |
| `b-pebbles.svg` | Straight pill-shaped stones stepped off-center; calmer and more geometric   | Alternate  |
| `c-marker.svg`  | The stack inside an accent badge, no face; the most app-icon-like           | Alternate  |

To swap: change `LOGO_SOURCE` in `scripts/gen-brand.mjs`, then run `npm run brand`. Also update the inline mark in `web/src/components/Logo.tsx`, which mirrors the chosen concept so it can read live theme tokens.

To render all three in light and dark at 192, 32 and 16 px: `node scripts/preview-logos.mjs <out-dir>`.
