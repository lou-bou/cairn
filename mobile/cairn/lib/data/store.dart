import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';

import '../domain/models.dart';
import 'api.dart';

/// Everything the server knows, as of the last successful refresh.
class Snapshot {
  const Snapshot({
    required this.categories,
    required this.transactions,
    required this.goal,
    required this.milestones,
    this.goals = const [],
    required this.settings,
    required this.reconciliations,
    required this.backup,
    required this.fetchedAt,
  });

  final List<Category> categories;
  final List<Tx> transactions;

  /// The active goal and its milestones.
  final Goal goal;
  final List<Milestone> milestones;

  /// Every goal, each with its milestones (the active one included).
  final List<Goal> goals;
  final Settings settings;
  final List<Reconciliation> reconciliations;
  final BackupStatus? backup;
  final String fetchedAt;

  Snapshot copyWith({
    List<Tx>? transactions,
    Goal? goal,
    List<Milestone>? milestones,
    Settings? settings,
    List<Reconciliation>? reconciliations,
  }) => Snapshot(
    categories: categories,
    transactions: transactions ?? this.transactions,
    goal: goal ?? this.goal,
    milestones: milestones ?? this.milestones,
    goals: goals,
    settings: settings ?? this.settings,
    reconciliations: reconciliations ?? this.reconciliations,
    backup: backup,
    fetchedAt: fetchedAt,
  );

  Map<String, dynamic> toJson() => {
    'categories': [for (final c in categories) c.toJson()],
    'transactions': [for (final t in transactions) t.toJson()],
    'goal': goal.toJson(),
    'goals': [for (final g in goals) g.toJson()],
    'milestones': [for (final m in milestones) m.toJson()],
    'settings': settings.toJson(),
    'reconciliations': [for (final r in reconciliations) r.toJson()],
    'backup': backup?.toJson(),
    'fetchedAt': fetchedAt,
  };

  static Snapshot? fromJson(Object? raw) {
    if (raw is! Map) return null;
    try {
      Map<String, dynamic> m(Object? o) => Map<String, dynamic>.from(o as Map);
      return Snapshot(
        categories: [for (final c in raw['categories'] as List) Category.fromJson(m(c))],
        transactions: [for (final t in raw['transactions'] as List) Tx.fromJson(m(t))],
        goal: Goal.fromJson(m(raw['goal'])),
        goals: [for (final g in (raw['goals'] as List? ?? const [])) Goal.fromJson(m(g))],
        milestones: [for (final x in raw['milestones'] as List) Milestone.fromJson(m(x))],
        settings: Settings.fromJson(m(raw['settings'])),
        reconciliations: [
          for (final r in raw['reconciliations'] as List) Reconciliation.fromJson(m(r)),
        ],
        backup: raw['backup'] == null ? null : BackupStatus.fromJson(m(raw['backup'])),
        fetchedAt: raw['fetchedAt'] as String? ?? '',
      );
    } catch (_) {
      // A cache written by an older build that no longer parses is just a cold start.
      return null;
    }
  }
}

class DataState {
  const DataState({this.snapshot, this.refreshing = false, this.error});

  final Snapshot? snapshot;
  final bool refreshing;

  /// Why the last refresh failed; null after a success.
  final ApiException? error;
}

const _kCreate = 'tx.create';
const _kUpdate = 'tx.update';
const _kDelete = 'tx.delete';

final cairnApiProvider = Provider<CairnApi>((ref) => CairnApi(ref.watch(apiClientProvider)));

/// The app's data: the cached server snapshot, refresh, and every write.
///
/// Transactions are written through the outbox, so they work offline and never block the UI.
/// Everything else (goal, milestones, settings, counts, import) needs the server to answer,
/// because it recomputes thresholds and achievements.
class CairnData extends Notifier<DataState> {
  static const _cacheKey = 'snapshot';

  /// Temporary ids of entries created on the phone → the ids the server gave them.
  final Map<String, String> _realIds = {};
  Future<void>? _refresh;

  CairnApi get _api => ref.read(cairnApiProvider);
  Outbox get _outbox => ref.read(outboxProvider.notifier);

  @override
  DataState build() {
    _outbox.configure(executor: _send, onSent: () => unawaited(refresh()));
    return DataState(snapshot: Snapshot.fromJson(ref.read(jsonStoreProvider).read(_cacheKey)));
  }

  void _setSnapshot(Snapshot s) {
    state = DataState(snapshot: s, refreshing: state.refreshing, error: state.error);
    ref.read(jsonStoreProvider).write(_cacheKey, s.toJson());
  }

  void _patch(Snapshot Function(Snapshot s) change) {
    if (!ref.mounted) return;
    final s = state.snapshot;
    if (s != null) _setSnapshot(change(s));
  }

