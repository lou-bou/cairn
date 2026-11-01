import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Form.module.css';

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={`${styles.input} ${className ?? ''}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <span className={`${styles.selectWrap} ${className ?? ''}`}>
      <select className={styles.select} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </span>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  tone?: 'in' | 'out';
}

/** A row of mutually exclusive choices (radio group). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  label: string;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${styles.segmented} ${styles[size]} ${className ?? ''}`}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={`${styles.segment} ${o.value === value ? styles.selected : ''} ${o.tone ? styles[o.tone] : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** Wrapping chips for picking one item, e.g. a category. */
export function ChipGroup<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | '';
  options: { value: T; label: ReactNode; swatch?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={styles.chips}>
      {options.map((o) => (
        <label
          key={o.value}
          className={`${styles.chip} ${o.value === value ? styles.chipSelected : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.swatch && (
            <span className={styles.swatch} style={{ background: o.swatch }} aria-hidden="true" />
          )}
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className={styles.formError} role="alert">
      {message}
    </p>
  );
}
