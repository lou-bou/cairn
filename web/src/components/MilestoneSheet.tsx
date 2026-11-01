import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  MoneyError,
  formatAmountInput,
  formatMoney,
  formatRate,
  parseAmount,
  parseRate,
  toEurCents,
  type Currency,
  type Milestone,
} from '@cairn/shared';
import { ApiError } from '../api/client';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useSettings,
  useUpdateMilestone,
} from '../api/hooks';
import { useOnline } from '../lib/online';
import { Button } from './Button';
import { Field, FormError, Segmented, TextInput } from './Form';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import styles from './TransactionSheet.module.css';

/** Amount + currency + (for DZD) rate, shared by the milestone and goal forms. */
export function useMoneyInput(
  initial?: { amount: number; currency: Currency; rate: number } | null,
) {
  const { data: settings } = useSettings();
  const defaultRate = settings?.defaultRate ?? 275000;
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'EUR');
  const [amount, setAmount] = useState(
    initial ? formatAmountInput(initial.amount, initial.currency) : '',
  );
  const [rate, setRate] = useState(formatRate(initial?.rate ?? defaultRate));

  const preview = useMemo(() => {
    if (currency !== 'DZD' || !amount) return null;
    try {
      return formatMoney(toEurCents(parseAmount(amount, 'DZD'), 'DZD', parseRate(rate)), 'EUR');
    } catch {
      return null;
    }
  }, [amount, currency, rate]);

  /** Parse into API fields, or return field errors. */
  const parse = (
    amountKey: string,
  ): {
    values?: { amount: number; currency: Currency; rate: number };
    errors: Record<string, string>;
  } => {
    const errors: Record<string, string> = {};
    let parsedAmount = 0;
    let parsedRate = defaultRate;
    try {
      parsedAmount = parseAmount(amount, currency);
      if (parsedAmount === 0) errors[amountKey] = 'Amount must be greater than 0';
    } catch (e) {
      errors[amountKey] = e instanceof MoneyError ? e.message : 'Invalid amount';
    }
    try {
      parsedRate = parseRate(rate);
    } catch (e) {
      errors.rate = e instanceof MoneyError ? e.message : 'Invalid rate';
    }
    return Object.keys(errors).length
      ? { errors }
      : { values: { amount: parsedAmount, currency, rate: parsedRate }, errors };
  };

  return { currency, setCurrency, amount, setAmount, rate, setRate, preview, parse };
}

export type MoneyInputState = ReturnType<typeof useMoneyInput>;

export function MoneyInputFields({
  state,
  id,
  label,
  amountError,
  rateError,
  hint,
}: {
  state: MoneyInputState;
  id: string;
  label: string;
  amountError?: string;
  rateError?: string;
  hint?: string;
}) {
  return (
    <>
      <Field label={label} htmlFor={`${id}-amount`} error={amountError} hint={hint}>
        <div className={styles.amountRow}>
          <TextInput
            id={`${id}-amount`}
            className={`${styles.amount} num`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={state.currency === 'EUR' ? '0.00' : '0'}
            value={state.amount}
            onChange={(e) => state.setAmount(e.target.value)}
            invalid={!!amountError}
          />
          <Segmented
            label={`${label} currency`}
            value={state.currency}
            onChange={state.setCurrency}
            options={[
              { value: 'EUR', label: 'EUR' },
              { value: 'DZD', label: 'DZD' },
            ]}
          />
        </div>
      </Field>
      {state.currency === 'DZD' && (
        <Field
          label="Rate (DZD per €1)"
          htmlFor={`${id}-rate`}
          error={rateError}
          hint={state.preview ? <span className="num">≈ {state.preview}</span> : undefined}
        >
          <TextInput
            id={`${id}-rate`}
            className="num"
            inputMode="decimal"
            value={state.rate}
            onChange={(e) => state.setRate(e.target.value)}
            invalid={!!rateError}
          />
        </Field>
      )}
    </>
  );
}

export function MilestoneSheet({
  milestone,
  onClose,
}: {
  milestone: Milestone | null;
  onClose: () => void;
}) {
  const create = useCreateMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  const online = useOnline();
  const toast = useToast();
  const money = useMoneyInput(
    milestone
      ? { amount: milestone.costOriginal, currency: milestone.currency, rate: milestone.rate }
      : null,
  );
  const [name, setName] = useState(milestone?.name ?? '');
  const [note, setNote] = useState(milestone?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { values, errors: fieldErrors } = money.parse('costOriginal');
    if (!name.trim()) fieldErrors.name = 'Name is required';
    setErrors(fieldErrors);
    if (!values || Object.keys(fieldErrors).length) return;
    const body = {
      name,
      note,
      costOriginal: values.amount,
      currency: values.currency,
      rate: values.rate,
    };
    try {
      if (milestone) await update.mutateAsync({ id: milestone.id, ...body });
      else await create.mutateAsync(body);
      toast.show(milestone ? 'Milestone saved' : 'Milestone added');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? null : err.message);
      } else setFormError('Something went wrong. Try again.');
    }
  };

  const doDelete = async () => {
    if (!milestone) return;
    try {
      await remove.mutateAsync(milestone.id);
      toast.show('Milestone deleted');
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={milestone ? 'Edit milestone' : 'New milestone'}
      footer={
        <>
          {milestone &&
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
              <Button variant="ghost" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
          <Button
            type="submit"
            form="milestone-form"
            variant="primary"
            block
            busy={create.isPending || update.isPending}
            disabled={!online}
          >
            {milestone ? 'Save' : 'Add milestone'}
          </Button>
        </>
      }
    >
      <form id="milestone-form" className={styles.form} onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="ms-name" error={errors.name}>
          <TextInput
            id="ms-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Visa and flight"
            invalid={!!errors.name}
            autoFocus={!milestone}
          />
        </Field>
        <MoneyInputFields
          state={money}
          id="ms"
          label="Cost of this step"
          hint="Just this step. Thresholds add up the steps before it."
          amountError={errors.costOriginal}
          rateError={errors.rate}
        />
        <Field label="Note" htmlFor="ms-note" error={errors.note}>
          <TextInput
            id="ms-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this covers (optional)"
          />
        </Field>
        <FormError message={formError} />
      </form>
    </Sheet>
  );
}
