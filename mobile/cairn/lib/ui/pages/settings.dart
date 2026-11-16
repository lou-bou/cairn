import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../data/api.dart';
import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../sheets/import_sheet.dart';
import '../sheets/pending_sheet.dart';
import '../sheets/reconcile_sheet.dart';
import '../theme.dart';
import '../widgets/logo.dart';
import '../widgets/money_input.dart';
import '../widgets/page.dart';

const _weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/// Opens the connection form as its own screen. Used from Settings and the status pill.
Future<void> openConnection(BuildContext context) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) => Consumer(
        builder: (context, ref, _) => ConnectionScreen(
          appName: 'Cairn',
          healthPath: CairnApi.healthPath,
          isHealthy: CairnApi.isHealthy,
          onSaved: () {
            ref.read(dataProvider.notifier).refresh();
            Navigator.of(context).pop();
          },
        ),
      ),
    ),
  );
}

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    return PageList(
      children: [
        const PageTitle('Settings'),
        if (settings != null) ...[
          _RateCard(key: ValueKey(settings.defaultRate), settings: settings),
          _ReminderCard(settings: settings),
        ],
        const _DataCard(),
        const _BackupCard(),
        const _AppearanceCard(),
        const _CategoriesCard(),
        const _ConnectionCard(),
      ],
    );
  }
}

TextStyle _small(BuildContext context) => context.text.bodySmall!;

class _RateCard extends ConsumerStatefulWidget {
  const _RateCard({super.key, required this.settings});
  final Settings settings;

  @override
  ConsumerState<_RateCard> createState() => _RateCardState();
}