  /// Send pending changes, then pull everything. Concurrent calls share one run.
  Future<void> refresh() => _refresh ??= _doRefresh().whenComplete(() => _refresh = null);

  Future<void> _doRefresh() async {
    if (ref.read(connectionProvider) == null) return;
    state = DataState(snapshot: state.snapshot, refreshing: true, error: state.error);
    await _outbox.flush();
    if (!ref.mounted) return;
    // While a create may have reached the server without us hearing back, the snapshot must not
    // learn about it from a fetch: the duplicate check relies on "not in the snapshot yet".
    final unresolved = ref.read(outboxProvider).any((o) => !o.failed && o.attempts > 0);
    if (unresolved) {
      state = DataState(snapshot: state.snapshot, error: state.error);
      return;
    }
    try {
      final api = _api;
      final results = await Future.wait<Object?>([
        api.transactions(),
        api.goal(),
        api.milestones(),
        api.settings(),
        api.reconciliations(),
        api.categories(),
        api.backupStatus().then<BackupStatus?>((b) => b).catchError((_) => null),
        api.goals(),
      ]);
      if (!ref.mounted) return;
      // A change queued while the fetch was in flight is applied on top by the view, so the
      // fresh snapshot can go straight in.
      final snapshot = Snapshot(
        transactions: results[0] as List<Tx>,
        goal: results[1] as Goal,
        milestones: results[2] as List<Milestone>,
        settings: results[3] as Settings,
        reconciliations: results[4] as List<Reconciliation>,
        categories: results[5] as List<Category>,
        backup: results[6] as BackupStatus?,
        // A server from before goals could be added has just the one.
        goals:
            results[7] as List<Goal>? ??
            [(results[1] as Goal).withMilestones(results[2] as List<Milestone>)],
        fetchedAt: DateTime.now().toIso8601String(),
      );
      state = DataState(snapshot: snapshot);
      ref.read(jsonStoreProvider).write(_cacheKey, snapshot.toJson());
    } on ApiException catch (e) {
      if (ref.mounted) state = DataState(snapshot: state.snapshot, error: e);
    } catch (_) {
      if (!ref.mounted) return;
      state = DataState(
        snapshot: state.snapshot,
        error: const ApiException(
          ApiFailure.badResponse,
          'The server sent data this version of the app does not understand.',
        ),
      );
    }
  }

  // ---- Transactions: queued, optimistic ----

  String _resolve(String id) => _realIds[id] ?? id;

  void addTx(TxInput input) {
    _outbox.add(
      OutboxOp(
        id: OutboxOp.newId(),
        kind: _kCreate,
        payload: {'tempId': 'local-${OutboxOp.newId()}', 'input': input.toJson()},
        createdAt: DateTime.now(),
      ),
    );
    unawaited(_outbox.flush());
  }

  void updateTx(String id, TxInput input) {
    id = _resolve(id);
    final ops = ref.read(outboxProvider);
    // Editing an entry that has not been sent yet just changes what will be sent.
    final create = ops.where((o) => o.kind == _kCreate && o.payload['tempId'] == id).firstOrNull;
    if (create != null && create.attempts == 0) {
      _outbox.replace(
        create.copyWith(payload: {...create.payload, 'input': input.toJson()}, clearError: true),
      );
    } else {
      final update = ops.where((o) => o.kind == _kUpdate && o.payload['id'] == id).firstOrNull;
      if (update != null && update.attempts == 0) {
        _outbox.replace(update.copyWith(payload: {'id': id, 'input': input.toJson()}));
      } else {
        _outbox.add(
          OutboxOp(
            id: OutboxOp.newId(),
            kind: _kUpdate,
            payload: {'id': id, 'input': input.toJson()},
            createdAt: DateTime.now(),
          ),
        );
      }
    }
    unawaited(_outbox.flush());
  }

  void deleteTx(String id) {
    id = _resolve(id);
    final ops = ref.read(outboxProvider);
    final create = ops.where((o) => o.kind == _kCreate && o.payload['tempId'] == id).firstOrNull;
    if (create != null && create.attempts == 0) {
      // Never left the phone: nothing to tell the server.
      _outbox.remove(create.id);
      return;
    }
    for (final o in ops.where((o) => o.kind == _kUpdate && o.payload['id'] == id)) {
      if (o.attempts == 0) _outbox.remove(o.id);
    }
    _outbox.add(
      OutboxOp(
        id: OutboxOp.newId(),
        kind: _kDelete,
        payload: {'id': id},
        createdAt: DateTime.now(),
      ),
    );
    unawaited(_outbox.flush());
  }

