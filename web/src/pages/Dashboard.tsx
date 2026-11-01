import { Link } from 'react-router';
import { ArrowDownLeft, ArrowUpRight, Minus, Plus, ReceiptText } from 'lucide-react';
import { endOfMonth, startOfMonth, todayIso } from '@cairn/shared';
import { useGoal, useMilestones, useSummary, useTransactions } from '../api/hooks';
import { Button } from '../components/Button';
import { Card, CardHeader, EmptyState } from '../components/Card';
import { ProgressTrail } from '../components/ProgressTrail';
import { ReconcileBanner } from '../components/Reconcile';
import { TransactionList } from '../components/TransactionList';
import { useTransactionSheet } from '../components/TransactionSheet';
import { progressOf } from '../lib/milestones';
import { useMoney } from '../lib/money';
import { useOnline } from '../lib/online';
import styles from './Dashboard.module.css';

export function DashboardPage() {
  const today = todayIso();
  const { data: goal } = useGoal();
  const { data: milestones = [] } = useMilestones();
  const { data: month } = useSummary(startOfMonth(today), endOfMonth(today));
  const { data: recent } = useTransactions({ limit: 6 });
  const money = useMoney();
  const sheet = useTransactionSheet();
  const online = useOnline();

  const balance = goal?.balanceEur ?? 0;
  const progress = goal ? progressOf(goal, milestones) : null;

  return (
    <div className={styles.page}>
      <ReconcileBanner />

      <section className={styles.balanceCard} aria-label="Balance">
        <p className={styles.balanceLabel}>Balance</p>
        <p className={`${styles.balance} num ${balance < 0 ? 'out' : ''}`}>
          {goal ? money.total(balance) : '—'}
        </p>
        <div className={styles.monthRow}>
          <span className={styles.monthLabel}>This month</span>
          <span className={styles.monthStat}>
            <ArrowDownLeft className="in" aria-hidden="true" />
            <span className="sr-only">In</span>
            <span className="num">{month ? money.total(month.inEur) : '—'}</span>
          </span>
          <span className={styles.monthStat}>
            <ArrowUpRight className="out" aria-hidden="true" />
            <span className="sr-only">Out</span>
            <span className="num">{month ? money.total(month.outEur) : '—'}</span>
          </span>
        </div>
        <div className={styles.quick}>
          <Button
            variant="in"
            icon={<Plus />}
            onClick={() => sheet.open('in')}
            disabled={!online}
            block
          >
            Money in
          </Button>
          <Button
            variant="out"
            icon={<Minus />}
            onClick={() => sheet.open('out')}
            disabled={!online}
            block
          >
            Money out
          </Button>
        </div>
      </section>

      {goal && progress && (
        <Card aria-label="Goal progress">
          <div className={styles.goalHead}>
            <div>
              <p className={styles.goalName}>{goal.name}</p>
              <p className={styles.goalAmounts}>
                <span className="num">{money.total(Math.max(0, balance))}</span>
                <span className="muted">
                  {' of '}
                  <span className="num">{money.total(goal.amountEur)}</span>
                </span>
              </p>
            </div>
            <span className={`${styles.percent} num`}>{Math.floor(progress.fraction * 100)}%</span>
          </div>

          <ProgressTrail goal={goal} milestones={milestones} />

          <div className={styles.status}>
            {goal.achievedAt ? (
              <p className={styles.statusStrong}>Goal reached. Well done.</p>
            ) : progress.next ? (
              <p>
                Next: <strong>{progress.next.name}</strong>
                {' · '}
                <span className="num">{money.total(progress.remainingToNext)}</span> to go
              </p>
            ) : (
              <p>
                {milestones.length ? 'Every milestone reached. ' : ''}
                <span className="num">{money.total(progress.remainingToGoal)}</span> to the goal
              </p>
            )}
            {progress.latestAchieved && (
              <p className={styles.afford}>
                You can afford <strong>{progress.latestAchieved.name}</strong>
              </p>
            )}
          </div>
        </Card>
      )}

      <Card aria-label="Recent activity">
        <CardHeader
          title="Recent"
          action={
            recent?.data.length ? (
              <Link to="/transactions" className={styles.seeAll}>
                See all
              </Link>
            ) : null
          }
        />
        {recent && recent.data.length === 0 ? (
          <EmptyState icon={<ReceiptText />} title="Nothing here yet">
            Add the money you already have with <strong>Money in</strong>, then log what comes in
            and goes out.
          </EmptyState>
        ) : (
          <TransactionList items={recent?.data ?? []} />
        )}
      </Card>
    </div>
  );
}
