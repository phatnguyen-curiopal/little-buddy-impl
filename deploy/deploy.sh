#!/usr/bin/env bash
# Deploys this working tree to little-buddy.curiopal.com (see deploy/README.md).
# From the repo root, in Git Bash or any POSIX shell:
#
#   bash deploy/deploy.sh
#
# What is shipped is every file git would track under backend/, brain/ and
# deploy/ (gitignored files such as .env and manifests never leave this
# machine), plus the frontend built here. The SSH login comes from the root
# .env (SSH_HOST, SSH_USER, SSH_PASSWORD) and reaches ssh through
# SSH_ASKPASS, so it never shows up in a command line or in this output.
#
# On the host it touches only Little Buddy's own things: /opt/little-buddy,
# /var/www/little-buddy, the little-buddy compose project and this site's
# nginx file, which is reverted if the whole nginx config does not test clean.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
envf="$root/.env"
[ -f "$envf" ] || { echo "deploy: no .env at the repo root (SSH_HOST, SSH_USER, SSH_PASSWORD)" >&2; exit 1; }
val() { grep -m1 "^$1=" "$envf" | cut -d= -f2- | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

rev="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain -- backend brain deploy frontend)" ]; then
  rev="$rev-dirty"
  echo "deploy: shipping uncommitted changes too ($rev)"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

target="$(val SSH_USER)@$(val SSH_HOST)"
opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=30)
if [ -n "$(val SSH_PASSWORD)" ]; then
  printf '#!/bin/sh\nprintf "%%s\\n" "$LB_SSH_PASSWORD"\n' > "$work/askpass"
  chmod +x "$work/askpass"
  LB_SSH_PASSWORD="$(val SSH_PASSWORD)"
  export LB_SSH_PASSWORD SSH_ASKPASS="$work/askpass" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"
  opts+=(-o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive)
fi

echo "deploy: building the frontend"
npm --prefix frontend run build >/dev/null
tar -czf "$work/site.tgz" -C frontend/dist .
git ls-files -co --exclude-standard -- backend brain deploy | tar -czf "$work/src.tgz" -T -

echo "deploy: uploading $rev"
# Its own upload folder: a push deploying at the same time uses upload/auto.
ssh "${opts[@]}" "$target" 'mkdir -p /opt/little-buddy/upload/manual'
scp "${opts[@]}" -q "$work/src.tgz" "$work/site.tgz" "$target:/opt/little-buddy/upload/manual/"
ssh "${opts[@]}" "$target" "UPLOAD=/opt/little-buddy/upload/manual REV='$rev' bash -s" < deploy/remote_deploy.sh
