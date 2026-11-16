import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/store.dart';
import '../data/view.dart';
import '../domain/milestones.dart';
import 'pages/activity.dart';
import 'pages/goal.dart';
import 'pages/home.dart';
import 'pages/settings.dart';
import 'pages/stats.dart';
import 'sheets/pending_sheet.dart';
import 'theme.dart';
import 'widgets/confetti.dart';
import 'widgets/logo.dart';
import 'widgets/money_input.dart';

const _tabs = [
  (label: 'Home', icon: LucideIcons.house),
  (label: 'Activity', icon: LucideIcons.arrowLeftRight),
  (label: 'Goal', icon: LucideIcons.flag),
  (label: 'Stats', icon: LucideIcons.chartColumn),
  (label: 'Settings', icon: LucideIcons.settings),
];

/// The signed-in app: header, five tabs, background refresh and celebrations.
class Shell extends ConsumerStatefulWidget {
  const Shell({super.key});

  @override
  ConsumerState<Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<Shell>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  int _tab = 0;
  final _visited = {0};
  final _confetti = GlobalKey<ConfettiLayerState>();
  final _celebrated = <String>{};
  late final AnimationController _hop = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );
  Timer? _poll;
  StreamSubscription<void>? _connectivity;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startPolling();
    _connectivity = ref.read(networkRegainedProvider).listen((_) => _refresh(), onError: (_) {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refresh();
      _celebrate();
    });
  }

  void _refresh() => unawaited(ref.read(dataProvider.notifier).refresh());

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => _refresh());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
      _startPolling();
    } else if (state == AppLifecycleState.paused) {
      _poll?.cancel();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _connectivity?.cancel();
    _hop.dispose();
    super.dispose();
  }

  void _select(int i) {
    if (i == _tab) return;
    setState(() {
      _tab = i;
      _visited.add(i);
    });
  }

  /// Celebrate every achievement the server marks as not yet seen, then mark it seen, so each
  /// one celebrates once on whichever device opens first.
  void _celebrate() {
    final snapshot = ref.read(snapshotProvider);
    if (snapshot == null || ref.read(netStatusProvider) != NetState.ok) return;
    final goal = snapshot.goal;
    final fresh = [
      for (final m in snapshot.milestones)
        if (m.achievedAt != null &&
            !m.celebrationSeen &&
            !_celebrated.contains('m:${m.id}:${m.achievedAt}'))
          m,
    ];
    final goalFresh =
        goal.achievedAt != null &&
        !goal.celebrationSeen &&
        !_celebrated.contains('g:${goal.achievedAt}');
    if (fresh.isEmpty && !goalFresh) return;
    _celebrated.addAll([for (final m in fresh) 'm:${m.id}:${m.achievedAt}']);
    if (goalFresh) _celebrated.add('g:${goal.achievedAt}');

    _confetti.currentState?.fire(big: goalFresh);
    HapticFeedback.heavyImpact();
    if (goalFresh) {
      _hop.forward(from: 0);
      Toasts.show('You reached your goal: ${goal.name}', duration: const Duration(seconds: 8));
    } else {
      // Only the furthest new milestone gets a toast when several are reached at once.
      Toasts.show(
        'You can afford ${shortName(fresh.last.name)}',
        duration: const Duration(seconds: 6),
      );
    }
    unawaited(
      ref
          .read(dataProvider.notifier)
          .markCelebrated(milestoneIds: [for (final m in fresh) m.id], goal: goalFresh)
          .catchError((_) {}),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final c = context.cairn;
    ref.listen(snapshotProvider, (_, _) => _celebrate());
    final hasData = ref.watch(hasDataProvider);

    final pages = <Widget>[
      HomePage(onSeeAll: () => _select(1)),
      const ActivityPage(),
      const GoalPage(),
      const StatsPage(),
      const SettingsPage(),
    ];

    return PopScope(
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _select(0);
      },
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: overlayStyle(t, Theme.of(context).brightness),
        child: Scaffold(
          body: Stack(
            children: [
              SafeArea(
                bottom: false,
                child: Column(
                  children: [
                    _Header(hop: _hop),
                    Expanded(
                      child: !hasData
                          ? const _FirstLoad()
                          : Stack(
                              children: [
                                for (var i = 0; i < pages.length; i++)
                                  if (_visited.contains(i))
                                    // Offstage keeps each tab's state and scroll position
                                    // without painting or hit-testing it; the opacity gives
                                    // the incoming tab a quick fade.
                                    Positioned.fill(
                                      child: Offstage(
                                        offstage: i != _tab,
                                        child: AnimatedOpacity(
                                          opacity: i == _tab ? 1 : 0,
                                          duration: Motion.base,
                                          curve: Motion.easeOut,
                                          child: TickerMode(enabled: i == _tab, child: pages[i]),
                                        ),
                                      ),
                                    ),
                              ],
                            ),
                    ),
                  ],
                ),
              ),
              Positioned.fill(
                child: ConfettiLayer(
                  key: _confetti,
                  colors: [
                    t.accent,
                    t.positive,
                    c.category('funding'),
                    c.category('luxury'),
                    c.stoneMiddle,
                  ],
                ),
              ),
            ],
          ),
          bottomNavigationBar: _BottomNav(index: _tab, onSelect: _select),
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.hop});
  final AnimationController hop;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final display = ref.watch(displayCurrencyProvider);
    return SizedBox(
      height: 56,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.s4),
        child: Row(
          children: [
            AnimatedBuilder(
              animation: hop,
              builder: (context, _) {
                // Two quick hops that die out.
                final v = hop.value;
                final lift = v == 0 ? 0.0 : (1 - v) * (0.5 - (((v * 3) % 1) - 0.5).abs()) * 2;
                return Logo(size: 28, hop: lift);
              },
            ),
            const SizedBox(width: Space.s2),
            const Expanded(child: Align(alignment: Alignment.centerRight, child: _StatusPill())),
            const SizedBox(width: Space.s2),
            CurrencyToggle(
              value: display,
              dense: true,
              onChanged: (c) => ref.read(prefsProvider.notifier).set(displayCurrencyPref, c.code),
            ),
          ],
        ),
      ),
    );
  }
}

