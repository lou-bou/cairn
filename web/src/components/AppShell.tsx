import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import {
  ArrowLeftRight,
  ChartColumn,
  Flag,
  House,
  LogIn,
  Minus,
  Plus,
  Settings,
  WifiOff,
} from 'lucide-react';
import { ApiError } from '../api/client';
import { useGoal } from '../api/hooks';
import { useOnline } from '../lib/online';
import { usePrefs } from '../lib/prefs';
import { useLogoBounce } from '../lib/celebrate';
import { Logo } from './Logo';
import { Segmented } from './Form';
import { useTransactionSheet } from './TransactionSheet';
import styles from './AppShell.module.css';

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  { to: '/goal', label: 'Goal', icon: Flag },
  { to: '/stats', label: 'Stats', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function CurrencyToggle() {
  const { displayCurrency, setDisplayCurrency } = usePrefs();
  return (
    <Segmented
      label="Display currency"
      size="sm"
      value={displayCurrency}
      onChange={setDisplayCurrency}
      options={[
        { value: 'EUR', label: 'EUR' },
        { value: 'DZD', label: 'DZD' },
      ]}
    />
  );
}

function ConnectionPill() {
  const online = useOnline();
  const { isError, error } = useGoal();
  if (online && !isError) return null;
  if (online && error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return (
      <button
        type="button"
        className={`${styles.pill} ${styles.pillButton}`}
        title="Your session expired"
        onClick={() => window.location.reload()}
      >
        <LogIn />
        Sign in again
      </button>
    );
  }
  return (
    <span
      className={styles.pill}
      role="status"
      title="Showing the last saved data. Changes need a connection."
    >
      <WifiOff />
      {online ? "Can't reach server" : 'Offline'}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const sheet = useTransactionSheet();
  const online = useOnline();
  const bounce = useLogoBounce();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <NavLink to="/" className={styles.sidebarLogo} aria-label="Cairn home">
          <Logo bounce={bounce} />
        </NavLink>
        <nav className={styles.sideNav} aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `${styles.sideLink} ${isActive ? styles.active : ''}`}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sideActions}>
          <button
            className={`${styles.sideAdd} ${styles.addIn}`}
            onClick={() => sheet.open('in')}
            disabled={!online}
          >
            <Plus /> Money in
          </button>
          <button
            className={`${styles.sideAdd} ${styles.addOut}`}
            onClick={() => sheet.open('out')}
            disabled={!online}
          >
            <Minus /> Money out
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <NavLink to="/" className={styles.headerLogo} aria-label="Cairn home">
            <Logo bounce={bounce} />
          </NavLink>
          <div className={styles.headerEnd}>
            <ConnectionPill />
            <CurrencyToggle />
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>

      <nav className={styles.bottomNav} aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `${styles.bottomLink} ${isActive ? styles.active : ''}`}
          >
            <span className={styles.bottomIcon}>
              <Icon />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </div>
  );
}
