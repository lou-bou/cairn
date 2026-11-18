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
import { ChevronDown, ChevronUp, GripVertical, ListChecks, Mountain, Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  formatMoney,
  type Goal,
  type GoalDetail,
  type GoalInput,
  type GoalMode,
  type Milestone,
} from '@cairn/shared';
import { ApiError } from '../api/client';
import {
  useActivateGoal,
  useArchiveGoal,
  useDeleteGoal,
  useGoals,
  useReorderMilestones,
  useUpdateGoal,
} from '../api/hooks';
import { PageHeader } from '../components/AppShell';
import { Button, IconButton } from '../components/Button';
import { Card, CardHeader, EmptyState } from '../components/Card';
import { Field, FormError, Segmented, Select, TextInput } from '../components/Form';
import { MilestoneSheet, MoneyInputFields, useMoneyInput } from '../components/MilestoneSheet';
import { useToast } from '../components/Toast';
import { useMoney } from '../lib/money';
import { useOnline } from '../lib/online';
import styles from './Goal.module.css';

/** /goal shows the active goal; /goals/:id shows any goal, active or not. */
export function GoalPage() {
  const { id } = useParams();
  const { data: goals } = useGoals();
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null);
  const online = useOnline();
  const goal = goals?.find((g) => (id ? g.id === id : g.active));

  if (goals && !goal) {
    return (
      <div className={styles.page}>
        <PageHeader title="Goal" />
        <Card>
          <EmptyState icon={<Mountain />} title="This goal no longer exists">
            <Link to="/goals">See all goals</Link>
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Goal"
        actions={goals && goal && <GoalSwitcher goals={goals} shown={goal} />}
      />
      {goal && !goal.active && goals && (
        <NotActiveCard goal={goal} active={goals.find((g) => g.active)} />
      )}
      {goal && (
        <GoalForm key={`${goal.id}:${goal.mode}:${goal.customEur}:${goal.name}`} goal={goal} />
      )}
      {goal && (
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
          {goal.milestones.length === 0 ? (
            <EmptyState icon={<Mountain />} title="No milestones yet">
              Break the goal into steps you can afford one at a time, like the price, insurance or a
              deposit. The goal adds them up.
            </EmptyState>
          ) : (
            <MilestoneList milestones={goal.milestones} goal={goal} onEdit={setEditing} />
          )}
        </Card>
      )}
      {editing && goal && (
        <MilestoneSheet
          milestone={editing === 'new' ? null : editing}
          goalId={goal.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Pick the goal to work toward, and a way to every goal. */
function GoalSwitcher({ goals, shown }: { goals: GoalDetail[]; shown: GoalDetail }) {
  const activate = useActivateGoal();
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const active = goals.find((g) => g.active);
  const choices = goals.filter((g) => !g.archivedAt || g.active);

  return (
    <div className={styles.switcher}>
      {choices.length > 1 && active && (
        <Select
          aria-label="Goal to work toward"
          value={active.id}
          disabled={!online || activate.isPending}
          onChange={async (e) => {
            const next = goals.find((g) => g.id === e.target.value);
            if (!next) return;
            await activate.mutateAsync(next.id);
            toast.show(`Working toward ${next.name}`);
            if (shown.id !== next.id) navigate('/goal');
          }}
        >
          {choices.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      )}
      <Link to="/goals" className={styles.allGoals}>
        <ListChecks aria-hidden="true" />
        All goals
      </Link>
    </div>
  );
}

/** Shown when looking at a goal that isn't the one being worked toward. */
function NotActiveCard({ goal, active }: { goal: GoalDetail; active?: Goal }) {
  const activate = useActivateGoal();
  const archive = useArchiveGoal();
  const remove = useDeleteGoal();
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, done: string, then?: () => void) => {
    setError(null);
    try {
      await action();
      toast.show(done);
      then?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <Card>
      <div className={styles.notActive}>
        <p>
          {goal.archivedAt ? 'This goal is archived. ' : ''}
          You are working toward <strong>{active?.name ?? 'another goal'}</strong>. Make this the
          goal to see your progress on it at home and get its celebrations.
        </p>
        <div className={styles.notActiveActions}>
          <Button
            variant="primary"
            busy={activate.isPending}
            disabled={!online}
            onClick={() =>
              run(
                () => activate.mutateAsync(goal.id),
                `Working toward ${goal.name}`,
                () => navigate('/goal'),
              )
            }
          >
            Work toward this goal
          </Button>
          <Button
            variant="ghost"
            disabled={!online || archive.isPending}
            onClick={() =>
              run(
                () => archive.mutateAsync({ id: goal.id, archived: !goal.archivedAt }),
                goal.archivedAt ? 'Goal restored' : 'Goal archived',
              )
            }
          >
            {goal.archivedAt ? 'Restore' : 'Archive'}
          </Button>
          {confirmDelete ? (
            <Button
              variant="danger"
              busy={remove.isPending}
              disabled={!online}
              onClick={() =>
                run(
                  () => remove.mutateAsync(goal.id),
                  'Goal deleted',
                  () => navigate('/goals'),
                )
              }
            >
              Delete it and its milestones
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
        <FormError message={error} />
      </div>
    </Card>
  );
}

/** Name and amount: shared by editing a goal and creating one. */
export function GoalFields({
  name,
  setName,
  mode,
  setMode,
  amount,
  errors,
  milestoneSumEur,
}: {
  name: string;
  setName: (v: string) => void;
  mode: GoalMode;
  setMode: (v: GoalMode) => void;
  amount: ReturnType<typeof useMoneyInput>;
  errors: Record<string, string>;
  milestoneSumEur: number;
}) {
  return (
    <>
      <Field label="Name" htmlFor="goal-name" error={errors.name}>
        <TextInput
          id="goal-name"
          value={name}
          maxLength={80}
          placeholder="e.g. Car"
          onChange={(e) => setName(e.target.value)}
          invalid={!!errors.name}
        />
      </Field>
      <Field
        label="Amount"
        error={errors.mode}
        hint={
          mode === 'auto'
            ? 'The goal is the total of its milestones and follows them as they change.'
            : milestoneSumEur > 0
              ? `Must be at least the milestone total of ${formatMoney(milestoneSumEur, 'EUR')}.`
              : 'A fixed amount. Milestones can still mark the steps toward it.'
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
    </>
  );
}

/** Parse the goal fields into an API body, or field errors. */
export function goalBody(
  name: string,
  mode: GoalMode,
  amount: ReturnType<typeof useMoneyInput>,
): { body?: GoalInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Name is required';
  if (mode === 'auto')
    return Object.keys(errors).length ? { errors } : { body: { name, mode }, errors };
  const parsed = amount.parse('customOriginal');
  Object.assign(errors, parsed.errors);
  if (!parsed.values || Object.keys(errors).length) return { errors };
  return {
    body: {
      name,
      mode,
      customOriginal: parsed.values.amount,
      currency: parsed.values.currency,
      rate: parsed.values.rate,
    },
    errors,
  };
}

function GoalForm({ goal }: { goal: GoalDetail }) {
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { body, errors: fieldErrors } = goalBody(name, mode, amount);
    setErrors(fieldErrors);
    setFormError(null);
    if (!body) return;
    try {
      await update.mutateAsync({ id: goal.id, ...body });
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
          <span className="muted">{goal.active ? 'Working toward' : 'Goal'}</span>
          <span className={`${styles.goalAmount} num`}>
            {goal.amountEur > 0 ? money.total(goal.amountEur) : 'No amount yet'}
          </span>
        </div>
        <GoalFields
          name={name}
          setName={setName}
          mode={mode}
          setMode={setMode}
          amount={amount}
          errors={errors}
          milestoneSumEur={goal.milestoneSumEur}
        />
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
