import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The splash plays once, on a cold start that opens straight into the app. main.dart turns it
/// off when the app starts on the connection screen; tests and screenshots turn it off too.
final splashProvider = Provider<bool>((_) => true);
