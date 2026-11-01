import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ConflictChoice, ImportPreview, ImportResult, Mutation } from '@cairn/shared';
import { api, ApiError } from '../api/client';
import { keys } from '../api/hooks';
import { useOnline } from '../lib/online';
import { Button } from './Button';
import { Field, FormError, Segmented } from './Form';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import styles from './ImportSheet.module.css';

const ENTITY_SINGULAR = {
  transactions: 'Entry',
  milestones: 'Milestone',
  reconciliations: 'Count',
} as const;
const ENTITY_LABEL = {
  transactions: 'Entries',
  milestones: 'Milestones',
  reconciliations: 'Counts',
} as const;
const CHOICES: { value: ConflictChoice; label: string }[] = [
  { value: 'replace', label: 'Replace' },
  { value: 'keepBoth', label: 'Keep both' },
  { value: 'skip', label: 'Skip' },
];

/** Merge-import: preview what the file adds, then resolve conflicts like a file copy dialog. */
export function ImportSheet({
  file,
  preview,
  onClose,
}: {
  file: unknown;
  preview: ImportPreview;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [all, setAll] = useState<ConflictChoice>('skip');
  const [perRecord, setPerRecord] = useState<Record<string, ConflictChoice>>({});
  const [goal, setGoal] = useState<'keep' | 'replace'>('keep');
  const [settings, setSettings] = useState<'keep' | 'replace'>('keep');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalNew = Object.values(preview.counts).reduce((s, c) => s + c.new, 0);
  const totalSame = Object.values(preview.counts).reduce((s, c) => s + c.identical, 0);
  const nothingToDo =
    totalNew === 0 &&
    preview.conflicts.length === 0 &&
    !preview.goalDiffers &&
    !preview.settingsDiffer;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Mutation<ImportResult>>('/api/import', {
        file,
        resolution: { conflicts: all, perRecord, goal, settings },
      });
      for (const n of res.notices) toast.show(n, { duration: 7000 });
      const r = res.data;
      toast.show(
        `Imported: ${r.added} added, ${r.replaced} replaced, ${r.keptBoth} kept as copies, ${r.skipped} skipped`,
        { duration: 6000 },
      );
      await qc.invalidateQueries({ queryKey: keys.all });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Import data"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            block
            onClick={run}
            busy={busy}
            disabled={!online || nothingToDo}
          >
            {nothingToDo ? 'Nothing to import' : 'Import'}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <p className="muted">
          Export from {new Date(preview.exportedAt).toLocaleString()}. Nothing is deleted: new
          records are added, and you choose what happens where both sides changed. A backup of the
          current data is saved first.
        </p>

        <table className={styles.counts}>
          <thead>
            <tr>
              <th />
              <th>New</th>
              <th>Same</th>
              <th>Conflict</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(preview.counts) as (keyof typeof ENTITY_LABEL)[]).map((k) => (
              <tr key={k}>
                <th scope="row">{ENTITY_LABEL[k]}</th>
                <td className="num">{preview.counts[k].new}</td>
                <td className="num">{preview.counts[k].identical}</td>
                <td className="num">{preview.counts[k].conflicts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalSame > 0 && <p className={styles.small}>Records that are the same are skipped.</p>}

        {preview.conflicts.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.heading}>Changed on both sides</h3>
            <Field label="For all conflicts">
              <Segmented
                label="For all conflicts"
                value={all}
                onChange={(v) => {
                  setAll(v);
                  setPerRecord({});
                }}
                options={CHOICES}
              />
            </Field>
            <ul className={styles.conflicts}>
              {preview.conflicts.map((c) => (
                <li key={c.id} className={styles.conflict}>
                  <p className={styles.conflictKind}>{ENTITY_SINGULAR[c.entity]}</p>
                  <p>
                    <span className={styles.tag}>Here</span> {c.existing}
                  </p>
                  <p>
                    <span className={styles.tag}>File</span> {c.incoming}
                  </p>
                  <Segmented
                    label={`Choice for ${c.incoming}`}
                    size="sm"
                    value={perRecord[c.id] ?? all}
                    onChange={(v) => setPerRecord((p) => ({ ...p, [c.id]: v }))}
                    options={CHOICES}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {(preview.goalDiffers || preview.settingsDiffer) && (
          <section className={styles.section}>
            {preview.goalDiffers && (
              <Field label="Goal (name and amount)">
                <Segmented
                  label="Goal"
                  value={goal}
                  onChange={setGoal}
                  options={[
                    { value: 'keep', label: 'Keep current' },
                    { value: 'replace', label: 'Use imported' },
                  ]}
                />
              </Field>
            )}
            {preview.settingsDiffer && (
              <Field label="Settings (rate and reminder)">
                <Segmented
                  label="Settings"
                  value={settings}
                  onChange={setSettings}
                  options={[
                    { value: 'keep', label: 'Keep current' },
                    { value: 'replace', label: 'Use imported' },
                  ]}
                />
              </Field>
            )}
          </section>
        )}
        <FormError message={error} />
      </div>
    </Sheet>
  );
}
