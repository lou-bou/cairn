import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../sheets/tx_sheet.dart';
import '../widgets/page.dart';
import '../widgets/tx_list.dart';

class TxFilter {
  const TxFilter({this.type, this.categoryId, this.currency, this.source, this.from, this.to});

  final TxType? type;
  final String? categoryId;
  final Currency? currency;
  final String? source;
  final String? from;
  final String? to;

  int get activeCount =>
      [type, categoryId, currency, source, from, to].where((v) => v != null).length;

  bool matches(Tx t) =>
      (type == null || t.type == type) &&
      (categoryId == null || t.categoryId == categoryId) &&
      (currency == null || t.currency == currency) &&
      (source == null || t.source == source) &&
      (from == null || t.date.compareTo(from!) >= 0) &&
      (to == null || t.date.compareTo(to!) <= 0);
}

/// Filter and search, done on the phone over the full list, so it is instant and works offline.
List<Tx> filterTransactions(List<Tx> all, TxFilter filter, String query) {
  final q = query.trim().toLowerCase();
  return [
    for (final t in all)
      if (filter.matches(t) && (q.isEmpty || t.note.toLowerCase().contains(q))) t,
  ];
}

class ActivityPage extends ConsumerStatefulWidget {
  const ActivityPage({super.key});

  @override
  ConsumerState<ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends ConsumerState<ActivityPage> {
  final _search = TextEditingController();
  TxFilter _filter = const TxFilter();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _openFilters() async {
    final next = await showKitSheet<TxFilter>(context, builder: (_) => _FilterSheet(initial: _filter));
    if (next != null) setState(() => _filter = next);
  }

  void _clear() {
    _search.clear();
    setState(() {
      _filter = const TxFilter();
      _query = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final all = ref.watch(transactionsProvider);
    final items = filterTransactions(all, _filter, _query);
    final filtering = _filter.activeCount > 0 || _query.trim().isNotEmpty;

    // Consecutive entries of the same day form one card.
    final groups = <(String, List<Tx>)>[];
    for (final tx in items) {
      if (groups.isEmpty || groups.last.$1 != tx.date) groups.add((tx.date, []));
      groups.last.$2.add(tx);
    }

    return PageList(
      slivers: [
        if (items.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s4, Space.s8),
              child: KitCard(
                child: filtering
                    ? const EmptyState(
                        icon: LucideIcons.search,
                        title: 'No matching entries',
                        body: 'Try a different search or clear the filters.',
                      )
                    : const EmptyState(
                        icon: LucideIcons.receiptText,
                        title: 'No entries yet',
                        body: 'Everything you add with Money in and Money out shows up here.',
                      ),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s8),
            sliver: SliverList.builder(
              itemCount: groups.length,
              itemBuilder: (context, i) {
                final (date, txs) = groups[i];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(Space.s1, Space.s4, 0, Space.s2),
                      child: Text(formatDay(date).toUpperCase(), style: context.text.labelSmall),
                    ),
                    KitCard(
                      padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s1),
                      child: TxColumn(
                        items: txs,
                        showDate: false,
                        swipeToDelete: (tx) {
                          ref.read(dataProvider.notifier).deleteTx(tx.id);
                          Toasts.show('Deleted');
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
      ],
      children: [
        PageTitle(
          'Activity',
          actions: [
            KitButton(
              label: 'In',
              icon: LucideIcons.plus,
              small: true,
              variant: ButtonVariant.positive,
              onPressed: () => openTxSheet(context, type: TxType.moneyIn),
            ),
            KitButton(
              label: 'Out',
              icon: LucideIcons.minus,
              small: true,
              variant: ButtonVariant.negative,
              onPressed: () => openTxSheet(context, type: TxType.moneyOut),
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: 'Search notes',
                  prefixIcon: Icon(LucideIcons.search, size: 18, color: t.textMuted),
                  prefixIconConstraints: const BoxConstraints(minWidth: 40),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: Icon(LucideIcons.x, size: 16, color: t.textMuted),
                          onPressed: () {
                            _search.clear();
                            setState(() => _query = '');
                          },
                        ),
                ),
              ),
            ),
            Space.s2.w,
            KitButton(
              label: _filter.activeCount > 0 ? 'Filters · ${_filter.activeCount}' : 'Filters',
              icon: LucideIcons.slidersHorizontal,
              onPressed: _openFilters,
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: Text(
                '${items.length == 1 ? '1 entry' : '${items.length} entries'}'
                '${filtering ? (items.length == 1 ? ' matches' : ' match') : ''}',
                style: context.text.bodySmall,
              ),
            ),
            if (filtering)
              Pressable(
                onTap: _clear,
                child: Text(
                  'Clear filters',
                  style: context.text.labelMedium!.copyWith(
                    color: t.accentText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.initial});
  final TxFilter initial;

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late TxType? _type = widget.initial.type;
  late String? _categoryId = widget.initial.categoryId;
  late Currency? _currency = widget.initial.currency;
  late String? _source = widget.initial.source;
  late String? _from = widget.initial.from;
  late String? _to = widget.initial.to;

  @override
  Widget build(BuildContext context) {
    final categories = ref
        .watch(categoriesProvider)
        .where((c) => _type == null || c.type == _type)
        .toList();
    final today = todayIso();

    return KitSheet(
      title: 'Filters',
      footer: Row(
        children: [
          KitButton(
            label: 'Clear',
            variant: ButtonVariant.ghost,
            onPressed: () => Navigator.of(context).pop(const TxFilter()),
          ),
          Space.s2.w,
          Expanded(
            child: KitButton(
              label: 'Show entries',
              variant: ButtonVariant.primary,
              block: true,
              onPressed: () => Navigator.of(context).pop(
                TxFilter(
                  type: _type,
                  categoryId: _categoryId,
                  currency: _currency,
                  source: _source,
                  from: _from,
                  to: _to,
                ),
              ),
            ),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          KitField(
            label: 'Type',
            child: KitSegmented<TxType?>(
              value: _type,
              onChanged: (v) => setState(() {
                _type = v;
                _categoryId = null;
              }),
              options: const [
                SegOption(null, 'All'),
                SegOption(TxType.moneyIn, 'In', tone: Tone.positive),
                SegOption(TxType.moneyOut, 'Out', tone: Tone.negative),
              ],
            ),
          ),
          Space.s4.h,
          KitField(
            label: 'Category',
            child: KitChips<String?>(
              value: _categoryId,
              onChanged: (v) => setState(() => _categoryId = v),
              options: [
                const ChipOption(null, 'All'),
                for (final c in categories)
                  ChipOption(c.id, _type == null ? '${c.name} (${c.type.code})' : c.name),
              ],
            ),
          ),
          Space.s4.h,
          KitField(
            label: 'Source',
            child: KitChips<String?>(
              value: _source,
              onChanged: (v) => setState(() => _source = v),
              options: [
                const ChipOption(null, 'Any'),
                for (final s in sources) ChipOption(s.id, s.name),
              ],
            ),
          ),
          Space.s4.h,
          Row(
            children: [
              Expanded(
                child: KitField(
                  label: 'From',
                  child: PickerField(
                    value: _from == null ? null : formatDay(_from!),
                    placeholder: 'Any date',
                    icon: LucideIcons.calendar,
                    onTap: () async {
                      final d = await pickDate(context, _from ?? _to ?? today, max: _to);
                      if (d != null) setState(() => _from = d);
                    },
                  ),
                ),
              ),
              Space.s3.w,
              Expanded(
                child: KitField(
                  label: 'To',
                  child: PickerField(
                    value: _to == null ? null : formatDay(_to!),
                    placeholder: 'Any date',
                    icon: LucideIcons.calendar,
                    onTap: () async {
                      final d = await pickDate(context, _to ?? _from ?? today, min: _from);
                      if (d != null) setState(() => _to = d);
                    },
                  ),
                ),
              ),
            ],
          ),
          if (_from != null || _to != null)
            Align(
              alignment: Alignment.centerLeft,
              child: KitButton(
                label: 'Any date',
                small: true,
                variant: ButtonVariant.ghost,
                onPressed: () => setState(() => _from = _to = null),
              ),
            ),
          Space.s4.h,
          KitField(
            label: 'Entered in',
            child: KitSegmented<Currency?>(
              value: _currency,
              onChanged: (v) => setState(() => _currency = v),
              options: const [
                SegOption(null, 'Any'),
                SegOption(Currency.eur, 'EUR'),
                SegOption(Currency.dzd, 'DZD'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
