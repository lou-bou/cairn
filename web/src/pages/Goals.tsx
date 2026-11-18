import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Archive, Check, Mountain, Plus } from 'lucide-react';
import type { GoalDetail, GoalMode } from '@cairn/shared';
import { ApiError } from '../api/client';
import { useCreateGoal, useGoals } from '../api/hooks';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card, EmptyState } from '../components/Card';
import { FormError } from '../components/Form';
import { useMoneyInput } from '../components/MilestoneSheet';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useMoney } from '../lib/money';
import { useOnline } from '../lib/online';
import { GoalFields, goalBody } from './Goal';
import styles from './Goals.module.css';

/** Every goal: the one being worked toward, the others, and the archived ones. */
export function GoalsPage() {
  const { data: goals } = useGoals();
  const online = useOnline();
  const [creating, setCreating] = useState(false);
  const current = goals?.filter((g) => !g.archivedAt) ?? [];
  const archived = goals?.filter((g) => g.archivedAt) ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Goals"
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setCreating(true)}
            disabled={!online}
          >
            New goal
          </Button>
        }
      />
      <p className={styles.intro}>
        Your balance counts toward the goal you are working toward. Switch any time: the others show
        how far the same money would get you.
      </p>
      {goals && (
        <ul className={styles.list}>
          {current.map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className={styles.archived}>
          <summary>
            <Archive aria-hidden="true" /> Archived ({archived.length})
          </summary>
          <ul className={styles.list}>
            {archived.map((g) => (
              <GoalRow key={g.id} goal={g} />
            ))}
          </ul>
        </details>
      )}
      {goals && goals.length === 0 && (
        <Card>
          <EmptyState icon={<Mountain />} title="No goals yet" />
        </Card>
      )}
      {creating && <NewGoalSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function GoalRow({ goal }: { goal: GoalDetail }) {
  const money = useMoney();
  const balance = Math.max(0, goal.balanceEur);
  const fraction = goal.amountEur > 0 ? Math.min(1, balance / goal.amountEur) : 0;
  const covered = goal.milestones.filter((m) => goal.balanceEur >= m.thresholdEur).length;
  const steps = goal.milestones.length;

  return (
    <li>
      <Link to={goal.active ? '/goal' : `/goals/${goal.id}`} className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.name}>{goal.name}</span>
          {goal.active && (
            <span className={styles.active}>
              <Check aria-hidden="true" /> Working toward
            </span>
          )}
        </div>
        <div className={styles.rowMeta}>
          <span className="num">
            {goal.amountEur > 0 ? money.total(goal.amountEur) : 'No amount yet'}
          </span>
          <span>
            {steps === 0
              ? 'No milestones'
              : `${covered} of ${steps} ${steps === 1 ? 'milestone' : 'milestones'} covered`}
          </span>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-label={`${goal.name}: ${Math.floor(fraction * 100)}% covered`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(fraction * 100)}
        >
          <div className={styles.fill} style={{ width: `${fraction * 100}%` }} />
        </div>
      </Link>
    </li>
  );
}

function NewGoalSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateGoal();
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<GoalMode>('auto');
  const amount = useMoneyInput(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { body, errors: fieldErrors } = goalBody(name, mode, amount);
    setErrors(fieldErrors);
    setFormError(null);
    if (!body) return;
    try {
      const res = await create.mutateAsync(body);
      toast.show('Goal added. Now add its milestones.');
      onClose();
      navigate(`/goals/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? null : err.message);
      } else setFormError('Something went wrong. Try again.');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="New goal"
      footer={
        <Button
          type="submit"
          form="new-goal-form"
          variant="primary"
          block
          busy={create.isPending}
          disabled={!online}
        >
          Add goal
        </Button>
      }
    >
      <form id="new-goal-form" className={styles.form} onSubmit={submit} noValidate>
        <GoalFields
          name={name}
          setName={setName}
          mode={mode}
          setMode={setMode}
          amount={amount}
          errors={errors}
          milestoneSumEur={0}
        />
        <FormError message={formError} />
      </form>
    </Sheet>
  );
}
