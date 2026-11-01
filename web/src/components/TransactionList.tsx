import { sourceName, type Category, type Transaction } from '@cairn/shared';
import { Scale } from 'lucide-react';
import { useCategories } from '../api/hooks';
import { categoryColor } from '../lib/categories';
import { useMoney } from '../lib/money';
import { formatDay } from '../lib/dates';
import { useTransactionSheet } from './TransactionSheet';
import styles from './TransactionList.module.css';

export function TransactionRow({
  tx,
  category,
  showDate = true,
}: {
  tx: Transaction;
  category?: Category;
  showDate?: boolean;
}) {
  const money = useMoney();
  const sheet = useTransactionSheet();
  const shown = money.record(tx);
  const signedRecord = tx.type === 'in' ? `+${shown}` : `−${shown}`;
  const showOriginal = tx.currency !== money.displayCurrency;
  const title = tx.note || category?.name || 'Entry';

  return (
    <li>
      <button type="button" className={styles.row} onClick={() => sheet.open(tx)}>
        <span
          className={styles.dot}
          style={{ background: categoryColor(tx.categoryId) }}
          aria-hidden="true"
        />
        <span className={styles.main}>
          <span className={styles.title}>{title}</span>
          <span className={styles.meta}>
            {[
              tx.note ? category?.name : null,
              tx.source !== 'other' ? sourceName(tx.source) : null,
              showDate ? formatDay(tx.date) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {tx.isAdjustment && (
              <span className={styles.adjustment}>
                <Scale /> Adjustment
              </span>
            )}
          </span>
        </span>
        <span className={styles.amounts}>
          <span className={`num ${styles.amount} ${tx.type === 'in' ? 'in' : ''}`}>
            {signedRecord}
          </span>
          {showOriginal && (
            <span className={`num ${styles.original}`}>
              {money.original(tx.amountOriginal, tx.currency)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function TransactionList({
  items,
  groupByDate = false,
}: {
  items: Transaction[];
  groupByDate?: boolean;
}) {
  const { data: categories = [] } = useCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));

  if (!groupByDate) {
    return (
      <ul className={styles.list}>
        {items.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} category={byId.get(tx.categoryId)} />
        ))}
      </ul>
    );
  }

  const groups = new Map<string, Transaction[]>();
  for (const tx of items) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx]);
  return (
    <div className={styles.groups}>
      {[...groups].map(([date, txs]) => (
        <section key={date}>
          <h3 className={styles.groupTitle}>{formatDay(date)}</h3>
          <ul className={styles.list}>
            {txs.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                category={byId.get(tx.categoryId)}
                showDate={false}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
