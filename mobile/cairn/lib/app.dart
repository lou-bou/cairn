import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import 'data/api.dart';
import 'data/store.dart';
import 'ui/shell.dart';
import 'ui/theme.dart';
import 'ui/widgets/logo.dart';

class CairnApp extends ConsumerWidget {
  const CairnApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connected = ref.watch(connectionProvider.select((c) => c != null));
    // A different server means different data: never show one server's cache for another.
    ref.listen(connectionProvider.select((c) => c?.baseUrl), (previous, next) {
      if (previous != null && previous != next) ref.read(dataProvider.notifier).reset();
    });

    return MaterialApp(
      title: 'Cairn',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: kitMessengerKey,
      theme: cairnLightTheme,
      darkTheme: cairnDarkTheme,
      themeMode: ref.watch(themeModeProvider),
      home: connected
          ? const Shell()
          : Builder(
              builder: (context) => AnnotatedRegion<SystemUiOverlayStyle>(
                value: overlayStyle(context.kit, Theme.of(context).brightness),
                child: const ConnectionScreen(
                  appName: 'Cairn',
                  healthPath: CairnApi.healthPath,
                  isHealthy: CairnApi.isHealthy,
                  firstRun: true,
                  header: Logo(size: 44),
                ),
              ),
            ),
    );
  }
}
