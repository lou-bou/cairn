import { LOGO_WIDTH, WORDMARK_PATH } from '../brand/wordmark';
import styles from './Logo.module.css';

/**
 * The Cairn mark (concept A, design/logo-concepts/a-stack.svg) drawn inline so it reads live
 * theme tokens. `bounce` gives the top stone a small hop (goal celebration).
 */
export function LogoMark({ className, bounce = false }: { className?: string; bounce?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <LogoMarkShapes bounce={bounce} />
    </svg>
  );
}

export function Logo({ className, bounce }: { className?: string; bounce?: boolean }) {
  return (
    <span className={`${styles.logo} ${className ?? ''}`} role="img" aria-label="Cairn">
      <svg viewBox={`0 0 ${LOGO_WIDTH} 64`} className={styles.full} aria-hidden="true">
        <LogoMarkShapes bounce={bounce} />
        <path className={styles.word} d={WORDMARK_PATH} />
      </svg>
    </span>
  );
}

function LogoMarkShapes({ bounce }: { bounce?: boolean }) {
  return (
    <>
      <ellipse className={styles.base} cx="32" cy="50" rx="24" ry="9.5" />
      <ellipse
        className={styles.mid}
        cx="30.5"
        cy="31.5"
        rx="17"
        ry="7.5"
        transform="rotate(-5 30.5 31.5)"
      />
      <g className={bounce ? styles.bounce : undefined}>
        <g transform="rotate(6 33 15)">
          <ellipse className={styles.top} cx="33" cy="15" rx="11.5" ry="8.5" />
          <circle className={styles.face} cx="29.6" cy="14.2" r="1.35" />
          <circle className={styles.face} cx="36.4" cy="14.2" r="1.35" />
          <path className={styles.smile} d="M30.9 17.4 Q33 19.3 35.1 17.4" />
        </g>
      </g>
    </>
  );
}