  /// Sends one queued change and folds the server's answer into the snapshot.
  Future<void> _send(OutboxOp op) async {
    final api = _api;
    switch (op.kind) {
      case _kCreate:
        final input = TxInput.fromJson(Map<String, dynamic>.from(op.payload['input'] as Map));
        Tx? saved;
        // A retry after a timeout: the first attempt may have been stored. Claim that copy
        // instead of creating a second one.
        if (op.attempts > 0) saved = await _findAlreadySent(input);
        if (saved == null) {
          final res = await api.createTx(input);
          saved = res.data;
          _showNotices(res.notices);
        }
        final tx = saved;
        final tempId = op.payload['tempId'] as String;
        _realIds[tempId] = tx.id;
        // Later edits of this entry were queued under its temporary id.
        for (final o in ref.read(outboxProvider)) {
          if (o.id != op.id && o.payload['id'] == tempId) {
            _outbox.replace(o.copyWith(payload: {...o.payload, 'id': tx.id}));
          }
        }
        _patch((s) => s.copyWith(transactions: [tx, ...s.transactions]));
      case _kUpdate:
        final id = _resolve(op.payload['id'] as String);
        final input = TxInput.fromJson(Map<String, dynamic>.from(op.payload['input'] as Map));
        try {
          final res = await api.updateTx(id, input);
          _showNotices(res.notices);
          _patch(
            (s) => s.copyWith(
              transactions: [for (final t in s.transactions) t.id == id ? res.data : t],
            ),
          );
        } on ApiException catch (e) {
          if (e.status != 404) rethrow;
          Toasts.show('An entry you edited had been deleted elsewhere.');
          _patch((s) => s.copyWith(transactions: [...s.transactions.where((t) => t.id != id)]));
        }
      case _kDelete:
        final id = _resolve(op.payload['id'] as String);
        try {
          _showNotices(await api.deleteTx(id));
        } on ApiException catch (e) {
          if (e.status != 404) rethrow; // already gone is what we wanted
        }
        _patch((s) => s.copyWith(transactions: [...s.transactions.where((t) => t.id != id)]));
    }
  }

  Future<Tx?> _findAlreadySent(TxInput input) async {
    final known = {for (final t in state.snapshot?.transactions ?? const <Tx>[]) t.id};
    final sameDay = await _api.transactions(
      query: {'from': input.date, 'to': input.date, 'type': input.type.code},
    );
    return sameDay.where((t) => !known.contains(t.id) && t.matches(input)).firstOrNull;
  }

  void _showNotices(Notices notices) {
    for (final n in notices) {
      Toasts.show(n, duration: const Duration(seconds: 7));
    }
  }

  // ---- Everything else: needs the server now ----

  Future<Notices> _online(Future<Notices> Function(CairnApi api) call) async {
    final notices = await call(_api);
    await refresh();
    return notices;
  }

  Future<Notices> updateGoal(String id, Map<String, dynamic> body) =>
      _online((a) => a.updateGoal(id, body));

  /// Creates a goal and returns its id.
  Future<String> createGoal(Map<String, dynamic> body) async {
    final res = await _api.createGoal(body);
    await refresh();
    return res.id;
  }

  Future<Notices> deleteGoal(String id) => _online((a) => a.deleteGoal(id));

  Future<Notices> activateGoal(String id) => _online((a) => a.activateGoal(id));

  Future<Notices> archiveGoal(String id, {required bool archived}) =>
      _online((a) => a.archiveGoal(id, archived: archived));

  Future<Notices> createMilestone(String goalId, Map<String, dynamic> body) =>
      _online((a) => a.createMilestone(goalId, body));

  Future<Notices> updateMilestone(String id, Map<String, dynamic> body) =>
      _online((a) => a.updateMilestone(id, body));

  Future<Notices> deleteMilestone(String id) => _online((a) => a.deleteMilestone(id));

  Future<Notices> reorderMilestones(List<String> ids) => _online((a) => a.reorderMilestones(ids));

  Future<Notices> createReconciliation(Map<String, dynamic> body) =>
      _online((a) => a.createReconciliation(body));

  Future<void> saveSettings(Map<String, dynamic> patch) async {
    final saved = await _api.saveSettings(patch);
    _patch((s) => s.copyWith(settings: saved));
  }

  /// Tell the server these achievements were celebrated, so they never replay.
  Future<void> markCelebrated({required List<String> milestoneIds, required bool goal}) async {
    await _api.celebrationsSeen(milestoneIds: milestoneIds, goal: goal);
    await refresh();
  }

  /// Forget everything cached (used when the server connection changes).
  void reset() {
    ref.read(jsonStoreProvider).delete(_cacheKey);
    state = const DataState();
  }
}

final dataProvider = NotifierProvider<CairnData, DataState>(CairnData.new);
