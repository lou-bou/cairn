import { useState } from 'react';
import { BellRing, Check, Scale } from 'lucide-react';
import {
  addDays,
  formatMoney,
  isReconcileDue,
  todayIso,
  toEurCents,
  type TxType,
} from '@cairn/shared';
import { ApiError } from '../api/client';
import {
  useCategories,
  useCreateReconciliation,
  useGoal,
  useSettings,
  useUpdateSettings,
} from '../api/hooks';
import { categoryColor } from '../lib/categories';
import { localDateOf } from '../lib/dates';
import { useMoney } from '../lib/money';
import { useOnline } from '../lib/online';
import { Button } from './Button';
import { ChipGroup, Field, FormError } from './Form';
import { MoneyInputFields, useMoneyInput } from './MilestoneSheet';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import styles from './Reconcile.module.css';

/** Dashboard banner when a count is due (spec §9). */
export function ReconcileBanner() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const today = todayIso();

  if (!settings) return null;
  const last = settings.lastReconciledAt ? localDateOf(settings.lastReconciledAt) : null;
  if (!isReconcileDue(settings, today, last) && !open) return null;

  return (
    <>
      <section className={styles.banner} aria-label="Count reminder">
        <BellRing className={styles.bannerIcon} aria-hidden="true" />
        <p className={styles.bannerText}>Count your money and compare it with the app balance.</p>
        <div className={styles.bannerActions}>
          <Button size="sm" variant="primary" onClick={() => setOpen(true)} disabled={!online}>
            Count now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update.mutate({ reconcileSnoozedUntil: addDays(today, 1) })}
            disabled={!online}
          >
            Snooze 1 day
          </Button>
        </div>
      </section>
      {open && <ReconcileSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Enter the counted total, compare, then finish as-is or with an adjustment. */
export function ReconcileSheet({ onClose }: { onClose: () => void }) {
  const { data: goal } = useGoal();
  const { data: categories = [] } = useCategories();
  const create = useCreateReconciliation();
  const online = useOnline();
  const toast = useToast();
  const money = useMoney();
  const amount = useMoneyInput(null);
  const [counted, setCounted] = useState<{
    amount: number;
    currency: 'EUR' | 'DZD';
    rate: number;
    eur: number;
  } | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const balance = goal?.balanceEur ?? 0;
  const diff = counted ? counted.eur - balance : 0;
  const adjustType: TxType = diff > 0 ? 'in' : 'out';

  const compare = (e: React.FormEvent) => {
    e.preventDefault();
    // A count of zero is a valid answer.
    const { values, errors: fieldErrors } = amount.parse('countedOriginal', { allowZero: true });
    setErrors(fieldErrors);
    if (!values) return;
    setCounted({ ...values, eur: toEurCents(values.amount, values.currency, values.rate) });
  };

  const finish = async (adjust: boolean) => {
    if (!counted) return;
    if (adjust && !categoryId) {
      setErrors({ categoryId: 'Choose a category for the adjustment' });
      return;
    }
    try {
      await create.mutateAsync({
        countedOriginal: counted.amount,
        currency: counted.currency,
        rate: counted.rate,
        adjustment: adjust ? { categoryId } : undefined,
      });
      toast.show(adjust ? 'Balance adjusted to your count' : 'Count saved');
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <Sheet open onClose={onClose} title="Count your money">
      {!counted ? (
        <form className={styles.form} onSubmit={compare} noValidate>
          <p className="muted">
            Add up the cash and accounts you are saving in, then enter the total.
          </p>
          <MoneyInputFields
            state={amount}
            id="count"
            label="Counted total"
            amountError={errors.countedOriginal}
            rateError={errors.rate}
          />
          <Button type="submit" variant="primary" block>
            Compare
          </Button>
        </form>
      ) : (
        <div className={styles.form}>
          <dl className={styles.compare}>
            <dt>App balance</dt>
            <dd className="num">{money.total(balance)}</dd>
            <dt>You counted</dt>
            <dd className="num">
              {money.total(counted.eur)}
              {counted.currency !== money.displayCurrency && (
                <span className={styles.original}>
                  {formatMoney(counted.amount, counted.currency)}
                </span>
              )}
            </dd>
            <dt>Difference</dt>
            <dd className={`num ${diff === 0 ? 'in' : ''}`}>
              {money.total(diff, { signed: true })}
            </dd>
          </dl>

          {diff === 0 ? (
            <>
              <p className={styles.match}>
                <Check aria-hidden="true" /> It matches.
              </p>
              <Button
                variant="primary"
                block
                onClick={() => finish(false)}
                busy={create.isPending}
                disabled={!online}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <p className="muted">
                <Scale className={styles.inlineIcon} aria-hidden="true" /> Adjust adds a money{' '}
                {adjustType} entry of <span className="num">{money.total(Math.abs(diff))}</span> so
                the app matches your count.
              </p>
              <Field label="Adjustment category" error={errors.categoryId}>
                <ChipGroup
                  label="Adjustment category"
                  value={categoryId}
                  onChange={setCategoryId}
                  options={categories
                    .filter((c) => c.type === adjustType)
                    .map((c) => ({ value: c.id, label: c.name, swatch: categoryColor(c.id) }))}
                />
              </Field>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  block
                  onClick={() => finish(true)}
                  busy={create.isPending}
                  disabled={!online}
                >
                  Adjust
                </Button>
                <Button
                  variant="secondary"
                  block
                  onClick={() => finish(false)}
                  disabled={!online || create.isPending}
                >
                  Done without adjusting
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCounted(null)}>
                Change count
              </Button>
            </>
          )}
          <FormError message={formError} />
        </div>
      )}
    </Sheet>
  );
}
