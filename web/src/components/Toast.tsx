import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleAlert, Info, PartyPopper, X } from 'lucide-react';
import styles from './Toast.module.css';

type Tone = 'info' | 'error' | 'celebrate';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}
interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICONS = { info: Info, error: CircleAlert, celebrate: PartyPopper };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>(
    (message, { tone = 'info', duration = 4000 } = {}) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={`${styles.toast} ${styles[t.tone]}`}>
              <Icon className={styles.icon} />
              <span className={styles.message}>{t.message}</span>
              <button className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