class _RateCardState extends ConsumerState<_RateCard> {
  late final _rate = TextEditingController(text: formatRate(widget.settings.defaultRate));
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _rate.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final int milli;
    try {
      milli = parseRate(_rate.text);
    } on MoneyError catch (e) {
      setState(() => _error = e.message);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await ref.read(dataProvider.notifier).saveSettings({'defaultRate': milli});
      Toasts.show('Rate saved');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Exchange rate'),
          KitField(
            label: 'DZD per €1',
            error: _error,
            hint:
                'Used for new entries and to show EUR amounts in DZD. Past entries keep the rate '
                'they were entered with.',
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _rate,
                    keyboardType: amountKeyboard,
                    inputFormatters: amountFormatters,
                    style: context.text.bodyLarge!.num,
                    onChanged: (_) => setState(() {}),
                    decoration: invalidIf(_error != null),
                  ),
                ),
                Space.s2.w,
                KitButton(
                  label: 'Save',
                  variant: ButtonVariant.primary,
                  busy: _busy,
                  onPressed: _rate.text.trim() == formatRate(widget.settings.defaultRate)
                      ? null
                      : _save,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A short list to pick one value from, as a sheet.
Future<T?> pickOption<T>(
  BuildContext context, {
  required String title,
  required List<(T, String)> options,
  required T current,
}) {
  return showKitSheet<T>(
    context,
    builder: (context) => KitSheet(
      title: title,
      child: Column(
        children: [
          for (final (value, label) in options)
            Pressable(
              scale: 0.99,
              onTap: () => Navigator.of(context).pop(value),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 13),
                child: Row(
                  children: [
                    Expanded(child: Text(label, style: context.text.bodyLarge)),
                    if (value == current)
                      Icon(LucideIcons.check, size: 18, color: context.kit.accentText),
                  ],
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class _ReminderCard extends ConsumerWidget {
  const _ReminderCard({required this.settings});
  final Settings settings;

  Future<void> _update(WidgetRef ref, Map<String, dynamic> patch) async {
    try {
      await ref.read(dataProvider.notifier).saveSettings(patch);
    } on ApiException catch (e) {
      Toasts.show(e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final history = ref.watch(snapshotProvider.select((s) => s?.reconciliations)) ?? const [];
    final freq = settings.reconcileFrequency;
    final dayLabel = freq == 'weekly'
        ? _weekdays[settings.reconcileDay.clamp(0, 6)]
        : 'Day ${settings.reconcileDay}${settings.reconcileDay > 28 ? ' (or the last day)' : ''}';

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CardHeader(
            title: 'Count reminder',
            action: KitButton(
              label: 'Count now',
              small: true,
              onPressed: () => openReconcileSheet(context),
            ),
          ),
          Text(
            'Every so often, count the money you actually have and check that the app matches.',
            style: context.text.bodyMedium!.copyWith(color: t.textMuted),
          ),
          Space.s4.h,
          KitField(
            label: 'How often',
            child: KitSegmented<String>(
              value: freq,
              onChanged: (v) => _update(ref, {'reconcileFrequency': v}),
              options: const [
                SegOption('weekly', 'Weekly'),
                SegOption('monthly', 'Monthly'),
                SegOption('off', 'Off'),
              ],
            ),
          ),
          if (freq != 'off') ...[
            Space.s4.h,
            KitField(
              label: freq == 'weekly' ? 'On' : 'On day',
              child: PickerField(
                value: dayLabel,
                icon: LucideIcons.chevronDown,
                onTap: () async {
                  final day = await pickOption<int>(
                    context,
                    title: freq == 'weekly' ? 'Count on' : 'Count on day',
                    current: settings.reconcileDay,
                    options: freq == 'weekly'
                        ? [for (var i = 0; i < 7; i++) (i, _weekdays[i])]
                        : [
                            for (var d = 1; d <= 31; d++)
                              (d, '$d${d > 28 ? ' (or the last day)' : ''}'),
                          ],
                  );
                  if (day != null) {
                    await _update(ref, {'reconcileFrequency': freq, 'reconcileDay': day});
                  }
                },
              ),
            ),
          ],
          if (settings.lastReconciledAt != null) ...[
            Space.s3.h,
            Text(
              'Last counted ${_lower(formatDay(localDateOf(settings.lastReconciledAt!)))}.',
              style: _small(context),
            ),
          ],
          if (history.isNotEmpty)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                iconColor: t.textMuted,
                collapsedIconColor: t.textMuted,
                title: Text('Past counts (${history.length})', style: context.text.labelLarge),
                children: [
                  for (final r in history)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Expanded(child: Text(formatDay(r.date), style: context.text.bodyMedium)),
                          Text(money.total(r.countedEur), style: context.text.bodyMedium!.num),
                          SizedBox(
                            width: 132,
                            child: Text(
                              '${r.differenceEur == 0 ? 'Matched' : money.total(r.differenceEur, signed: true)}'
                              '${r.adjustmentTransactionId != null ? ' · adjusted' : ''}',
                              textAlign: TextAlign.right,
                              style: _small(context).num,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

String _lower(String day) => day == 'Today' || day == 'Yesterday' ? day.toLowerCase() : day;

class _DataCard extends ConsumerStatefulWidget {
  const _DataCard();

  @override
  ConsumerState<_DataCard> createState() => _DataCardState();
}

class _DataCardState extends ConsumerState<_DataCard> {
  String? _busy;
  String? _error;

  Future<void> _guard(String what, Future<void> Function() action) async {
    setState(() {
      _busy = what;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on FormatException {
      if (mounted) setState(() => _error = 'That file is not valid JSON.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not read or save that file.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _export({required bool csv}) => _guard(csv ? 'csv' : 'json', () async {
    final api = ref.read(cairnApiProvider);
    final text = csv ? await api.exportCsv() : await api.exportJson();
    final name = csv
        ? 'cairn-transactions-${todayIso()}.csv'
        : 'cairn-export-${todayIso()}.json';
    if (!mounted) return;
    final how = await showKitSheet<String>(
      context,
      builder: (context) => KitSheet(
        title: name,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            KitButton(
              label: 'Save to this phone',
              icon: LucideIcons.download,
              variant: ButtonVariant.primary,
              block: true,
              onPressed: () => Navigator.of(context).pop('save'),
            ),
            Space.s2.h,
            KitButton(
              label: 'Share',
              icon: LucideIcons.share2,
              block: true,
              onPressed: () => Navigator.of(context).pop('share'),
            ),
          ],
        ),
      ),
    );
    final bytes = utf8.encode(text);
    if (how == 'save') {
      final uri = await FilePicker.saveFile(
        fileName: name,
        bytes: bytes,
        mimeType: csv ? 'text/csv' : 'application/json',
      );
      if (uri != null) Toasts.show('Saved $name');
    } else if (how == 'share') {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: csv ? 'text/csv' : 'application/json')]),
      );
    }
  });

  Future<void> _import() => _guard('import', () async {
    final picked = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['json']);
    if (picked == null) return;
    final file = jsonDecode(await picked.xFile.readAsString());
    final preview = await ref.read(cairnApiProvider).importPreview(file);
    if (mounted) await openImportSheet(context, file, preview);
  });

  @override
  Widget build(BuildContext context) {
    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Your data'),
          Wrap(
            spacing: Space.s2,
            runSpacing: Space.s2,
            children: [
              KitButton(
                label: 'Export JSON',
                icon: LucideIcons.download,
                small: true,
                busy: _busy == 'json',
                onPressed: _busy != null ? null : () => _export(csv: false),
              ),
              KitButton(
                label: 'Export CSV',
                icon: LucideIcons.download,
                small: true,
                busy: _busy == 'csv',
                onPressed: _busy != null ? null : () => _export(csv: true),
              ),
              KitButton(
                label: 'Import JSON',
                icon: LucideIcons.upload,
                small: true,
                busy: _busy == 'import',
                onPressed: _busy != null ? null : _import,
              ),
            ],
          ),
          Space.s3.h,
          Text(
            'JSON holds everything and can be imported back. CSV is the list of entries, for '
            'spreadsheets. Importing merges with what is here. All three need the server.',
            style: _small(context),
          ),
          if (_error != null) ...[Space.s3.h, FormError(_error)],
        ],
      ),
    );
  }
}

String _bytes(int n) {
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) return '${(n / 1024).round()} KB';
  final tenths = (n * 10 / (1024 * 1024)).round();
  return '${tenths ~/ 10}.${tenths % 10} MB';
}

class _BackupCard extends ConsumerWidget {
  const _BackupCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(snapshotProvider.select((s) => s?.backup));
    if (status == null) return const SizedBox.shrink();
    final t = context.kit;
    final ok = status.state == 'ok' && !status.stale;
    final title = status.state == 'unknown'
        ? 'No backup has run yet'
        : ok
        ? 'Backed up'
        : status.state == 'error'
        ? 'The last backup failed'
        : 'The last backup is more than 36 hours old';

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Backups'),
          Container(
            padding: const EdgeInsets.all(Space.s3),
            decoration: BoxDecoration(
              color: ok ? t.positiveSoft : t.warningSoft,
              borderRadius: BorderRadius.circular(Radii.md),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  ok
                      ? LucideIcons.cloudCheck
                      : status.state == 'unknown'
                      ? LucideIcons.cloudOff
                      : LucideIcons.triangleAlert,
                  size: 20,
                  color: ok ? t.positive : t.warningText,
                ),
                Space.s3.w,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: context.text.titleSmall),
                      2.h,
                      Text(
                        'Last success: ${formatTimestamp(status.lastSuccessAt)}'
                        '${status.sizeBytes != null ? ' · ${_bytes(status.sizeBytes!)}' : ''}',
                        style: _small(context),
                      ),
                      if (status.error != null)
                        Text('Error: ${status.error}', style: _small(context)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Space.s3.h,
          Text(
            'Daily copies are kept on the server and in Google Drive for 30 days.',
            style: _small(context),
          ),
        ],
      ),
    );
  }
}

class _AppearanceCard extends ConsumerWidget {
  const _AppearanceCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(prefProvider(themeModePref)) ?? 'system';
    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Appearance'),
          KitSegmented<String>(
            value: mode,
            onChanged: (v) => ref.read(prefsProvider.notifier).set(themeModePref, v),
            options: const [
              SegOption('system', 'System'),
              SegOption('light', 'Light'),
              SegOption('dark', 'Dark'),
            ],
          ),
        ],
      ),
    );
  }
}

