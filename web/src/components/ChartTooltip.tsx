import type { ReactNode } from 'react';
import styles from './Charts.module.css';

export interface TooltipRow {
  label: string;
  value: string;
  swatch?: string;
}

export function ChartTooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{title}</p>
      {rows.map((r) => (
        <p key={r.label} className={styles.tooltipRow}>
          {r.swatch && (
            <span className={styles.swatch} style={{ background: r.swatch }} aria-hidden="true" />
          )}
          <span className={styles.tooltipLabel}>{r.label}</span>
          <span className="num">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((i) => (
        <li key={i.label}>
          <span className={styles.swatch} style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
