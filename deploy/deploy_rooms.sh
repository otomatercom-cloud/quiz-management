#!/usr/bin/env bash
# Rooms / XP / avatar release. Run as root on the server. Edit the 5 variables first.
set -euo pipefail

ODOO_BIN="/opt/odoo/odoo-bin"            # path to odoo-bin
ODOO_CONF="/etc/odoo/odoo.conf"          # odoo.conf
DB="YOUR_DB_NAME"                        # database name
APP="/opt/lg19/lg19-custom-addons/quiz-management"   # folder that holds odoo-addons/ and frontend/
ODOO_USER="odoo"                         # linux user that runs odoo
SERVICE="CHANGE_ME"                      # systemd service of THIS Odoo (lg19), NOT elysians. Find: systemctl list-units | grep -i odoo

[ "$SERVICE" != "CHANGE_ME" ] || { echo "Set SERVICE (the lg19 Odoo systemd service) at the top of this script."; exit 1; }
systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "Service $SERVICE not found."; exit 1; }

# 1) Backup first (database). Filestore backup is separate and optional for this release.
sudo -u postgres pg_dump -Fc "$DB" > "/root/${DB}_before_rooms_$(date +%F_%H%M).dump"

# 2) Copy the new files over (zip unpacked to /root/quiz-management)
rsync -a --delete --exclude node_modules --exclude .next --exclude .env /root/quiz-management/frontend/ "$APP/frontend/"
rsync -a /root/quiz-management/odoo-addons/ "$APP/odoo-addons/"

# 3) Odoo module update: the Odoo service must be STOPPED first, started after
systemctl stop "$SERVICE"
sudo -u "$ODOO_USER" "$ODOO_BIN" -c "$ODOO_CONF" -d "$DB" -u otm_quiz_management --stop-after-init
systemctl start "$SERVICE"

# 4) Frontend
cd "$APP/frontend"
npm ci --no-audit --no-fund
npm run build
pm2 restart quiz-frontend --update-env
pm2 logs quiz-frontend --err --lines 5 --nostream
echo "Done. Test: log in as a student, open /student/rooms."
