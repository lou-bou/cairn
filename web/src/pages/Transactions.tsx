import { useDeferredValue, useState } from 'react';
import { Minus, Plus, ReceiptText, Search, SlidersHorizontal, X } from 'lucide-react';
import { SOURCES, type Currency, type SourceId, type TxType } from '@cairn/shared';
import { useCategories, useTransactions, type TransactionFilters } from '../api/hooks';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card, EmptyState } from '../components/Card';
import { Field, Segmented, Select, TextInput } from '../components/Form';
import { TransactionList } from '../components/TransactionList';
import { useTransactionSheet } from '../components/TransactionSheet';
import { useOnline } from '../lib/online';
import styles from './Transactions.module.css';

const PAGE = 50;

export function TransactionsPage() {
  const sheet = useTransactionSheet();
  const online = useOnline();
  const { data: categories = [] } = useCategories();
  const [type, setType] = useState<TxType | 'all'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [source, setSource] = useState<SourceId | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const q = useDeferredValue(search.trim());

  const filters: TransactionFilters = {
    type: type === 'all' ? undefined : type,
    categoryId: categoryId || undefined,
    currency: currency || undefined,
    source: source || undefined,
    from: from || undefined,
    to: to || undefined,
    q: q || undefined,
    limit,
  };
  const { data, isPending } = useTransactions(filters);
  const activeCount =
    [categoryId, currency, source, from, to].filter(Boolean).length + (type !== 'all' ? 1 : 0);
  const visibleCategories = categories.filter((c) => type === 'all' || c.type === type);

  const clear = () => {
    setType('all');
    setCategoryId('');
    setCurrency('');
    setSource('');
    setFrom('');
    setTo('');
    setSearch('');
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Activity"
        actions={
          <>
            <Button
              variant="in"
              size="sm"
              icon={<Plus />}
              onClick={() => sheet.open('in')}
              disabled={!online}
            >
              In
            </Button>
            <Button
              variant="out"
              size="sm"
              icon={<Minus />}
              onClick={() => sheet.open('out')}
              disabled={!online}
            >
              Out
            </Button>
          </>
        }
      />

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <span className="sr-only">Search notes</span>
          <input
            type="search"
            placeholder="Search notes"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <Button
          variant="secondary"
          icon={<SlidersHorizontal />}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="tx-filters"
        >
          Filters{activeCount ? ` · ${activeCount}` : ''}
        </Button>
      </div>

      {showFilters && (
        <div id="tx-filters" className={styles.filters}>
          <Segmented
            label="Type"
            value={type}
            onChange={(t) => {
              setType(t);
              setCategoryId('');
              setLimit(PAGE);
            }}
            className={styles.typeFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'in', label: 'In', tone: 'in' },
              { value: 'out', label: 'Out', tone: 'out' },
            ]}
          />
          <div className={styles.filterGrid}>
            <Field label="Category" htmlFor="f-cat">
              <Select id="f-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All categories</option>
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type === 'in' ? 'in' : 'out'})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source" htmlFor="f-src">
              <Select
                id="f-src"
                value={source}
                onChange={(e) => setSource(e.target.value as SourceId | '')}
              >
                <option value="">Any source</option>
                {SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="f-from">
              <TextInput
                id="f-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="f-to">
              <TextInput
                id="f-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="Entered in" htmlFor="f-cur">
              <Select
                id="f-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency | '')}
              >
                <option value="">Any currency</option>
                <option value="EUR">EUR</option>
                <option value="DZD">DZD</option>
              </Select>
            </Field>
          </div>
          {(activeCount > 0 || search) && (
            <Button variant="ghost" size="sm" icon={<X />} onClick={clear} className={styles.clear}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <Card>
        {data && (
          <p className={styles.count}>
            {data.total === 1 ? '1 entry' : `${data.total} entries`}
            {activeCount || q ? ' match' : ''}
          </p>
        )}
        {data && data.data.length === 0 ? (
          activeCount || q ? (
            <EmptyState icon={<Search />} title="No matching entries">
              Try a different search or clear the filters.
            </EmptyState>
          ) : (
            <EmptyState icon={<ReceiptText />} title="No entries yet">
              Everything you add with Money in and Money out shows up here.
            </EmptyState>
          )
        ) : (
          <TransactionList items={data?.data ?? []} groupByDate />
        )}
        {isPending && !data && <p className="muted">Loading…</p>}
        {data && data.data.length < data.total && (
          <Button
            variant="secondary"
            block
            onClick={() => setLimit((l) => l + PAGE)}
            className={styles.more}
          >
            Show more
          </Button>
        )}
      </Card>
    </div>
  );
}
