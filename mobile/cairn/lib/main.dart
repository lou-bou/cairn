import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';

import 'app.dart';
import 'ui/state.dart';

Future<void> main() async {
  // Loads the saved connection and opens the on-disk cache, so the first frame already has data.
  final boot = await KitBoot.start();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  runApp(
    ProviderScope(
      overrides: [
        ...boot.overrides,
        // The splash belongs to a launch that opens into the app, not to first-run setup.
        splashProvider.overrideWithValue(boot.connection != null),
      ],
      child: const CairnApp(),
    ),
  );
}
