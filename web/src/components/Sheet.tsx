import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import styles from './Sheet.module.css';

/**
 * Modal built on <dialog>: a bottom sheet on phones, a centered panel on wider screens.
 * Native focus trapping and Escape-to-close come with showModal().
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) closes.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id="sheet-title" className={styles.title}>
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <X />
            </IconButton>
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
