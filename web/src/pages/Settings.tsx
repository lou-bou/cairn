import { useRef, useState } from 'react';
import { AlertTriangle, CloudCheck, CloudOff, Download, Upload } from 'lucide-react';
import {
  MoneyError,
  formatRate,
  parseRate,
  type ImportPreview,
  type Settings,
} from '@cairn/shared';
import { api, ApiError } from '../api/client';
import {
  useBackupStatus,
  useCategories,
  useReconciliations,
  useSettings,
  useUpdateSettings,
} from '../api/hooks';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card, CardHeader } from '../components/Card';
import { Field, FormError, Segmented, Select, TextInput } from '../components/Form';
import { ImportSheet } from '../components/ImportSheet';
import { ReconcileSheet } from '../components/Reconcile';
import { useToast } from '../components/Toast';
import { categoryColor } from '../lib/categories';
import { formatDay, localDateOf } from '../lib/dates';
import { useMoney } from '../lib/money';
import { useOnline } from '../lib/online';
import { availableThemes, SHOW_THEME_PICKER } from '../themes/registry';
import { applyScheme, applyTheme, currentTheme, savedScheme, type Scheme } from '../lib/theme';
import styles from './Settings.module.css';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SettingsPage() {
  const { data: settings } = useSettings();
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      {settings && <RateCard key={settings.defaultRate} settings={settings} />}
      {settings && <ReminderCard settings={settings} />}
      <DataCard />
      <BackupCard />
      <AppearanceCard />
      <CategoriesCard />
      {SHOW_THEME_PICKER && <ThemeCard />}
    </div>
  );
}

function RateCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const online = useOnline();
  const toast = useToast();
  const [rate, setRate] = useState(formatRate(settings.defaultRate));
  const [error, setError] = useState<string | undefined>();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    let milli: number;
    try {
      milli = parseRate(rate);
    } catch (err) {
      setError(err instanceof MoneyError ? err.message : 'Invalid rate');
      return;
    }
    setError(undefined);
    await update.mutateAsync({ defaultRate: milli });
    toast.show('Rate saved');
  };

  return (
    <Card>
      <CardHeader title="Exchange rate" />
      <form className={styles.inline} onSubmit={save} noValidate>
        <Field
          label="DZD per €1"
          htmlFor="rate"
          error={error}
          hint="Used for new entries and to show EUR amounts in DZD. Past entries keep the rate they were entered with."
          className={styles.grow}
        >
          <TextInput
            id="rate"
            className="num"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            invalid={!!error}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          busy={update.isPending}
          disabled={!online || rate === formatRate(settings.defaultRate)}
        >
          Save
        </Button>
      </form>
    </Card>
  );
}

function ReminderCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const online = useOnline();
  const money = useMoney();
  const { data: history = [] } = useReconciliations();
  const [counting, setCounting] = useState(false);
  const freq = settings.reconcileFrequency;

  return (
    <Card>
      <CardHeader
        title="Count reminder"
        action={
          <Button size="sm" onClick={() => setCounting(true)} disabled={!online}>
            Count now
          </Button>
        }
      />
      <div className={styles.stack}>
        <p className="muted">
          Every so often, count the money you actually have and check that the app matches.
        </p>
        <Field label="How often">
          <Segmented
            label="How often"
            value={freq}
            onChange={(v) => update.mutate({ reconcileFrequency: v })}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Field>
        {freq !== 'off' && (
          <Field label={freq === 'weekly' ? 'On' : 'On day'} htmlFor="rec-day">
            <Select
              id="rec-day"
              value={settings.reconcileDay}
              onChange={(e) =>
                update.mutate({ reconcileFrequency: freq, reconcileDay: Number(e.target.value) })
              }
              disabled={!online}
            >
              {freq === 'weekly'
                ? WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))
                : Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                      {i + 1 > 28 ? ' (or the last day)' : ''}
                    </option>
                  ))}
            </Select>
          </Field>
        )}
        {settings.lastReconciledAt && (
          <p className={styles.small}>
            Last counted{' '}
            {formatDay(localDateOf(settings.lastReconciledAt)).replace(/^(Today|Yesterday)$/, (d) =>
              d.toLowerCase(),
            )}
            .
          </p>
        )}
      </div>

      {history.length > 0 && (
        <details className={styles.history}>
          <summary>Past counts ({history.length})</summary>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Counted</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{formatDay(r.date)}</td>
                  <td className="num">{money.total(r.countedEur)}</td>
                  <td className="num">
                    {r.differenceEur === 0
                      ? 'Matched'
                      : money.total(r.differenceEur, { signed: true })}
                    {r.adjustmentTransactionId && (
                      <span className={styles.adjusted}> · adjusted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {counting && <ReconcileSheet onClose={() => setCounting(false)} />}
    </Card>
  );
}

function DataCard() {
  const online = useOnline();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: unknown; preview: ImportPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    try {
      const file = JSON.parse(await f.text()) as unknown;
      const res = await api.post<{ data: ImportPreview }>('/api/import?dryRun=1', { file });
      setPending({ file, preview: res.data });
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? 'That file is not valid JSON.'
          : err instanceof ApiError
            ? err.message
            : 'Could not read that file.',
      );
    }
  };

  return (
    <Card>
      <CardHeader title="Your data" />
      <div className={styles.stack}>
        <div className={styles.buttons}>
          <a className={styles.linkButton} href="/api/export" download>
            <Download /> Export JSON
          </a>
          <a className={styles.linkButton} href="/api/export?format=csv" download>
            <Download /> Export CSV
          </a>
          <Button icon={<Upload />} onClick={() => inputRef.current?.click()} disabled={!online}>
            Import JSON
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onFile}
          />
        </div>
        <p className={styles.small}>
          JSON holds everything and can be imported back. CSV is the list of entries, for
          spreadsheets. Importing merges with what is here.
        </p>
        <FormError message={error} />
      </div>
      {pending && (
        <ImportSheet
          file={pending.file}
          preview={pending.preview}
          onClose={() => setPending(null)}
        />
      )}
    </Card>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
}

