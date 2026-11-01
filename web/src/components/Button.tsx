import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'in' | 'out';
type Size = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block,
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], block && styles.block, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      className={`${styles.iconButton} ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
