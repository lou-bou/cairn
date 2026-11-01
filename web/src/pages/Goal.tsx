import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Mountain, Plus } from 'lucide-react';
import { formatMoney, type Goal, type GoalMode, type Milestone } from '@cairn/shared';
import { ApiError } from '../api/client';
import { useGoal, useMilestones, useReorderMilestones, useUpdateGoal } from '../api/hooks';
import { PageHeader } from '../components/AppShell';
import { Button, IconButton } from '../components/Button';
import { Card, CardHeader, EmptyState } from '../components/Card';
import { Field, FormError, Segmented, TextInput } from '../components/Form';
import { MilestoneSheet, MoneyInputFields, useMoneyInput } from '../components/MilestoneSheet';
import { useToast } from '../components/Toast';
import { useMoney } from '../lib/money';
import { useOnline } from '../lib/online';
import styles from './Goal.module.css';

export function GoalPage() {
  const { data: goal } = useGoal();
  const { data: milestones } = useMilestones();
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null);
  const online = useOnline();

  return (
    <div className={styles.page}>
      <PageHeader title="Goal" />
      {goal && milestones && (
        <GoalForm key={`${goal.mode}:${goal.customEur}:${goal.name}`} goal={goal} />
      )}
      {goal && milestones && (
        <Card>
          <CardHeader
            title="Milestones"
            action={
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => setEditing('new')}
                disabled={!online}
              >
                Add
              </Button>
            }
          />
          {milestones.length === 0 ? (
            <EmptyState icon={<Mountain />} title="No milestones yet">
              Break the goal into steps you can afford one at a time, like fees, a deposit or a
              flight.
            </EmptyState>
          ) : (
            <MilestoneList milestones={milestones} goal={goal} onEdit={setEditing} />
          )}
        </Card>
      )}
      {editing && (
        <MilestoneSheet
          milestone={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function GoalForm({ goal }: { goal: Goal }) {
  const update = useUpdateGoal();
  const online = useOnline();
  const toast = useToast();
  const money = useMoney();
  const [name, setName] = useState(goal.name);
  const [mode, setMode] = useState<GoalMode>(goal.mode);
  const amount = useMoneyInput(
    goal.customOriginal && goal.currency && goal.rate
      ? { amount: goal.customOriginal, currency: goal.currency, rate: goal.rate }
      : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const hasMilestones = goal.milestoneSumEur > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    if (!name.trim()) fieldErrors.name = 'Name is required';
    let body: Parameters<typeof update.mutateAsync>[0] = { name, mode };
    if (mode === 'custom') {
      const parsed = amount.parse('customOriginal');
      Object.assign(fieldErrors, parsed.errors);
      if (parsed.values) {
        body = {
          ...body,
          customOriginal: parsed.values.amount,
          currency: parsed.values.currency,
          rate: parsed.values.rate,
        };
      }
    } else if (!hasMilestones) {
      fieldErrors.mode = 'Auto mode needs at least one milestone';
    }
    setErrors(fieldErrors);
    setFormError(null);
    if (Object.keys(fieldErrors).length) return;
    try {
      await update.mutateAsync(body);
      toast.show('Goal saved');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? null : err.message);
      } else setFormError('Something went wrong. Try again.');
    }
  };

  return (
    <Card>
      <form className={styles.goalForm} onSubmit={submit} noValidate>
        <div className={styles.goalSummary}>
          <span className="muted">Goal</span>
          <span className={`${styles.goalAmount} num`}>{money.total(goal.amountEur)}</span>
        </div>
        <Field label="Name" htmlFor="goal-name" error={errors.name}>
          <TextInput
            id="goal-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            invalid={!!errors.name}
          />
        </Field>
        <Field
          label="Amount"
          error={errors.mode}
          hint={
            mode === 'auto'
              ? 'The goal is the total of all milestones and follows them as they change.'
              : `Must be at least the milestone total of ${formatMoney(goal.milestoneSumEur, 'EUR')}.`
          }
        >
          <Segmented
            label="Goal amount mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'auto', label: 'Sum of milestones' },
              { value: 'custom', label: 'Custom amount' },
            ]}
          />
        </Field>
        {mode === 'custom' && (
          <MoneyInputFields
            state={amount}
            id="goal"
            label="Custom amount"
            amountError={errors.customOriginal}
            rateError={errors.rate}
          />
        )}
        <FormError message={formError} />
        <div>
          <Button type="submit" variant="primary" busy={update.isPending} disabled={!online}>
            Save goal
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MilestoneList({
  milestones,
  goal,
  onEdit,
}: {
  milestones: Milestone[];
  goal: Goal;
  onEdit: (m: Milestone) => void;
}) {
  const reorder = useReorderMilestones();
  const online = useOnline();
  const money = useMoney();
  // Local order for instant feedback; resets whenever the server's order changes.
  const serverOrder = milestones.map((m) => m.id).join();
  const [local, setLocal] = useState({ server: serverOrder, ids: serverOrder.split(',') });
  if (local.server !== serverOrder) setLocal({ server: serverOrder, ids: serverOrder.split(',') });
  const order = local.server === serverOrder ? local.ids : serverOrder.split(',');
  const setOrder = (ids: string[]) => setLocal({ server: serverOrder, ids });

  const byId = new Map(milestones.map((m) => [m.id, m]));
  const ordered = order.map((id) => byId.get(id)).filter((m): m is Milestone => Boolean(m));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (ids: string[]) => {
    setOrder(ids);
    reorder.mutate(ids, { onError: () => setOrder(serverOrder.split(',')) });
  };
  const move = (index: number, delta: number) => commit(arrayMove(order, index, index + delta));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commit(arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id))));
  };

  // Thresholds follow the local order immediately while the server confirms.
  const thresholds = ordered.reduce<number[]>(
    (acc, m) => [...acc, (acc.at(-1) ?? 0) + m.costEur],
    [],
  );
  const buffer = goal.amountEur - goal.milestoneSumEur;

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className={styles.list}>
            {ordered.map((m, i) => {
              const threshold = thresholds[i] ?? 0;
              const reached = goal.balanceEur >= threshold;
              return (
                <SortableMilestone
                  key={m.id}
                  milestone={m}
                  index={i}
                  count={ordered.length}
                  threshold={threshold}
                  reached={reached}
                  disabled={!online}
                  onEdit={() => onEdit(m)}
                  onMove={(d) => move(i, d)}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
      <div className={styles.totals}>
        <div>
          <span className="muted">Milestones total</span>
          <span className="num">{money.total(goal.milestoneSumEur)}</span>
        </div>
        {buffer > 0 && (
          <div>
            <span className="muted">Buffer to the goal</span>
            <span className="num">{money.total(buffer)}</span>
          </div>
        )}
      </div>
    </>
  );
}

function SortableMilestone({
  milestone: m,
  index,
  count,
  threshold,
  reached,
  disabled,
  onEdit,
  onMove,
}: {
  milestone: Milestone;
  index: number;
  count: number;
  threshold: number;
  reached: boolean;
  disabled: boolean;
  onEdit: () => void;
  onMove: (delta: number) => void;
}) {
  const money = useMoney();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: m.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      className={`${styles.item} ${isDragging ? styles.dragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={styles.handle}
        aria-label={`Drag to reorder ${m.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </button>
      <span className={`${styles.index} ${reached ? styles.indexDone : ''}`}>{index + 1}</span>
      <button type="button" className={styles.body} onClick={onEdit}>
        <span className={styles.name}>{m.name}</span>
        <span className={styles.meta}>
          <span className="num">
            {money.record({
              amountOriginal: m.costOriginal,
              currency: m.currency,
              amountEur: m.costEur,
            })}
          </span>
          {m.currency !== money.displayCurrency && (
            <span className="num"> ({money.original(m.costOriginal, m.currency)})</span>
          )}
          <span> · reached at </span>
          <span className="num">{money.total(threshold)}</span>
        </span>
      </button>
      <span className={reached ? styles.badgeDone : styles.badge}>
        {reached ? 'Reached' : 'Ahead'}
      </span>
      <span className={styles.moves}>
        <IconButton
          label={`Move ${m.name} up`}
          onClick={() => onMove(-1)}
          disabled={disabled || index === 0}
        >
          <ChevronUp />
        </IconButton>
        <IconButton
          label={`Move ${m.name} down`}
          onClick={() => onMove(1)}
          disabled={disabled || index === count - 1}
        >
          <ChevronDown />
        </IconButton>
      </span>
    </li>
  );
}
