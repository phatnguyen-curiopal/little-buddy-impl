#!/usr/bin/env bash
# The server half of a deploy, shared by deploy/deploy.sh (piped over ssh
# from a dev machine) and deploy/auto_deploy.sh (a GitHub push). It takes
# $UPLOAD/src.tgz (backend/, brain/, deploy/) and $UPLOAD/site.tgz (the
# built frontend), and REV, the revision they came from.
set -euo pipefail
UPLOAD="${UPLOAD:-/opt/little-buddy/upload}"
REV="${REV:?REV is required}"
cd /opt/little-buddy

# One deploy at a time: a push can land while a manual deploy runs, and both
# swap the same directories.
exec 9>/opt/little-buddy/deploy.lock
flock -w 900 9 || { echo "remote: another deploy held the lock for 15 min" >&2; exit 1; }

# Swap the sources; the previous ones stay in src.old for a quick rollback.
# -m: the dev machine's clock may run ahead, and tar would warn per file.
rm -rf src.new && mkdir src.new && tar -m -xzf "$UPLOAD/src.tgz" -C src.new
rm -rf src.old && { [ ! -d src ] || mv src src.old; } && mv src.new src

compose="docker compose -f src/deploy/compose.yml"
echo "remote: building images"
$compose build --quiet
$compose up -d redis
echo "remote: migrating"
# deploy.sh feeds this script on stdin, so a run that reads stdin would
# swallow the rest of it.
$compose run -T --rm --no-deps backend node scripts/migrate.js </dev/null
$compose run -T --rm --no-deps brain node scripts/migrate.js </dev/null
$compose up -d --remove-orphans

echo "remote: publishing the site"
www=/var/www/little-buddy
rm -rf "$www/site.new" && mkdir -p "$www/site.new" && tar -m -xzf "$UPLOAD/site.tgz" -C "$www/site.new"
chmod -R a+rX "$www/site.new"
rm -rf "$www/site.old" && { [ ! -d "$www/site" ] || mv "$www/site" "$www/site.old"; } && mv "$www/site.new" "$www/site"

# Only this site's file, and never left in place if the config breaks.
site=little-buddy.curiopal.com
if ! cmp -s "src/deploy/nginx/$site" "/etc/nginx/sites-available/$site"; then
  echo "remote: updating the nginx site"
  backup=""
  [ -f "/etc/nginx/sites-available/$site" ] && backup="$(mktemp)" && cp "/etc/nginx/sites-available/$site" "$backup"
  cp "src/deploy/nginx/$site" "/etc/nginx/sites-available/$site"
  ln -sfn "../sites-available/$site" "/etc/nginx/sites-enabled/$site"
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
  else
    if [ -n "$backup" ]; then cp "$backup" "/etc/nginx/sites-available/$site"; else rm -f "/etc/nginx/sites-enabled/$site" "/etc/nginx/sites-available/$site"; fi
    echo "remote: nginx -t failed; the previous site file is back and nginx was not reloaded" >&2
    nginx -t || true
    exit 1
  fi
fi

# The webhook's files live outside src so a deploy can replace src while
# auto_deploy.sh is running. mv swaps the inode, so a running bash keeps
# reading the old copy of its own script.
put() {
  if cmp -s "$1" "$2"; then return 1; fi
  cp "$1" "$2.new" && chmod "$3" "$2.new" && mv "$2.new" "$2"
}
mkdir -p bin
hook_changed=0
units_changed=0
if put src/deploy/webhook.mjs bin/webhook.mjs 644; then hook_changed=1; fi
put src/deploy/auto_deploy.sh bin/auto_deploy.sh 755 || true
for unit in little-buddy-webhook.service little-buddy-deploy.service little-buddy-deploy.path; do
  if put "src/deploy/systemd/$unit" "/etc/systemd/system/$unit" 644; then units_changed=1; fi
done
[ "$units_changed" = 0 ] || systemctl daemon-reload
if [ -f env/webhook.env ]; then
  systemctl enable --quiet little-buddy-deploy.path little-buddy-webhook.service
  systemctl start little-buddy-deploy.path
  if [ "$hook_changed$units_changed" != 00 ] || ! systemctl is-active --quiet little-buddy-webhook; then
    echo "remote: (re)starting the webhook"
    systemctl restart little-buddy-webhook
  fi
else
  echo "remote: no env/webhook.env, so pushes do not deploy (see deploy/README.md)"
fi

for i in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:3600/healthz && curl -fs -o /dev/null http://127.0.0.1:8600/healthz; then
    echo "$REV" > deployed_rev
    echo "remote: healthy, deployed $REV"
    exit 0
  fi
  sleep 2
done
echo "remote: not healthy after 60 s; see: $compose logs --tail 50" >&2
exit 1
