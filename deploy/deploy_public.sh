#!/usr/bin/env bash
# Public Phase 1 release (guest quizzes, email OTP, Turnstile). Run as root on the server. Defaults are set for the lg19 server; check the variables first.
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
sudo -u postgres pg_dump -Fc "$DB" > "/root/${DB}_before_public_$(date +%F_%H%M).dump"

# 2) Copy the new files over (zip unpacked to /root/quiz-management)
rsync -a --delete --exclude node_modules --exclude .next --exclude .env /root/quiz-management/frontend/ "$APP/frontend/"
rsync -a /root/quiz-management/odoo-addons/ "$APP/odoo-addons/"

# 3) Odoo module update: the Odoo service must be STOPPED first, started after
systemctl stop "$SERVICE"
sudo -u "$ODOO_USER" "$PY" "$ODOO_BIN" -c "$ODOO_CONF" -d "$DB" -u otm_quiz_management --stop-after-init
systemctl start "$SERVICE"

# 3b) Turnstile keys go in frontend/.env (create free site at dash.cloudflare.com > Turnstile). Skipped if unset:
#     NEXT_PUBLIC_TURNSTILE_SITE_KEY=...   (baked at build, so the build below must run)
#     TURNSTILE_SECRET_KEY=...             (server only)
grep -q '^TURNSTILE_SECRET_KEY=' "$APP/frontend/.env" || echo "WARN: no TURNSTILE_SECRET_KEY in .env, CAPTCHA is OFF"

# 4) Frontend
cd "$APP/frontend"
npm ci --no-audit --no-fund
npm run build
pm2 restart otm-quiz-frontend --update-env
pm2 logs otm-quiz-frontend --err --lines 5 --nostream
echo "Done. Test: open an open quiz in a private window (guest card), then Settings > Technical > Parameters: otm_quiz.require_email_otp."
