import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`${styles.card} ${className ?? ''}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon && <span className={styles.emptyIcon}>{icon}</span>}
      <p className={styles.emptyTitle}>{title}</p>
      {children && <div className={styles.emptyBody}>{children}</div>}
    </div>
  );
}
