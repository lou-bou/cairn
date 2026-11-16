import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';

Future<void> openPendingSheet(BuildContext context) =>
    showKitSheet<void>(context, builder: (_) => const PendingSheet());

String _describe(OutboxOp op) {
  final raw = op.payload['input'];
  if (raw is! Map) return 'Delete an entry';
  final input = TxInput.fromJson(Map<String, dynamic>.from(raw));
  final what = op.kind == 'tx.create' ? 'Add' : 'Edit';
  final sign = input.type == TxType.moneyIn ? '+' : '−';
  final note = input.note.isEmpty ? '' : ' · ${input.note}';
  return '$what $sign${formatMoney(input.amountOriginal, input.currency)} · '
      '${formatDay(input.date)}$note';
}

/// Changes made on the phone that the server has not confirmed yet.
class PendingSheet extends ConsumerWidget {
  const PendingSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final ops = ref.watch(outboxProvider);
    final outbox = ref.read(outboxProvider.notifier);
    final net = ref.watch(netStatusProvider);

    return KitSheet(
      title: 'Waiting to sync',
      footer: ops.isEmpty
          ? null
          : KitButton(
              label: 'Sync now',
              icon: LucideIcons.refreshCw,
              variant: ButtonVariant.primary,
              block: true,
              onPressed: () => ref.read(dataProvider.notifier).refresh(),
            ),
      child: ops.isEmpty
          ? const EmptyState(
              icon: LucideIcons.cloudCheck,
              title: 'Everything is synced',
              body: 'Changes you make without a connection wait here until the server is reachable.',
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  switch (net) {
                    NetState.offline => 'No connection to the server. These are sent when it is back.',
                    NetState.serverDown => 'The server is not answering. These are sent when it is back.',
                    NetState.accessDenied =>
                      'Cloudflare Access is refusing the service token. Fix it in Settings → '
                          'Connection and these will be sent.',
                    _ => 'These are saved on the phone and sent in order.',
                  },
                  style: context.text.bodyMedium!.copyWith(color: t.textMuted),
                ),
                const SizedBox(height: Space.s3),
                for (final op in ops)
                  Container(
                    margin: const EdgeInsets.only(bottom: Space.s2),
                    padding: const EdgeInsets.all(Space.s3),
                    decoration: BoxDecoration(
                      color: op.failed ? t.negativeSoft : t.surfaceSunken,
                      borderRadius: BorderRadius.circular(Radii.md),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_describe(op), style: context.text.bodyMedium!.num),
                        if (op.failed) ...[
                          const SizedBox(height: 4),
                          Text(
                            'The server refused this: ${op.error}',
                            style: context.text.bodySmall!.copyWith(color: t.negative),
                          ),
                        ],
                        const SizedBox(height: Space.s2),
                        Row(
                          children: [
                            if (op.failed) ...[
                              KitButton(
                                label: 'Try again',
                                small: true,
                                onPressed: () => outbox.retry(op.id),
                              ),
                              const SizedBox(width: Space.s2),
                            ],
                            KitButton(
                              label: 'Discard',
                              small: true,
                              variant: ButtonVariant.ghost,
                              onPressed: () async {
                                final ok = await confirmSheet(
                                  context,
                                  title: 'Discard this change?',
                                  message: 'It will not be sent to the server.',
                                  confirmLabel: 'Discard',
                                  danger: true,
                                );
                                if (ok) outbox.remove(op.id);
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}
