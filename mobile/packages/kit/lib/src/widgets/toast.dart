import 'package:material_ui/material_ui.dart';

/// Give this to MaterialApp.scaffoldMessengerKey so toasts work from anywhere.
final kitMessengerKey = GlobalKey<ScaffoldMessengerState>();

abstract final class Toasts {
  static void show(String message, {Duration duration = const Duration(seconds: 3)}) {
    final messenger = kitMessengerKey.currentState;
    if (messenger == null) return;
    messenger.showSnackBar(
      SnackBar(content: Text(message), duration: duration, dismissDirection: DismissDirection.down),
    );
  }
}
