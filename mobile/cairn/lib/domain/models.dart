import 'money.dart';

/// The API's data shapes (see shared/src/types.ts on the server side).
enum TxType {
  moneyIn('in'),
  moneyOut('out');

  const TxType(this.code);
  final String code;

  static TxType parse(Object? code) => code == 'out' ? TxType.moneyOut : TxType.moneyIn;
}

class Category {
  const Category({required this.id, required this.type, required this.name, required this.sortOrder});

  final String id;
  final TxType type;
  final String name;
  final int sortOrder;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
    id: j['id'] as String,
    type: TxType.parse(j['type']),
    name: j['name'] as String,
    sortOrder: (j['sortOrder'] as num?)?.toInt() ?? 0,
  );

  Map<String, dynamic> toJson() => {'id': id, 'type': type.code, 'name': name, 'sortOrder': sortOrder};
}

/// The fixed category set, used until the server's list has been fetched once.
const defaultCategories = [
  Category(id: 'income', type: TxType.moneyIn, name: 'Income', sortOrder: 1),
  Category(id: 'funding', type: TxType.moneyIn, name: 'Funding', sortOrder: 2),
  Category(id: 'savings', type: TxType.moneyIn, name: 'Savings', sortOrder: 3),
  Category(id: 'other', type: TxType.moneyIn, name: 'Other', sortOrder: 4),
  Category(id: 'administrative', type: TxType.moneyOut, name: 'Administrative', sortOrder: 5),
  Category(id: 'luxury', type: TxType.moneyOut, name: 'Luxury', sortOrder: 6),
  Category(id: 'living', type: TxType.moneyOut, name: 'Living', sortOrder: 7),
];

/// Where money came from or went out of. Fixed list; ids are stable keys.
const sources = [
  (id: 'cash', name: 'Cash'),
  (id: 'ccp', name: 'CCP'),
  (id: 'bna', name: 'BNA'),
  (id: 'check', name: 'Check'),
  (id: 'other', name: 'Other'),
];

String sourceName(String id) {
  for (final s in sources) {
    if (s.id == id) return s.name;
  }
  return id;
}

/// What the user enters for a transaction; the body of POST/PUT /transactions.
class TxInput {
  const TxInput({
    required this.type,
    required this.date,
    required this.note,
    required this.amountOriginal,
    required this.currency,
    required this.rate,
    required this.categoryId,
    required this.source,
    this.isAdjustment = false,
  });

  final TxType type;
  final String date;
  final String note;
  final int amountOriginal;
  final Currency currency;
  final int rate;
  final String categoryId;
  final String source;
  final bool isAdjustment;

  Map<String, dynamic> toJson() => {
    'type': type.code,
    'date': date,
    'note': note,
    'amountOriginal': amountOriginal,
    'currency': currency.code,
    'rate': rate,
    'categoryId': categoryId,
    'source': source,
    'isAdjustment': isAdjustment,
  };

  factory TxInput.fromJson(Map<String, dynamic> j) => TxInput(
    type: TxType.parse(j['type']),
    date: j['date'] as String,
    note: j['note'] as String? ?? '',
    amountOriginal: (j['amountOriginal'] as num).toInt(),
    currency: Currency.parse(j['currency']),
    rate: (j['rate'] as num).toInt(),
    categoryId: j['categoryId'] as String,
    source: j['source'] as String? ?? 'other',
    isAdjustment: j['isAdjustment'] as bool? ?? false,
  );
}

class Tx {
  const Tx({
    required this.id,
    required this.type,
    required this.date,
    required this.note,
    required this.amountOriginal,
    required this.currency,
    required this.rate,
    required this.amountEur,
    required this.categoryId,
    required this.source,
    required this.isAdjustment,
    required this.createdAt,
    required this.updatedAt,
    this.pending = false,
  });

  final String id;
  final TxType type;
  final String date;
  final String note;
  final int amountOriginal;
  final Currency currency;

