#!/usr/bin/env bash
# Runs as little-buddy-deploy.service when deploy/webhook.mjs rewrites the
# trigger file (little-buddy-deploy.path). It always deploys whatever
# origin/main is now, so several pushes in a row fold into one deploy, and a
# push that lands while a deploy runs is picked up by one more pass.
# Installed to /opt/little-buddy/bin by remote_deploy.sh; logs go to
# journalctl -u little-buddy-deploy.
set -euo pipefail

base=/opt/little-buddy
repo="$base/repo"
upload="$base/upload/auto"
url=https://github.com/phatnguyen-curiopal/little-buddy-impl.git
# The webhook runs with DynamicUser, so its state directory is under private/.
trigger=/var/lib/private/little-buddy-webhook/trigger

[ -d "$repo/.git" ] || git clone --quiet "$url" "$repo"
while :; do
  seen="$(cat "$trigger" 2>/dev/null || true)"
  git -C "$repo" fetch --quiet origin main
  git -C "$repo" reset --quiet --hard origin/main
  git -C "$repo" clean -fdxq
  rev="$(git -C "$repo" rev-parse --short HEAD)"
  if [ "$rev" = "$(cat "$base/deployed_rev" 2>/dev/null || true)" ]; then
    echo "auto: $rev is already deployed"
  else
    echo "auto: deploying $rev"
    mkdir -p "$upload"
    git -C "$repo" archive --format=tar.gz -o "$upload/src.tgz" HEAD backend brain deploy
    # The host's node is too old for Vite; a throwaway container builds it.
    docker run --rm -v "$repo/frontend:/app" -v little-buddy-npm-cache:/root/.npm -w /app node:22-alpine \
      sh -c 'npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null'
    tar -czf "$upload/site.tgz" -C "$repo/frontend/dist" .
    UPLOAD="$upload" REV="$rev" bash "$repo/deploy/remote_deploy.sh" </dev/null
  fi
  [ "$(cat "$trigger" 2>/dev/null || true)" != "$seen" ] || break
  echo "auto: another push arrived during the deploy; going again"
done
