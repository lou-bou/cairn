import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/view.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../sheets/tx_sheet.dart';
import '../theme.dart';

class TxRow extends ConsumerWidget {
  const TxRow({super.key, required this.tx, this.showDate = true});

  final Tx tx;
  final bool showDate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final category = ref
        .watch(categoriesProvider)
        .where((c) => c.id == tx.categoryId)
        .firstOrNull;
    final shown = money.record(
      amountOriginal: tx.amountOriginal,
      currency: tx.currency,
      amountEur: tx.amountEur,
    );
    final isIn = tx.type == TxType.moneyIn;
    final title = tx.note.isNotEmpty ? tx.note : (category?.name ?? 'Entry');
    final meta = [
      if (tx.note.isNotEmpty && category != null) category.name,
      if (tx.source != 'other') sourceName(tx.source),
      if (showDate) formatDay(tx.date),
    ].join(' · ');

    return Pressable(
      scale: 0.985,
      onTap: () => openTxSheet(context, tx: tx),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: context.cairn.category(tx.categoryId),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: Space.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodyLarge!.copyWith(fontWeight: FontWeight.w500),
                  ),
                  if (meta.isNotEmpty || tx.isAdjustment || tx.pending)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Row(
                        children: [
                          if (tx.pending) ...[
                            Icon(LucideIcons.cloudUpload, size: 13, color: t.warningText),
                            const SizedBox(width: 4),
                          ],
                          Flexible(
                            child: Text(
                              meta,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: context.text.bodySmall,
                            ),
                          ),
                          if (tx.isAdjustment) ...[
                            if (meta.isNotEmpty) const SizedBox(width: 6),
                            Icon(LucideIcons.scale, size: 12, color: t.textMuted),
                            const SizedBox(width: 3),
                            Text('Adjustment', style: context.text.bodySmall),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: Space.s3),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${isIn ? '+' : '−'}$shown',
                  style: context.text.bodyLarge!.num.copyWith(
                    fontWeight: FontWeight.w600,
                    color: isIn ? t.positive : t.text,
                  ),
                ),
                if (tx.currency != money.display)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      formatMoney(tx.amountOriginal, tx.currency),
                      style: context.text.bodySmall!.num,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Rows separated by hairlines, for use inside a card.
class TxColumn extends StatelessWidget {
  const TxColumn({super.key, required this.items, this.showDate = true, this.swipeToDelete});

  final List<Tx> items;
  final bool showDate;

  /// When set, rows can be swiped away; called after the user confirms.
  final void Function(Tx tx)? swipeToDelete;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) Divider(color: t.border, height: 1),
          if (swipeToDelete == null)
            TxRow(key: ValueKey(items[i].id), tx: items[i], showDate: showDate)
          else
            Dismissible(
              key: ValueKey('swipe-${items[i].id}'),
              direction: DismissDirection.endToStart,
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: Space.s4),
                decoration: BoxDecoration(
                  color: t.negativeSoft,
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: Icon(LucideIcons.trash2, color: t.negative, size: 20),
              ),
              confirmDismiss: (_) => confirmSheet(
                context,
                title: 'Delete this entry?',
                message: 'It is removed from the balance and the stats.',
                confirmLabel: 'Delete',
                danger: true,
              ),
              onDismissed: (_) => swipeToDelete!(items[i]),
              child: TxRow(tx: items[i], showDate: showDate),
            ),
        ],
      ],
    );
  }
}
