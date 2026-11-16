import 'package:kit/kit.dart';

import '../domain/models.dart';

typedef Saved<T> = ({T data, Notices notices});

Map<String, dynamic> _map(Object? o) => Map<String, dynamic>.from(o as Map);

Notices _notices(Object? res) =>
    [for (final n in ((res as Map?)?['notices'] as List? ?? const [])) '$n'];

/// Typed calls to the Cairn API (server/src/routes).
class CairnApi {
  CairnApi(this._c);
  final ApiClient _c;

  static const healthPath = '/api/health';
  static bool isHealthy(dynamic json) => json is Map && json['status'] == 'ok';

  Future<List<Category>> categories() async => [
    for (final c in (await _c.get('/api/categories') as Map)['data'] as List)
      Category.fromJson(_map(c)),
  ];

  /// Every transaction matching [query], following the server's paging to the end.
  Future<List<Tx>> transactions({Map<String, Object?> query = const {}}) async {
    const page = 1000;
    final out = <Tx>[];
    while (true) {
      final res =
          await _c.get('/api/transactions', query: {...query, 'limit': page, 'offset': out.length})
              as Map;
      final items = res['data'] as List;
      out.addAll(items.map((t) => Tx.fromJson(_map(t))));
      final total = (res['total'] as num?)?.toInt() ?? out.length;
      if (items.isEmpty || out.length >= total) return out;
    }
  }

  Future<Goal> goal() async => Goal.fromJson(_map((await _c.get('/api/goal') as Map)['data']));

  Future<List<Milestone>> milestones() async => [
    for (final m in (await _c.get('/api/milestones') as Map)['data'] as List)
      Milestone.fromJson(_map(m)),
  ];

  Future<Settings> settings() async =>
      Settings.fromJson(_map((await _c.get('/api/settings') as Map)['data']));

  Future<List<Reconciliation>> reconciliations() async => [
    for (final r in (await _c.get('/api/reconciliations') as Map)['data'] as List)
      Reconciliation.fromJson(_map(r)),
  ];

  Future<BackupStatus> backupStatus() async =>
      BackupStatus.fromJson(_map((await _c.get('/api/backup/status') as Map)['data']));

  Future<Saved<Tx>> createTx(TxInput input) async {
    final res = await _c.post('/api/transactions', body: input.toJson());
    return (data: Tx.fromJson(_map((res as Map)['data'])), notices: _notices(res));
  }

  Future<Saved<Tx>> updateTx(String id, TxInput input) async {
    final res = await _c.put('/api/transactions/$id', body: input.toJson());
    return (data: Tx.fromJson(_map((res as Map)['data'])), notices: _notices(res));
  }

  Future<Notices> deleteTx(String id) async => _notices(await _c.delete('/api/transactions/$id'));

  Future<Notices> saveGoal(Map<String, dynamic> body) async =>
      _notices(await _c.put('/api/goal', body: body));

  Future<Notices> createMilestone(Map<String, dynamic> body) async =>
      _notices(await _c.post('/api/milestones', body: body));

  Future<Notices> updateMilestone(String id, Map<String, dynamic> body) async =>
      _notices(await _c.put('/api/milestones/$id', body: body));

  Future<Notices> deleteMilestone(String id) async =>
      _notices(await _c.delete('/api/milestones/$id'));

  Future<Notices> reorderMilestones(List<String> ids) async =>
      _notices(await _c.post('/api/milestones/reorder', body: {'ids': ids}));

  Future<void> celebrationsSeen({required List<String> milestoneIds, required bool goal}) =>
      _c.post('/api/celebrations/seen', body: {'milestoneIds': milestoneIds, 'goal': goal});

  Future<Settings> saveSettings(Map<String, dynamic> patch) async =>
      Settings.fromJson(_map((await _c.put('/api/settings', body: patch) as Map)['data']));

  Future<Notices> createReconciliation(Map<String, dynamic> body) async =>
      _notices(await _c.post('/api/reconciliations', body: body));

  /// The full JSON export, as text ready to save to a file.
  Future<String> exportJson() => _c.getText('/api/export');

  Future<String> exportCsv() => _c.getText('/api/export', query: {'format': 'csv'});

  Future<ImportPreview> importPreview(Object? file) async {
    final res = await _c.post('/api/import', body: {'file': file}, query: {'dryRun': '1'});
    return ImportPreview.fromJson(_map((res as Map)['data']));
  }

  Future<Saved<Map<String, dynamic>>> importRun(Object? file, Map<String, dynamic> resolution) async {
    final res = await _c.post('/api/import', body: {'file': file, 'resolution': resolution});
    return (data: _map((res as Map)['data']), notices: _notices(res));
  }
}
