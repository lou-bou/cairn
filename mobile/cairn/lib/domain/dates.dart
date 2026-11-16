/// Calendar dates are plain "YYYY-MM-DD" strings in the device's time zone
/// (a port of shared/src/dates.ts and web/src/lib/dates.ts).
library;

final _isoDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

int daysInMonth(int year, int month) => DateTime.utc(year, month + 1, 0).day;

bool isIsoDate(String value) {
  final m = _isoDate.firstMatch(value);
  if (m == null) return false;
  final y = int.parse(m.group(1)!), mo = int.parse(m.group(2)!), d = int.parse(m.group(3)!);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

String toIsoDate(int year, int month, int day) =>
    '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

String isoOf(DateTime d) => toIsoDate(d.year, d.month, d.day);

String todayIso([DateTime? now]) => isoOf(now ?? DateTime.now());

(int, int, int) _parts(String iso) {
  final m = _isoDate.firstMatch(iso);
  if (m == null) throw FormatException('Invalid date: $iso');
  return (int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
}

/// The date as a UTC midnight DateTime, for pickers and day arithmetic.
DateTime dateOf(String iso) {
  final (y, m, d) = _parts(iso);
  return DateTime.utc(y, m, d);
}

String addDays(String iso, int days) {
  final (y, m, d) = _parts(iso);
  return isoOf(DateTime.utc(y, m, d + days));
}

/// 0 = Sunday … 6 = Saturday.
int weekday(String iso) => dateOf(iso).weekday % 7;

String monthKey(String iso) => iso.substring(0, 7);

String startOfMonth(String iso) => '${iso.substring(0, 7)}-01';

String endOfMonth(String iso) {
  final (y, m, _) = _parts(iso);
  return toIsoDate(y, m, daysInMonth(y, m));
}

String addMonths(String iso, int months) {
  final (y, m, d) = _parts(iso);
  final total = y * 12 + (m - 1) + months;
  final ny = (total / 12).floor();
  final nm = total - ny * 12 + 1;
  final dim = daysInMonth(ny, nm);
  return toIsoDate(ny, nm, d < dim ? d : dim);
}

/// Every "YYYY-MM" from the month of [from] to the month of [to], inclusive.
List<String> monthsBetween(String from, String to) {
  final out = <String>[];
  var cur = startOfMonth(from);
  final last = monthKey(to);
  while (monthKey(cur).compareTo(last) <= 0) {
    out.add(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

/// Days since the Unix epoch, for chart x positions.
int dayNumber(String iso) => dateOf(iso).millisecondsSinceEpoch ~/ 86400000;

String fromDayNumber(int n) =>
    isoOf(DateTime.fromMillisecondsSinceEpoch(n * 86400000, isUtc: true));

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "Today", "Yesterday", "3 Oct" or "3 Oct 2025" for other years.
String formatDay(String iso, {String? today}) {
  final t = today ?? todayIso();
  if (iso == t) return 'Today';
  if (iso == addDays(t, -1)) return 'Yesterday';
  final (y, m, d) = _parts(iso);
  final base = '$d ${_months[m - 1]}';
  return iso.substring(0, 4) == t.substring(0, 4) ? base : '$base $y';
}

/// "Sep", or "Sep 2026" when the year matters.
String formatMonth(String key, {bool withYear = false}) {
  final y = int.parse(key.substring(0, 4)), m = int.parse(key.substring(5, 7));
  return withYear ? '${_months[m - 1]} $y' : _months[m - 1];
}

/// Local date of an ISO timestamp.
String localDateOf(String timestamp) => isoOf(DateTime.parse(timestamp).toLocal());

/// "16 Nov 2026, 14:05" in local time, or "never".
String formatTimestamp(String? timestamp) {
  if (timestamp == null) return 'never';
  final d = DateTime.tryParse(timestamp)?.toLocal();
  if (d == null) return 'never';
  final hh = d.hour.toString().padLeft(2, '0'), mm = d.minute.toString().padLeft(2, '0');
  return '${d.day} ${_months[d.month - 1]} ${d.year}, $hh:$mm';
}