  /// DZD per 1 EUR in thousandths, at entry time.
  final int rate;
  final int amountEur;
  final String categoryId;
  final String source;
  final bool isAdjustment;
  final String createdAt;
  final String updatedAt;

  /// True while a change to this entry is still waiting to reach the server.
  final bool pending;

  int get signedEur => type == TxType.moneyIn ? amountEur : -amountEur;

  factory Tx.fromJson(Map<String, dynamic> j) => Tx(
    id: j['id'] as String,
    type: TxType.parse(j['type']),
    date: j['date'] as String,
    note: j['note'] as String? ?? '',
    amountOriginal: (j['amountOriginal'] as num).toInt(),
    currency: Currency.parse(j['currency']),
    rate: (j['rate'] as num).toInt(),
    amountEur: (j['amountEur'] as num).toInt(),
    categoryId: j['categoryId'] as String,
    source: j['source'] as String? ?? 'other',
    isAdjustment: j['isAdjustment'] as bool? ?? false,
    createdAt: j['createdAt'] as String? ?? '',
    updatedAt: j['updatedAt'] as String? ?? '',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.code,
    'date': date,
    'note': note,
    'amountOriginal': amountOriginal,
    'currency': currency.code,
    'rate': rate,
    'amountEur': amountEur,
    'categoryId': categoryId,
    'source': source,
    'isAdjustment': isAdjustment,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };

  TxInput toInput() => TxInput(
    type: type,
    date: date,
    note: note,
    amountOriginal: amountOriginal,
    currency: currency,
    rate: rate,
    categoryId: categoryId,
    source: source,
    isAdjustment: isAdjustment,
  );

  /// This entry as it will look once [input] is saved, computed the way the server does.
  factory Tx.fromInput(
    TxInput input, {
    required String id,
    required String createdAt,
    String? updatedAt,
    bool pending = true,
  }) => Tx(
    id: id,
    type: input.type,
    date: input.date,
    note: input.note.trim(),
    amountOriginal: input.amountOriginal,
    currency: input.currency,
    rate: input.rate,
    amountEur: toEurCents(input.amountOriginal, input.currency, input.rate),
    categoryId: input.categoryId,
    source: input.source,
    isAdjustment: input.isAdjustment,
    createdAt: createdAt,
    updatedAt: updatedAt ?? createdAt,
    pending: pending,
  );

  /// True when the server's copy carries the same user-entered values as [input].
  bool matches(TxInput input) =>
      type == input.type &&
      date == input.date &&
      note == input.note.trim() &&
      amountOriginal == input.amountOriginal &&
      currency == input.currency &&
      rate == input.rate &&
      categoryId == input.categoryId &&
      source == input.source &&
      isAdjustment == input.isAdjustment;
}

class Milestone {
  const Milestone({
    required this.id,
    required this.name,
    required this.note,
    required this.sortOrder,
    required this.costOriginal,
    required this.currency,
    required this.rate,
    required this.costEur,
    required this.thresholdEur,
    required this.achievedAt,
    required this.celebrationSeen,
  });

  final String id;
  final String name;
  final String note;
  final int sortOrder;
  final int costOriginal;
  final Currency currency;
  final int rate;
  final int costEur;

  /// Sum of this milestone's cost and every one before it.
  final int thresholdEur;
  final String? achievedAt;
  final bool celebrationSeen;

