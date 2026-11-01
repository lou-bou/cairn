import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  formatAmountInput,
  formatMoney,
  formatRate,
  parseAmount,
  parseRate,
  todayIso,
  toEurCents,
  MoneyError,
  SOURCES,
  type Currency,
  type SourceId,
  type Transaction,
  type TxType,
} from '@cairn/shared';
import { Trash2 } from 'lucide-react';
import {
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useSettings,
  useUpdateTransaction,
} from '../api/hooks';
import { ApiError } from '../api/client';
import { useOnline } from '../lib/online';
import { safeStorage } from '../lib/storage';
import { categoryColor } from '../lib/categories';
import { Button } from './Button';
import { ChipGroup, Field, FormError, Segmented, TextInput } from './Form';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import styles from './TransactionSheet.module.css';

type OpenArg = TxType | Transaction;
interface SheetApi {
  open: (arg: OpenArg) => void;
}
const SheetContext = createContext<SheetApi | null>(null);
const LAST_CURRENCY = 'cairn.lastEntryCurrency';
const LAST_SOURCE = 'cairn.lastEntrySource';

function lastSource(): SourceId {
  const saved = safeStorage.get(LAST_SOURCE);
  return SOURCES.find((s) => s.id === saved)?.id ?? 'cash';
}

export function TransactionSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ arg: OpenArg; key: number } | null>(null);
  const open = useCallback((arg: OpenArg) => setState({ arg, key: Date.now() }), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <SheetContext.Provider value={api}>
      {children}
      {state && <TransactionForm key={state.key} arg={state.arg} onClose={() => setState(null)} />}
    </SheetContext.Provider>
  );
}

export function useTransactionSheet(): SheetApi {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useTransactionSheet outside provider');
  return ctx;
}

