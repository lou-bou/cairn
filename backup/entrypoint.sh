#!/bin/sh
# Schedule backup.sh with supercronic. With arguments, run them instead (restore, test, one-off).
set -eu
if [ "$#" -gt 0 ]; then exec "$@"; fi
echo "${BACKUP_CRON:-0 3 * * *} /usr/local/bin/backup.sh" > /tmp/crontab
echo "cairn-backup: schedule '${BACKUP_CRON:-0 3 * * *}' (TZ=${TZ:-UTC})"
exec supercronic /tmp/crontab
