import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import 'milestone_sheet.dart' show showNotices;

const _entityLabel = {
  'transactions': 'Entries',
  'milestones': 'Milestones',
  'reconciliations': 'Counts',
};
const _entitySingular = {
  'transactions': 'Entry',
  'milestones': 'Milestone',
  'reconciliations': 'Count',
};
const _choices = [
  SegOption('replace', 'Replace'),
  SegOption('keepBoth', 'Keep both'),
  SegOption('skip', 'Skip'),
];
const _keepOrUse = [SegOption('keep', 'Keep current'), SegOption('replace', 'Use imported')];

Future<void> openImportSheet(BuildContext context, Object? file, ImportPreview preview) =>
    showKitSheet<void>(context, builder: (_) => ImportSheet(file: file, preview: preview));

/// Merge-import: preview what the file adds, then resolve conflicts like a file copy dialog.
class ImportSheet extends ConsumerStatefulWidget {
  const ImportSheet({super.key, required this.file, required this.preview});

  final Object? file;
  final ImportPreview preview;

  @override
  ConsumerState<ImportSheet> createState() => _ImportSheetState();
}

class _ImportSheetState extends ConsumerState<ImportSheet> {
  String _all = 'skip';
  Map<String, String> _perRecord = {};
  String _goal = 'keep';
  String _settings = 'keep';
  bool _busy = false;
  String? _error;

  Future<void> _run() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref.read(cairnApiProvider).importRun(widget.file, {
        'conflicts': _all,
        'perRecord': _perRecord,
        'goal': _goal,
        'settings': _settings,
      });
      await ref.read(dataProvider.notifier).refresh();
      if (!mounted) return;
      showNotices(res.notices);
      final r = res.data;
      Toasts.show(
        'Imported: ${r['added']} added, ${r['replaced']} replaced, ${r['keptBoth']} kept as '
        'copies, ${r['skipped']} skipped',
        duration: const Duration(seconds: 6),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final p = widget.preview;
    final totalNew = p.counts.values.fold(0, (s, c) => s + c.fresh);
    final totalSame = p.counts.values.fold(0, (s, c) => s + c.identical);
    final nothingToDo =
        totalNew == 0 && p.conflicts.isEmpty && !p.goalDiffers && !p.settingsDiffer;
    final muted = context.text.bodyMedium!.copyWith(color: t.textMuted);
    final head = context.text.labelSmall!;
    final num = context.text.bodyMedium!.num;

    Widget cell(String s, TextStyle style) =>
        SizedBox(width: 64, child: Text(s, style: style, textAlign: TextAlign.right));

    return KitSheet(
      title: 'Import data',
      footer: Row(
        children: [
          KitButton(
            label: 'Cancel',
            variant: ButtonVariant.ghost,
            onPressed: () => Navigator.of(context).pop(),
          ),
          const SizedBox(width: Space.s2),
          Expanded(
            child: KitButton(
              label: nothingToDo ? 'Nothing to import' : 'Import',
              variant: ButtonVariant.primary,
              block: true,
              busy: _busy,
              onPressed: nothingToDo ? null : _run,
            ),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Export from ${formatTimestamp(p.exportedAt)}. Nothing is deleted: new records are '
            'added, and you choose what happens where both sides changed. A backup of the current '
            'data is saved first.',
            style: muted,
          ),
          const SizedBox(height: Space.s4),
          Row(
            children: [
              const Expanded(child: SizedBox()),
              cell('NEW', head),
              cell('SAME', head),
              cell('CONFLICT', head),
            ],
          ),
          for (final e in p.counts.entries)
            Padding(
              padding: const EdgeInsets.only(top: Space.s2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(_entityLabel[e.key] ?? e.key, style: context.text.bodyMedium),
                  ),
                  cell('${e.value.fresh}', num),
                  cell('${e.value.identical}', num),
                  cell('${e.value.conflicts}', num),
                ],
              ),
            ),
          if (totalSame > 0) ...[
            const SizedBox(height: Space.s2),
            Text('Records that are the same are skipped.', style: context.text.bodySmall),
          ],
          if (p.conflicts.isNotEmpty) ...[
            const SizedBox(height: Space.s5),
            Text('Changed on both sides', style: context.text.titleSmall),
            const SizedBox(height: Space.s3),
            KitField(
              label: 'For all conflicts',
              child: KitSegmented<String>(
                value: _all,
                options: _choices,
                onChanged: (v) => setState(() {
                  _all = v;
                  _perRecord = {};
                }),
              ),
            ),
            for (final c in p.conflicts)
              Container(
                margin: const EdgeInsets.only(top: Space.s3),
                padding: const EdgeInsets.all(Space.s3),
                decoration: BoxDecoration(
                  color: t.surfaceSunken,
                  borderRadius: BorderRadius.circular(Radii.md),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text((_entitySingular[c.entity] ?? c.entity).toUpperCase(), style: head),
                    const SizedBox(height: 6),
                    Text('Here: ${c.existing}', style: context.text.bodyMedium),
                    const SizedBox(height: 2),
                    Text('File: ${c.incoming}', style: context.text.bodyMedium),
                    const SizedBox(height: Space.s2),
                    KitSegmented<String>(
                      dense: true,
                      value: _perRecord[c.id] ?? _all,
                      options: _choices,
                      onChanged: (v) => setState(() => _perRecord = {..._perRecord, c.id: v}),
                    ),
                  ],
                ),
              ),
          ],
          if (p.goalDiffers) ...[
            const SizedBox(height: Space.s5),
            KitField(
              label: 'Goal (name and amount)',
              child: KitSegmented<String>(
                value: _goal,
                options: _keepOrUse,
                onChanged: (v) => setState(() => _goal = v),
              ),
            ),
          ],
          if (p.settingsDiffer) ...[
            const SizedBox(height: Space.s4),
            KitField(
              label: 'Settings (rate and reminder)',
              child: KitSegmented<String>(
                value: _settings,
                options: _keepOrUse,
                onChanged: (v) => setState(() => _settings = v),
              ),
            ),
          ],
          if (_error != null) ...[const SizedBox(height: Space.s4), FormError(_error)],
        ],
      ),
    );
  }
}