  factory Milestone.fromJson(Map<String, dynamic> j) => Milestone(
    id: j['id'] as String,
    name: j['name'] as String,
    note: j['note'] as String? ?? '',
    sortOrder: (j['sortOrder'] as num?)?.toInt() ?? 0,
    costOriginal: (j['costOriginal'] as num).toInt(),
    currency: Currency.parse(j['currency']),
    rate: (j['rate'] as num).toInt(),
    costEur: (j['costEur'] as num).toInt(),
    thresholdEur: (j['thresholdEur'] as num?)?.toInt() ?? 0,
    achievedAt: j['achievedAt'] as String?,
    celebrationSeen: j['celebrationSeen'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'note': note,
    'sortOrder': sortOrder,
    'costOriginal': costOriginal,
    'currency': currency.code,
    'rate': rate,
    'costEur': costEur,
    'thresholdEur': thresholdEur,
    'achievedAt': achievedAt,
    'celebrationSeen': celebrationSeen,
  };

  Milestone withThreshold(int threshold) => Milestone(
    id: id,
    name: name,
    note: note,
    sortOrder: sortOrder,
    costOriginal: costOriginal,
    currency: currency,
    rate: rate,
    costEur: costEur,
    thresholdEur: threshold,
    achievedAt: achievedAt,
    celebrationSeen: celebrationSeen,
  );
}

class Goal {
  const Goal({
    required this.name,
    required this.mode,
    required this.customOriginal,
    required this.currency,
    required this.rate,
    required this.customEur,
    required this.amountEur,
    required this.milestoneSumEur,
    required this.balanceEur,
    required this.achievedAt,
    required this.celebrationSeen,
  });

  final String name;

  /// 'auto' (sum of milestones) or 'custom'.
  final String mode;
  final int? customOriginal;
  final Currency? currency;
  final int? rate;
  final int? customEur;

  /// The effective goal: the milestone sum in auto mode, customEur in custom mode.
  final int amountEur;
  final int milestoneSumEur;
  final int balanceEur;
  final String? achievedAt;
  final bool celebrationSeen;