function BackupCard() {
  const { data: status } = useBackupStatus();
  if (!status) return null;
  const ok = status.state === 'ok' && !status.stale;
  const when = (ts: string | null) => (ts ? new Date(ts).toLocaleString() : 'never');

  return (
    <Card>
      <CardHeader title="Backups" />
      <div className={`${styles.backup} ${ok ? styles.backupOk : styles.backupWarn}`}>
        {ok ? <CloudCheck /> : status.state === 'unknown' ? <CloudOff /> : <AlertTriangle />}
        <div>
          <p className={styles.backupTitle}>
            {status.state === 'unknown'
              ? 'No backup has run yet'
              : ok
                ? 'Backed up'
                : status.state === 'error'
                  ? 'The last backup failed'
                  : 'The last backup is more than 36 hours old'}
          </p>
          <p className={styles.small}>
            Last success: {when(status.lastSuccessAt)}
            {status.sizeBytes !== null && ` · ${formatBytes(status.sizeBytes)}`}
          </p>
          {status.error && <p className={styles.small}>Error: {status.error}</p>}
        </div>
      </div>
      <p className={styles.small}>
        Daily copies are kept on the server and in Google Drive for 30 days.
      </p>
    </Card>
  );
}

function CategoriesCard() {
  const { data: categories = [] } = useCategories();
  return (
    <Card>
      <CardHeader title="Categories" />
      <div className={styles.categories}>
        {(['in', 'out'] as const).map((type) => (
          <div key={type}>
            <p className={styles.catHeading}>Money {type}</p>
            <ul className={styles.catList}>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <li key={c.id}>
                    <span
                      className={styles.swatch}
                      style={{ background: categoryColor(c.id) }}
                      aria-hidden="true"
                    />
                    {c.name}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={styles.small}>Categories are fixed so totals stay comparable over time.</p>
    </Card>
  );
}

/** Light/dark is per device, like the display currency. */
function AppearanceCard() {
  const [scheme, setScheme] = useState<Scheme>(savedScheme());
  return (
    <Card>
      <CardHeader title="Appearance" />
      <Segmented
        label="Appearance"
        value={scheme}
        onChange={(v) => {
          setScheme(v);
          applyScheme(v);
        }}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </Card>
  );
}

/** Future feature (spec §14): enable with SHOW_THEME_PICKER once more themes ship. */
function ThemeCard() {
  const [theme, setTheme] = useState(currentTheme());
  return (
    <Card>
      <CardHeader title="Theme" />
      <Segmented
        label="Theme"
        value={theme}
        onChange={(id) => {
          setTheme(id);
          void applyTheme(id);
        }}
        options={availableThemes().map((t) => ({ value: t.id, label: t.label }))}
      />
    </Card>
  );
}
