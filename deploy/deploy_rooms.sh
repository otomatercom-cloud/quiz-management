#!/usr/bin/env bash
# Rooms / XP / avatar release. Run as root on the server. Defaults are set for the lg19 server; check the variables first.
set -euo pipefail

ODOO_BIN="/opt/lg19/odoo/odoo-bin"         # path to odoo-bin
PY="/opt/lg19/lg19-venv/bin/python3"     # python of the lg19 venv
ODOO_CONF="/etc/lg19.conf"                # odoo.conf
DB="${DB:-}"                          # database name: run as  DB=yourdb ./deploy_x.sh  (or leave empty to read db_name from the conf)
APP="/opt/lg19/lg19-custom-addons/quiz-management"   # folder that holds odoo-addons/ and frontend/
ODOO_USER="lg19"                         # linux user that runs odoo
SERVICE="lg19"                           # systemd service of THIS Odoo (not elysians, crm or clt_logic)

[ -n "$DB" ] || DB=$(awk -F= '/^db_name/{gsub(/ /,"",$2); print $2}' "$ODOO_CONF")
{ [ -n "$DB" ] && [ "$DB" != "False" ]; } || { echo "Set DB at the top (db_name is not in $ODOO_CONF)."; exit 1; }
echo "Service: $SERVICE | DB: $DB"
systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "Service $SERVICE not found."; exit 1; }

# 1) Backup first (database). Filestore backup is separate and optional for this release.
sudo -u postgres pg_dump -Fc "$DB" > "/root/${DB}_before_rooms_$(date +%F_%H%M).dump"

# 2) Copy the new files over (zip unpacked to /root/quiz-management)
if [ -d "$APP/.git" ]; then
  # APP is itself the git checkout: update it with git, never overwrite it from another copy
  git -C "$APP" fetch origin
  git -C "$APP" status --short | head -20
  git -C "$APP" diff --quiet && git -C "$APP" diff --cached --quiet || { echo "Local changes in $APP. Run: git -C $APP stash   then run this script again."; exit 1; }
  git -C "$APP" pull --ff-only
else
  rsync -a --delete --exclude node_modules --exclude .next --exclude .env /root/quiz-management/frontend/ "$APP/frontend/"
  rsync -a /root/quiz-management/odoo-addons/ "$APP/odoo-addons/"
fi

# 3) Odoo module update: the Odoo service must be STOPPED first, started after
systemctl stop "$SERVICE"
sudo -u "$ODOO_USER" "$PY" "$ODOO_BIN" -c "$ODOO_CONF" -d "$DB" -u otm_quiz_management --stop-after-init
systemctl start "$SERVICE"

# 4) Frontend
cd "$APP/frontend"
npm ci --no-audit --no-fund
npm run build
pm2 restart otm-quiz-frontend --update-env
pm2 logs otm-quiz-frontend --err --lines 5 --nostream
echo "Done. Test: log in as a student, open /student/rooms."
