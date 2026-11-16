import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';

const pagePadding = EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, Space.s8);

class PageTitle extends StatelessWidget {
  const PageTitle(this.title, {super.key, this.actions = const []});

  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.s3, top: Space.s1),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: context.text.displayMedium!.copyWith(
                fontFamily: kitDisplay,
                fontWeight: FontWeight.w800,
                fontVariations: const [FontVariation.weight(800)],
              ),
            ),
          ),
          for (final a in actions) Padding(padding: const EdgeInsets.only(left: Space.s2), child: a),
        ],
      ),
    );
  }
}

/// A scrolling page of cards with pull-to-refresh.
class PageList extends ConsumerWidget {
  const PageList({super.key, required this.children, this.slivers});

  final List<Widget> children;

  /// Extra lazily built content after [children].
  final List<Widget>? slivers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      color: context.kit.accentText,
      backgroundColor: context.kit.surface,
      onRefresh: () => ref.read(dataProvider.notifier).refresh(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverPadding(
            padding: slivers == null ? pagePadding : pagePadding.copyWith(bottom: 0),
            sliver: SliverList.separated(
              itemCount: children.length,
              itemBuilder: (_, i) => children[i],
              separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
            ),
          ),
          ...?slivers,
        ],
      ),
    );
  }
}

extension Gap on num {
  SizedBox get h => SizedBox(height: toDouble());
  SizedBox get w => SizedBox(width: toDouble());
}
