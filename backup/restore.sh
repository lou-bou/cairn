#!/bin/sh
# Restore a backup over the live database. The app must be stopped (make restore does this).
# The current database is kept next to it as before-restore-<stamp>.db.
set -eu

SRC=${1:?usage: restore.sh <cairn-....db.gz | .db>}
DB=${DB_PATH:-/data/cairn.db}
stamp=$(date +%Y%m%d-%H%M%S)
tmp="$DB.restore-$stamp"

[ -f "$SRC" ] || { echo "restore: $SRC not found" >&2; exit 1; }
case "$SRC" in
  *.gz) gzip -dc "$SRC" > "$tmp" || { rm -f "$tmp"; echo "restore: $SRC is not a valid gzip file" >&2; exit 1; } ;;
  *) cp "$SRC" "$tmp" ;;
esac

check=$(sqlite3 "$tmp" 'PRAGMA integrity_check;' 2>&1 || true)
if [ "$check" != "ok" ]; then
  rm -f "$tmp"
  echo "restore: $SRC is not a valid database: $check" >&2
  exit 1
fi

if [ -f "$DB" ]; then
  # Fold any WAL into the current file so the kept copy is complete on its own.
  sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE);' > /dev/null
  mv "$DB" "$(dirname "$DB")/before-restore-$stamp.db"
fi
rm -f "$DB-wal" "$DB-shm"
mv "$tmp" "$DB"
echo "restore: restored $SRC to $DB (previous kept as before-restore-$stamp.db)"
