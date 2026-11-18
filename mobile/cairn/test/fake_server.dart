import 'dart:async';
import 'dart:io';

import 'package:cairn/domain/money.dart';
import 'package:cairn/ui/state.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:kit/testing.dart';

const testConnection = ServerConnection(
  baseUrl: 'https://cairn.test',
  clientId: 'id.access',
  clientSecret: 'secret',
);

/// An in-memory stand-in for the Cairn API, with switches for the failures the app must survive.
class FakeCairn {
  FakeCairn() {
    adapter = FakeAdapter(_handle);
  }

  late final FakeAdapter adapter;
  final List<Map<String, dynamic>> transactions = [];
  List<Map<String, dynamic>> milestones = [];
  Map<String, dynamic> settings = {
    'defaultRate': 275000,
    'reconcileFrequency': 'off',
    'reconcileDay': 1,
    'lastReconciledAt': null,
    'reconcileSnoozedUntil': null,
  };
  int goalAmount = 300000;

  /// No route to the server.
  bool offline = false;

  /// Cloudflare Access redirects to its login page.
  bool accessDenied = false;

  /// While set, every request waits for it (a slow first load).
  Completer<void>? hold;

  /// The next write is stored, but the phone never hears back.
  bool loseNextResponse = false;
  int _nextId = 1;

  /// Writes that actually arrived (requests made while offline never did).
  final List<String> writes = [];

  int get balance =>
      transactions.fold(0, (s, t) => s + (t['type'] == 'in' ? 1 : -1) * (t['amountEur'] as int));

  Map<String, dynamic> seed(String date, String type, int cents, {String note = ''}) {
    final t = _store({
      'type': type,
      'date': date,
      'note': note,
      'amountOriginal': cents,
      'currency': 'EUR',
      'rate': 275000,
      'categoryId': type == 'in' ? 'income' : 'living',
      'source': 'cash',
      'isAdjustment': false,
    });
    return t;
  }

  Map<String, dynamic> _store(Map<String, dynamic> input, [String? id]) {
    final now = DateTime.utc(2026, 11, 16, 12, 0, _nextId).toIso8601String();
    final t = <String, dynamic>{
      ...input,
      'id': id ?? 'srv-${_nextId++}',
      'amountEur': toEurCents(
        input['amountOriginal'] as int,
        Currency.parse(input['currency']),
        input['rate'] as int,
      ),
      'createdAt': now,
      'updatedAt': now,
    };
    transactions.removeWhere((x) => x['id'] == t['id']);
    transactions.add(t);
    return t;
  }

  Map<String, dynamic> get _goal => {
    'name': 'Move abroad',
    'mode': 'custom',
    'customOriginal': goalAmount,
    'currency': 'EUR',
    'rate': 275000,
    'customEur': goalAmount,
    'amountEur': goalAmount,
    'milestoneSumEur': milestones.fold<int>(0, (s, m) => s + (m['costEur'] as int)),
    'balanceEur': balance,
    'achievedAt': null,
    'celebrationSeen': true,
  };

  Future<FakeResponse> _handle(RequestOptions r, Object? body) async {
    if (hold != null) await hold!.future;
    if (offline) throw const FakeOffline();
    if (accessDenied) {
      return const FakeResponse(302, '', {'location': 'https://team.cloudflareaccess.com/login'});
    }
    final path = r.uri.path;
    final q = r.uri.queryParameters;
    if (r.method != 'GET') writes.add('${r.method} $path');
    final res = _route(r.method, path, q, body);
    if (r.method != 'GET' && loseNextResponse) {
      loseNextResponse = false;
      throw const FakeLostResponse();
    }
    return res;
  }

  FakeResponse _route(String method, String path, Map<String, String> q, Object? body) {
    Map<String, dynamic> input() => Map<String, dynamic>.from(body as Map);
    if (path == '/api/health') return const FakeResponse(200, {'status': 'ok'});
    if (path == '/api/transactions' && method == 'GET') {
      final rows = transactions.where((t) {
        final d = t['date'] as String;
        return (q['from'] == null || d.compareTo(q['from']!) >= 0) &&
            (q['to'] == null || d.compareTo(q['to']!) <= 0) &&
            (q['type'] == null || t['type'] == q['type']);
      }).toList();
      final offset = int.parse(q['offset'] ?? '0'), limit = int.parse(q['limit'] ?? '100');
      return FakeResponse(200, {
        'data': rows.skip(offset).take(limit).toList(),
        'total': rows.length,
      });
    }
    if (path == '/api/transactions' && method == 'POST') {
      return FakeResponse(201, {'data': _store(input()), 'notices': <String>[]});
    }
    if (path.startsWith('/api/transactions/')) {
      final id = path.split('/').last;
      if (!transactions.any((t) => t['id'] == id)) {
        return const FakeResponse(404, {'error': 'Transaction not found'});
      }
      if (method == 'DELETE') {
        transactions.removeWhere((t) => t['id'] == id);
        return FakeResponse(200, {
          'data': {'id': id},
          'notices': <String>[],
        });
      }
      return FakeResponse(200, {'data': _store(input(), id), 'notices': <String>[]});
    }
    if (path == '/api/goal') return FakeResponse(200, {'data': _goal, 'notices': <String>[]});
    if (path == '/api/milestones') return FakeResponse(200, {'data': milestones});
    if (path == '/api/settings') {
      if (method == 'PUT') settings = {...settings, ...input()};
      return FakeResponse(200, {'data': settings, 'notices': <String>[]});
    }
    if (path == '/api/reconciliations') return const FakeResponse(200, {'data': <Object>[]});
    if (path == '/api/categories') {
      return const FakeResponse(200, {
        'data': [
          {'id': 'income', 'type': 'in', 'name': 'Income', 'sortOrder': 1},
          {'id': 'living', 'type': 'out', 'name': 'Living', 'sortOrder': 7},
        ],
      });
    }
    if (path == '/api/backup/status') {
      return const FakeResponse(200, {
        'data': {
          'state': 'ok',
          'lastSuccessAt': '2026-11-16T03:00:00.000Z',
          'lastAttemptAt': '2026-11-16T03:00:00.000Z',
          'sizeBytes': 20480,
          'file': 'cairn.db.gz',
          'error': null,
          'stale': false,
        },
      });
    }
    return const FakeResponse(404, {'error': 'Not found'});
  }
}

/// A provider container wired to [server], with storage in [dir].
ProviderContainer containerFor(
  FakeCairn server,
  Directory dir, {
  bool connected = true,
  bool splash = false,
}) {
  return ProviderContainer(
    overrides: [
      splashProvider.overrideWithValue(splash),
      ...KitBoot.memory(dir, connection: connected ? testConnection : null).overrides,
      dioProvider.overrideWithValue(fakeDio(server.adapter)),
      networkRegainedProvider.overrideWithValue(const Stream.empty()),
    ],
  );
}
