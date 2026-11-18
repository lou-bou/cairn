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

  /// The first goal's milestones (the active goal unless a test switches).
  List<Map<String, dynamic>> get milestones => goalMilestones['g1']!;
  set milestones(List<Map<String, dynamic>> v) => goalMilestones['g1'] = v;

  /// Every goal, by id, with its own fields; 'g1' is the starting one.
  final List<Map<String, dynamic>> goals = [
    {'id': 'g1', 'name': 'Move abroad', 'mode': 'custom', 'archivedAt': null},
  ];
  final Map<String, List<Map<String, dynamic>>> goalMilestones = {'g1': []};
  String activeId = 'g1';

  /// Answer like a server from before goals could be added: no /api/goals routes.
  bool oldServer = false;
  final Map<String, int> _customEur = {};
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

  Map<String, dynamic> _goalJson(Map<String, dynamic> g) {
    final ms = goalMilestones[g['id']] ?? [];
    final sum = ms.fold<int>(0, (s, m) => s + (m['costEur'] as int));
    final custom = g['id'] == 'g1' ? goalAmount : _customEur[g['id']];
    final amount = g['mode'] == 'auto' ? sum : (custom ?? 0);
    var running = 0;
    return {
      ...g,
      'customOriginal': g['mode'] == 'custom' ? custom : null,
      'currency': g['mode'] == 'custom' ? 'EUR' : null,
      'rate': g['mode'] == 'custom' ? 275000 : null,
      'customEur': g['mode'] == 'custom' ? custom : null,
      'amountEur': amount,
      'milestoneSumEur': sum,
      'balanceEur': balance,
      'achievedAt': null,
      'celebrationSeen': true,
      'active': g['id'] == activeId,
      'sortOrder': goals.indexOf(g) + 1,
      'milestones': [
        for (final m in ms)
          {...m, 'goalId': g['id'], 'thresholdEur': running += m['costEur'] as int},
      ],
    };
  }

  Map<String, dynamic> get _goal => _goalJson(goals.firstWhere((g) => g['id'] == activeId));

  Map<String, dynamic> _addMilestone(String goalId, Map<String, dynamic> input) {
    final m = {
      'id': 'ms-${_nextId++}',
      'name': input['name'],
      'note': input['note'] ?? '',
      'sortOrder': (goalMilestones[goalId]?.length ?? 0) + 1,
      'costOriginal': input['costOriginal'],
      'currency': input['currency'],
      'rate': input['rate'] ?? 275000,
      'costEur': toEurCents(
        input['costOriginal'] as int,
        Currency.parse(input['currency']),
        (input['rate'] as int?) ?? 275000,
      ),
      'achievedAt': null,
      'celebrationSeen': true,
    };
    (goalMilestones[goalId] ??= []).add(m);
    return m;
  }

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
    if (path == '/api/milestones') {
      return FakeResponse(200, {'data': _goal['milestones']});
    }
    if (oldServer && path.startsWith('/api/goals')) {
      return const FakeResponse(404, {'error': 'Not found'});
    }
    if (path == '/api/goals' && method == 'GET') {
      return FakeResponse(200, {
        'data': [for (final g in goals) _goalJson(g)],
      });
    }
    if (path == '/api/goals' && method == 'POST') {
      final b = input();
      final g = {
        'id': 'g${goals.length + 1}',
        'name': b['name'],
        'mode': b['mode'],
        'archivedAt': null,
      };
      if (b['mode'] == 'custom') _customEur[g['id'] as String] = b['customOriginal'] as int;
      goals.add(g);
      goalMilestones[g['id'] as String] = [];
      return FakeResponse(201, {'data': _goalJson(g), 'notices': <String>[]});
    }
    final goalRoute = RegExp(r'^/api/goals/([^/]+)(?:/(\w+))?$').firstMatch(path);
    if (goalRoute != null) {
      final id = goalRoute.group(1)!;
      final g = goals.where((x) => x['id'] == id).firstOrNull;
      if (g == null) return const FakeResponse(404, {'error': 'Goal not found'});
      switch (goalRoute.group(2)) {
        case 'activate':
          activeId = id;
          g['archivedAt'] = null;
        case 'milestones':
          return FakeResponse(201, {'data': _addMilestone(id, input()), 'notices': <String>[]});
        case 'archive':
          g['archivedAt'] = input()['archived'] == true ? '2026-11-18T10:00:00Z' : null;
        case null when method == 'PUT':
          g['name'] = input()['name'];
          g['mode'] = input()['mode'];
        case null when method == 'DELETE':
          if (id == activeId) {
            return const FakeResponse(400, {
              'error': 'Switch to another goal before deleting this one',
            });
          }
          goals.remove(g);
          goalMilestones.remove(id);
      }
      return FakeResponse(200, {'data': _goalJson(g), 'notices': <String>[]});
    }
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
