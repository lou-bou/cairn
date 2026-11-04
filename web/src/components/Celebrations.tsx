import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useGoal, useMarkCelebrationsSeen, useMilestones } from '../api/hooks';
import { bounceLogo } from '../lib/celebrate';
import { shortName } from '../lib/milestones';
import { useSplashGone } from '../lib/splash';
import { useOnline } from '../lib/online';
import { readToken } from '../lib/tokens';
import { useToast } from './Toast';

const CONFETTI_TOKENS = [
  '--color-accent',
  '--color-in',
  '--color-cat-funding',
  '--color-cat-luxury',
  '--logo-stone-middle',
];

function fireConfetti(big: boolean) {
  const colors = CONFETTI_TOKENS.map(readToken).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c));
  const base = {
    colors: colors.length ? colors : undefined,
    disableForReducedMotion: true,
    ticks: 220,
  };
  confetti({
    ...base,
    particleCount: big ? 160 : 90,
    spread: 75,
    startVelocity: 42,
    origin: { y: 0.7 },
  });
  if (big) {
    window.setTimeout(
      () =>
        confetti({ ...base, particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } }),
      250,
    );
    window.setTimeout(
      () =>
        confetti({ ...base, particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } }),
      400,
    );
  }
}

/**
 * Celebrates every achieved item the server marks as not yet seen, then marks it seen,
 * so each achievement celebrates once and a reload never replays it (spec §5, AC 2).
 */
export function Celebrations() {
  const { data: milestones } = useMilestones();
  const { data: goal } = useGoal();
  const markSeen = useMarkCelebrationsSeen();
  const online = useOnline();
  const splashGone = useSplashGone();
  const toast = useToast();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!online || !splashGone || !milestones || !goal) return;
    const fresh = milestones.filter(
      (m) =>
        m.achievedAt && !m.celebrationSeen && !handled.current.has(`m:${m.id}:${m.achievedAt}`),
    );
    const goalFresh =
      goal.achievedAt && !goal.celebrationSeen && !handled.current.has(`g:${goal.achievedAt}`);
    if (!fresh.length && !goalFresh) return;

    fresh.forEach((m) => handled.current.add(`m:${m.id}:${m.achievedAt}`));
    if (goalFresh) handled.current.add(`g:${goal.achievedAt}`);

    fireConfetti(Boolean(goalFresh));
    if (goalFresh) {
      bounceLogo();
      toast.show(`You reached your goal: ${goal.name}`, { tone: 'celebrate', duration: 8000 });
    }
    // Only the furthest new milestone gets a toast when several are reached at once.
    const furthest = fresh.at(-1);
    if (furthest && !goalFresh) {
      toast.show(`You can afford ${shortName(furthest.name)}`, {
        tone: 'celebrate',
        duration: 6000,
      });
    }
    markSeen.mutate({ milestoneIds: fresh.map((m) => m.id), goal: Boolean(goalFresh) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, goal, online, splashGone]);

  return null;
}