/// One pill at most: refused changes, then connection trouble, then changes waiting to sync.
class _StatusPill extends ConsumerWidget {
  const _StatusPill();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final net = ref.watch(netStatusProvider);
    final pending = ref.watch(pendingCountProvider);
    final waiting = pending.waiting > 0 ? ' · ${pending.waiting}' : '';

    final Widget? pill;
    if (pending.failed > 0) {
      pill = StatusPill(
        label: '${pending.failed} refused',
        icon: LucideIcons.triangleAlert,
        onTap: () => openPendingSheet(context),
      );
    } else if (net == NetState.accessDenied) {
      pill = StatusPill(
        label: 'Access refused$waiting',
        icon: LucideIcons.keyRound,
        onTap: () => openConnection(context),
      );
    } else if (net == NetState.offline || net == NetState.serverDown) {
      pill = StatusPill(
        label: '${net == NetState.offline ? 'Offline' : 'Server down'}$waiting',
        icon: LucideIcons.wifiOff,
        onTap: () {
          if (pending.waiting > 0) {
            openPendingSheet(context);
          } else {
            Toasts.show(
              net == NetState.offline
                  ? "Can't reach the server. Showing the last saved data; new entries are kept "
                        'on the phone and sent later.'
                  : 'The server is not answering. Showing the last saved data.',
              duration: const Duration(seconds: 5),
            );
            ref.read(dataProvider.notifier).refresh();
          }
        },
      );
    } else if (pending.waiting > 0) {
      pill = StatusPill(
        label: 'Syncing ${pending.waiting}',
        icon: LucideIcons.cloudUpload,
        warning: false,
        onTap: () => openPendingSheet(context),
      );
    } else {
      pill = null;
    }

    return AnimatedSwitcher(
      duration: Motion.base,
      child: pill == null
          ? const SizedBox.shrink(key: ValueKey('none'))
          : KeyedSubtree(key: ValueKey(pill.runtimeType.toString() + net.name), child: pill),
    );
  }
}

/// Shown only when there is no cached data at all (first launch, or it never loaded).
class _FirstLoad extends ConsumerWidget {
  const _FirstLoad();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(dataProvider);
    final error = data.error;
    if (error == null || data.refreshing) {
      return const Center(child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3)));
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Space.s6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            EmptyState(
              icon: error.kind == ApiFailure.accessDenied ? LucideIcons.keyRound : LucideIcons.wifiOff,
              title: error.kind == ApiFailure.accessDenied
                  ? 'Access refused the token'
                  : "Couldn't load your data",
              body: error.message,
            ),
            KitButton(
              label: 'Try again',
              variant: ButtonVariant.primary,
              onPressed: () => ref.read(dataProvider.notifier).refresh(),
            ),
            const SizedBox(height: Space.s2),
            KitButton(
              label: 'Connection settings',
              variant: ButtonVariant.ghost,
              onPressed: () => openConnection(context),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final bottom = MediaQuery.viewPaddingOf(context).bottom;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border)),
      ),
      padding: EdgeInsets.only(bottom: bottom),
      height: 62 + bottom,
      child: Row(
        children: [
          for (var i = 0; i < _tabs.length; i++)
            Expanded(
              child: Pressable(
                scale: 0.94,
                haptic: i != index,
                semanticLabel: _tabs[i].label,
                onTap: () => onSelect(i),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AnimatedContainer(
                      duration: Motion.base,
                      curve: Motion.easeOut,
                      width: 52,
                      height: 30,
                      decoration: BoxDecoration(
                        color: i == index ? t.accentSoft : Colors.transparent,
                        borderRadius: BorderRadius.circular(Radii.pill),
                      ),
                      child: Icon(
                        _tabs[i].icon,
                        size: 20,
                        color: i == index ? t.accentText : t.textMuted,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _tabs[i].label,
                      style: context.text.labelSmall!.copyWith(
                        letterSpacing: 0,
                        color: i == index ? t.text : t.textMuted,
                        fontWeight: i == index ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