class _CategoriesCard extends ConsumerWidget {
  const _CategoriesCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    Widget column(TxType type) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('MONEY ${type.code.toUpperCase()}', style: context.text.labelSmall),
          Space.s2.h,
          for (final c in categories.where((c) => c.type == type))
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: context.cairn.category(c.id),
                      shape: BoxShape.circle,
                    ),
                  ),
                  Space.s2.w,
                  Text(c.name, style: context.text.bodyMedium),
                ],
              ),
            ),
        ],
      ),
    );

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Categories'),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [column(TxType.moneyIn), column(TxType.moneyOut)],
          ),
          Space.s2.h,
          Text('Categories are fixed so totals stay comparable over time.', style: _small(context)),
        ],
      ),
    );
  }
}

class _ConnectionCard extends ConsumerWidget {
  const _ConnectionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final conn = ref.watch(connectionProvider);
    final net = ref.watch(netStatusProvider);
    final data = ref.watch(dataProvider);
    final pending = ref.watch(pendingCountProvider);
    final (String label, Color color) = switch (net) {
      NetState.ok => ('Connected', t.positive),
      NetState.offline => ('Offline', t.warningText),
      NetState.serverDown => ('Server not answering', t.warningText),
      NetState.accessDenied => ('Access refused the token', t.negative),
      NetState.unknown => ('Not checked yet', t.textMuted),
    };