  factory Goal.fromJson(Map<String, dynamic> j) => Goal(
    name: j['name'] as String? ?? 'Goal',
    mode: j['mode'] as String? ?? 'auto',
    customOriginal: (j['customOriginal'] as num?)?.toInt(),
    currency: j['currency'] == null ? null : Currency.parse(j['currency']),
    rate: (j['rate'] as num?)?.toInt(),
    customEur: (j['customEur'] as num?)?.toInt(),
    amountEur: (j['amountEur'] as num?)?.toInt() ?? 0,
    milestoneSumEur: (j['milestoneSumEur'] as num?)?.toInt() ?? 0,
    balanceEur: (j['balanceEur'] as num?)?.toInt() ?? 0,
    achievedAt: j['achievedAt'] as String?,
    celebrationSeen: j['celebrationSeen'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {
    'name': name,
    'mode': mode,
    'customOriginal': customOriginal,
    'currency': currency?.code,
    'rate': rate,
    'customEur': customEur,
    'amountEur': amountEur,
    'milestoneSumEur': milestoneSumEur,
    'balanceEur': balanceEur,
    'achievedAt': achievedAt,
    'celebrationSeen': celebrationSeen,
  };

  Goal withBalance(int balance) => Goal(
    name: name,
    mode: mode,
    customOriginal: customOriginal,
    currency: currency,
    rate: rate,
    customEur: customEur,
    amountEur: amountEur,
    milestoneSumEur: milestoneSumEur,
    balanceEur: balance,
    achievedAt: achievedAt,
    celebrationSeen: celebrationSeen,
  );
}

class Settings {
  const Settings({
    required this.defaultRate,
    required this.reconcileFrequency,
    required this.reconcileDay,
    required this.lastReconciledAt,
    required this.reconcileSnoozedUntil,
  });

  final int defaultRate;

  /// 'weekly', 'monthly' or 'off'.
  final String reconcileFrequency;

  /// Weekday 0–6 (Sunday = 0) when weekly, day of month 1–31 when monthly.
  final int reconcileDay;
  final String? lastReconciledAt;
  final String? reconcileSnoozedUntil;

  factory Settings.fromJson(Map<String, dynamic> j) => Settings(
    defaultRate: (j['defaultRate'] as num?)?.toInt() ?? fallbackRateMilli,
    reconcileFrequency: j['reconcileFrequency'] as String? ?? 'off',
    reconcileDay: (j['reconcileDay'] as num?)?.toInt() ?? 1,
    lastReconciledAt: j['lastReconciledAt'] as String?,
    reconcileSnoozedUntil: j['reconcileSnoozedUntil'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'defaultRate': defaultRate,
    'reconcileFrequency': reconcileFrequency,
    'reconcileDay': reconcileDay,
    'lastReconciledAt': lastReconciledAt,
    'reconcileSnoozedUntil': reconcileSnoozedUntil,
  };
}

class Reconciliation {
  const Reconciliation({
    required this.id,
    required this.date,
    required this.countedEur,
    required this.differenceEur,
    required this.adjustmentTransactionId,
  });

  final String id;
  final String date;
  final int countedEur;
  final int differenceEur;
  final String? adjustmentTransactionId;

  factory Reconciliation.fromJson(Map<String, dynamic> j) => Reconciliation(
    id: j['id'] as String,
    date: j['date'] as String,
    countedEur: (j['countedEur'] as num).toInt(),
    differenceEur: (j['differenceEur'] as num).toInt(),
    adjustmentTransactionId: j['adjustmentTransactionId'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'date': date,
    'countedEur': countedEur,
    'differenceEur': differenceEur,
    'adjustmentTransactionId': adjustmentTransactionId,
  };
}

class BackupStatus {
  const BackupStatus({
    required this.state,
    required this.lastSuccessAt,
    required this.sizeBytes,
    required this.error,
    required this.stale,
  });

  /// 'ok', 'error' or 'unknown'.
  final String state;
  final String? lastSuccessAt;
  final int? sizeBytes;
  final String? error;

  /// True when the last success is older than 36 hours or there is none.
  final bool stale;

  factory BackupStatus.fromJson(Map<String, dynamic> j) => BackupStatus(
    state: j['state'] as String? ?? 'unknown',
    lastSuccessAt: j['lastSuccessAt'] as String?,
    sizeBytes: (j['sizeBytes'] as num?)?.toInt(),
    error: j['error'] as String?,
    stale: j['stale'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {
    'state': state,
    'lastSuccessAt': lastSuccessAt,
    'sizeBytes': sizeBytes,
    'error': error,
    'stale': stale,
  };
}

typedef ImportCount = ({int fresh, int identical, int conflicts});

class ImportConflict {
  const ImportConflict({
    required this.entity,
    required this.id,
    required this.existing,
    required this.incoming,
  });

  /// 'transactions', 'milestones' or 'reconciliations'.
  final String entity;
  final String id;
  final String existing;
  final String incoming;
}

class ImportPreview {
  const ImportPreview({
    required this.counts,
    required this.conflicts,
    required this.goalDiffers,
    required this.settingsDiffer,
    required this.exportedAt,
  });

  final Map<String, ImportCount> counts;
  final List<ImportConflict> conflicts;
  final bool goalDiffers;
  final bool settingsDiffer;
  final String exportedAt;

  factory ImportPreview.fromJson(Map<String, dynamic> j) {
    final counts = <String, ImportCount>{};
    (j['counts'] as Map? ?? const {}).forEach((k, v) {
      final m = v as Map;
      counts['$k'] = (
        fresh: (m['new'] as num?)?.toInt() ?? 0,
        identical: (m['identical'] as num?)?.toInt() ?? 0,
        conflicts: (m['conflicts'] as num?)?.toInt() ?? 0,
      );
    });
    return ImportPreview(
      counts: counts,
      conflicts: [
        for (final c in (j['conflicts'] as List? ?? const []))
          ImportConflict(
            entity: (c as Map)['entity'] as String,
            id: c['id'] as String,
            existing: c['existing'] as String? ?? '',
            incoming: c['incoming'] as String? ?? '',
          ),
      ],
      goalDiffers: j['goalDiffers'] as bool? ?? false,
      settingsDiffer: j['settingsDiffer'] as bool? ?? false,
      exportedAt: j['exportedAt'] as String? ?? '',
    );
  }
}

/// The result of a write: human-readable notices from the server (e.g. "Goal raised to …").
typedef Notices = List<String>;
