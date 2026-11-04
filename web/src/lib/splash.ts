import { useSyncExternalStore } from 'react';
import { readToken } from './tokens';

/** The stones need this long to land; the splash never leaves before that. */
const MIN_MS = 700;
/** Slow or stuck network: show the app (and its own loading states) after this. */
const MAX_MS = 5000;
const FLIGHT_MS = 450;

let gone = false;
const listeners = new Set<() => void>();

function finish(): void {
  gone = true;
  listeners.forEach((l) => l());
}

/** True once the splash is off the screen, so a celebration isn't played behind it. */
export function useSplashGone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => gone,
  );
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The logo on screen right now: the sidebar's on a laptop, the header's on a phone. */
function visibleLogo(): DOMRect | null {
  for (const svg of document.querySelectorAll('[aria-label="Cairn home"] svg')) {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && getComputedStyle(svg).visibility !== 'hidden') return rect;
  }
  return null;
}

/** Hold the splash (web/index.html) until the app has data, then land the logo in its place. */
export async function dismissSplash(isLoading: () => boolean): Promise<void> {
  const splash = document.getElementById('splash');
  if (!splash) return finish();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  await sleep(reduced ? 200 : MIN_MS);
  while (isLoading() && performance.now() < MAX_MS) await sleep(50);

  const mark = splash.querySelector('svg');
  const hop = splash.querySelector('.splash-hop');
  const bg = splash.querySelector('.splash-bg');
  if (reduced || !mark || !hop || !bg) {
    splash.remove();
    return finish();
  }

  // Leave between hops, when the top stone is at rest, so stopping the hop doesn't make it jump.
  await Promise.race([
    new Promise((resolve) => hop.addEventListener('animationiteration', resolve, { once: true })),
    sleep(800),
  ]);
  splash.classList.add('splash-leaving');

  const from = mark.getBoundingClientRect();
  const to = visibleLogo();
  const easing = readToken('--ease-out');
  const timing = { duration: FLIGHT_MS, easing, fill: 'forwards' } as const;
  bg.animate([{ opacity: 1 }, { opacity: 0 }], timing);
  // The mark is the square at the left end of the full logo.
  const flight = to
    ? mark.animate(
        [
          { transform: 'none' },
          {
            transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.height / from.height})`,
          },
        ],
        timing,
      )
    : mark.animate([{ opacity: 1 }, { opacity: 0 }], timing);
  await flight.finished;
  splash.remove();
  finish();
}