    Widget row(String k, String v, {Color? color}) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(k, style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
          ),
          Expanded(
            child: Text(
              v,
              style: context.text.bodyMedium!.copyWith(color: color, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Connection'),
          row('Server', Uri.tryParse(conn?.baseUrl ?? '')?.host ?? '—'),
          row(
            'Token',
            conn == null || !conn.hasToken
                ? 'None'
                : '${conn.clientId.substring(0, conn.clientId.length.clamp(0, 8))}…',
          ),
          row('Status', label, color: color),
          row('Last sync', formatTimestamp(data.snapshot?.fetchedAt)),
          if (pending.waiting + pending.failed > 0)
            row(
              'Waiting',
              '${pending.waiting + pending.failed} '
                  '${pending.waiting + pending.failed == 1 ? 'change' : 'changes'}'
                  '${pending.failed > 0 ? ' (${pending.failed} refused)' : ''}',
              color: pending.failed > 0 ? t.negative : t.warningText,
            ),
          Space.s2.h,
          Wrap(
            spacing: Space.s2,
            runSpacing: Space.s2,
            children: [
              KitButton(
                label: 'Edit connection',
                icon: LucideIcons.keyRound,
                small: true,
                onPressed: () => openConnection(context),
              ),
              KitButton(
                label: 'Sync now',
                icon: LucideIcons.refreshCw,
                small: true,
                busy: data.refreshing,
                onPressed: () => ref.read(dataProvider.notifier).refresh(),
              ),
              if (pending.waiting + pending.failed > 0)
                KitButton(
                  label: 'Waiting changes',
                  icon: LucideIcons.cloudUpload,
                  small: true,
                  onPressed: () => openPendingSheet(context),
                ),
            ],
          ),
          Space.s5.h,
          Center(child: Opacity(opacity: 0.5, child: const LogoMark(size: 24))),
        ],
      ),
    );
  }
}
