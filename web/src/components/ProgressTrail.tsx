import { useLayoutEffect, useRef, useState } from 'react';
import { Check, Flag } from 'lucide-react';
import type { Goal, Milestone } from '@cairn/shared';
import { useMoney } from '../lib/money';
import { shortName } from '../lib/milestones';
import styles from './ProgressTrail.module.css';

const GAP_PX = 8;
const MAX_ROWS = 4;

interface Placed {
  left: number;
  row: number;
}

/**
 * Flag-style label placement: each label starts at its marker and extends right. Placing from
 * the rightmost marker leftward, a label drops a row whenever it would run into one already
 * placed, so a leader line never passes through another label. Labels that would overflow the
 * right edge hang left of their marker instead.
 */
function placeLabels(xs: number[], widths: number[], trackWidth: number): Placed[] {
  const rows: { start: number; end: number }[][] = [];
  const out: Placed[] = new Array(xs.length);
  for (let i = xs.length - 1; i >= 0; i--) {
    const x = xs[i]!;
    const w = widths[i] ?? 0;
    const left = x + w <= trackWidth ? x : Math.max(0, x - w);
    let row = rows.findIndex((spans) =>
      spans.every((s) => left + w + GAP_PX <= s.start || left >= s.end + GAP_PX),
    );
    if (row === -1) row = Math.min(rows.length, MAX_ROWS - 1);
    (rows[row] ??= []).push({ start: left, end: left + w });
    out[i] = { left, row };
  }
  return out;
}

export function ProgressTrail({ goal, milestones }: { goal: Goal; milestones: Milestone[] }) {
  const money = useMoney();
  const trackRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [layoutState, setLayoutState] = useState<{ placed: Placed[]; xs: number[] } | null>(null);
  const placed = layoutState?.placed ?? null;
  const [selected, setSelected] = useState<string | null>(null);

  const goalEur = Math.max(goal.amountEur, 1);
  const pct = (eur: number) => Math.min(100, (eur / goalEur) * 100);
  const fill = pct(Math.max(0, goal.balanceEur));
  const key = milestones.map((m) => `${m.id}:${m.thresholdEur}:${m.name}`).join('|') + goalEur;

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const layout = () => {
      const width = track.clientWidth;
      const xs = milestones.map((m) => (pct(m.thresholdEur) / 100) * width);
      const widths = milestones.map((_, i) => labelRefs.current[i]?.offsetWidth ?? 0);
      setLayoutState({ placed: placeLabels(xs, widths, width), xs });
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const rows = placed ? Math.max(0, ...placed.map((p) => p.row)) + 1 : 1;
  const detail = milestones.find((m) => m.id === selected);
  const pctText = `${Math.floor((Math.max(0, goal.balanceEur) / goalEur) * 100)}%`;

  return (
    <div className={styles.trail}>
      <div
        ref={trackRef}
        className={styles.track}
        role="progressbar"
        aria-label={`Progress toward ${goal.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={`${pctText}, ${money.total(goal.balanceEur)} of ${money.total(goal.amountEur)}`}
      >
        <div className={styles.fill} style={{ width: `${fill}%` }} />
        {milestones.map((m) => (
          <span
            key={m.id}
            className={`${styles.marker} ${m.achievedAt ? styles.done : ''} ${selected === m.id ? styles.markerSelected : ''}`}
            style={{ left: `${pct(m.thresholdEur)}%` }}
            aria-hidden="true"
          />
        ))}
        <span
          className={`${styles.goalMarker} ${goal.achievedAt ? styles.done : ''}`}
          aria-hidden="true"
        >
          <Flag />
        </span>
      </div>

      <div className={styles.labels} style={{ height: `calc(${rows} * var(--trail-row))` }}>
        {milestones.map((m, i) => {
          const p = placed?.[i];
          const x = layoutState?.xs[i] ?? 0;
          return (
            <span key={m.id}>
              {p && (
                <span
                  className={styles.leader}
                  style={{
                    left: `${x}px`,
                    height: `calc(${p.row} * var(--trail-row) + var(--space-2) + var(--space-1))`,
                  }}
                  aria-hidden="true"
                />
              )}
              <button
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                type="button"
                aria-label={`${m.name}, ${money.total(m.thresholdEur)}, ${m.achievedAt ? 'reached' : 'not reached yet'}`}
                aria-pressed={selected === m.id}
                className={`${styles.label} ${m.achievedAt ? styles.labelDone : ''} ${selected === m.id ? styles.labelSelected : ''}`}
                style={{
                  left: p ? `${p.left}px` : 0,
                  top: p ? `calc(${p.row} * var(--trail-row))` : 0,
                  visibility: p ? 'visible' : 'hidden',
                }}
                onClick={() => setSelected(selected === m.id ? null : m.id)}
              >
                {m.achievedAt && <Check className={styles.labelCheck} aria-hidden="true" />}
                {shortName(m.name)}
              </button>
            </span>
          );
        })}
      </div>

      {detail && (
        <div className={styles.detail}>
          <div className={styles.detailHead}>
            <strong>{detail.name}</strong>
            <span className={detail.achievedAt ? styles.badgeDone : styles.badge}>
              {detail.achievedAt ? 'Reached' : 'Not yet'}
            </span>
          </div>
          <dl className={styles.detailGrid}>
            <dt>Cost</dt>
            <dd className="num">{money.total(detail.costEur)}</dd>
            <dt>Reached at</dt>
            <dd className="num">{money.total(detail.thresholdEur)}</dd>
            {!detail.achievedAt && (
              <>
                <dt>To go</dt>
                <dd className="num">
                  {money.total(Math.max(0, detail.thresholdEur - goal.balanceEur))}
                </dd>
              </>
            )}
          </dl>
          {detail.note && <p className={styles.detailNote}>{detail.note}</p>}
        </div>
      )}
    </div>
  );
}