function TransactionForm({ arg, onClose }: { arg: OpenArg; onClose: () => void }) {
  const editing = typeof arg === 'object' ? arg : null;
  const { data: settings } = useSettings();
  const { data: categories = [] } = useCategories();
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const online = useOnline();
  const toast = useToast();
  const defaultRate = settings?.defaultRate ?? 275000;

  const [type, setType] = useState<TxType>(editing?.type ?? (arg as TxType));
  const [currency, setCurrency] = useState<Currency>(
    editing?.currency ?? (safeStorage.get(LAST_CURRENCY) === 'DZD' ? 'DZD' : 'EUR'),
  );
  const [amount, setAmount] = useState(
    editing ? formatAmountInput(editing.amountOriginal, editing.currency) : '',
  );
  const [rate, setRate] = useState(formatRate(editing?.rate ?? defaultRate));
  const [editRate, setEditRate] = useState(false);
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [source, setSource] = useState<SourceId>(editing?.source ?? lastSource);
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeCategories = categories.filter((c) => c.type === type);
  const preview = useMemo(() => {
    if (currency !== 'DZD' || !amount) return null;
    try {
      return formatMoney(toEurCents(parseAmount(amount, 'DZD'), 'DZD', parseRate(rate)), 'EUR');
    } catch {
      return null;
    }
  }, [amount, currency, rate]);

  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    let amountOriginal = 0;
    let rateMilli = defaultRate;
    try {
      amountOriginal = parseAmount(amount, currency);
      if (amountOriginal === 0) fieldErrors.amountOriginal = 'Amount must be greater than 0';
    } catch (err) {
      fieldErrors.amountOriginal = err instanceof MoneyError ? err.message : 'Invalid amount';
    }
    try {
      rateMilli = parseRate(rate);
    } catch (err) {
      fieldErrors.rate = err instanceof MoneyError ? err.message : 'Invalid rate';
    }
    if (!categoryId || !typeCategories.some((c) => c.id === categoryId))
      fieldErrors.categoryId = 'Choose a category';
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;

    const body = {
      type,
      date,
      note,
      amountOriginal,
      currency,
      rate: rateMilli,
      categoryId,
      source,
      isAdjustment: editing?.isAdjustment ?? false,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...body });
      else await create.mutateAsync(body);
      safeStorage.set(LAST_CURRENCY, currency);
      safeStorage.set(LAST_SOURCE, source);
      toast.show(editing ? 'Saved' : type === 'in' ? 'Money in added' : 'Money out added');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? null : err.message);
      } else setFormError('Something went wrong. Try again.');
    }
  };

  const doDelete = async () => {
    if (!editing) return;
    try {
      await remove.mutateAsync(editing.id);
      toast.show('Deleted');
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  const title = editing ? 'Edit entry' : 'New entry';

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {editing &&
            (confirmDelete ? (
              <Button
                variant="danger"
                onClick={doDelete}
                busy={remove.isPending}
                disabled={!online}
              >
                Confirm delete
              </Button>
            ) : (
              <Button
                variant="ghost"
                icon={<Trash2 />}
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete"
              >
                Delete
              </Button>
            ))}
          <Button
            type="submit"
            form="tx-form"
            variant="primary"
            block
            busy={busy}
            disabled={!online}
            title={online ? undefined : 'You are offline'}
          >
            {editing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="tx-form" className={styles.form} onSubmit={submit} noValidate>
        <Segmented
          label="Type"
          value={type}
          onChange={(t) => {
            setType(t);
            setCategoryId('');
          }}
          className={styles.type}
          options={[
            { value: 'in', label: 'Money in', tone: 'in' },
            { value: 'out', label: 'Money out', tone: 'out' },
          ]}
        />

        <Field label="Amount" htmlFor="tx-amount" error={errors.amountOriginal}>
          <div className={styles.amountRow}>
            <TextInput
              id="tx-amount"
              className={`${styles.amount} num`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={currency === 'EUR' ? '0.00' : '0'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={!!errors.amountOriginal}
              autoFocus
            />
            <Segmented
              label="Currency"
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'EUR', label: 'EUR' },
                { value: 'DZD', label: 'DZD' },
              ]}
            />
          </div>
        </Field>

        <div className={styles.rateLine}>
          {editRate ? (
            <Field
              label="Rate (DZD per €1)"
              htmlFor="tx-rate"
              error={errors.rate}
              className={styles.rateField}
            >
              <TextInput
                id="tx-rate"
                className="num"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                invalid={!!errors.rate}
              />
            </Field>
          ) : (
            <span className="muted">
              <span className="num">€1 = {rate} DA</span>
              {preview && (
                <>
                  {' · '}
                  <span className="num">≈ {preview}</span>
                </>
              )}
            </span>
          )}
          {!editRate && (
            <button type="button" className={styles.linkButton} onClick={() => setEditRate(true)}>
              Change rate
            </button>
          )}
        </div>
        {editRate && preview && <p className={`${styles.preview} num muted`}>≈ {preview}</p>}

        <Field label="Category" error={errors.categoryId}>
          <ChipGroup
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={typeCategories.map((c) => ({
              value: c.id,
              label: c.name,
              swatch: categoryColor(c.id),
            }))}
          />
        </Field>

        <Field label={type === 'in' ? 'Source' : 'Paid from'} error={errors.source}>
          <Segmented
            label={type === 'in' ? 'Source' : 'Paid from'}
            value={source}
            onChange={setSource}
            className={styles.source}
            options={SOURCES.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>

        <div className={styles.row}>
          <Field label="Date" htmlFor="tx-date" error={errors.date}>
            <TextInput
              id="tx-date"
              type="date"
              value={date}
              max="9999-12-31"
              onChange={(e) => setDate(e.target.value)}
              invalid={!!errors.date}
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="tx-note" error={errors.note}>
          <TextInput
            id="tx-note"
            placeholder="Optional"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {editing?.isAdjustment && (
          <p className="muted">This entry is a reconciliation adjustment.</p>
        )}
        <FormError message={formError} />
      </form>
    </Sheet>
  );
}
