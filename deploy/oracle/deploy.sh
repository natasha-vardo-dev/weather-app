#!/usr/bin/env bash
# Deploys the API on the VM (ADR 0019): builds a commit in a directory of its own, then points
# /opt/weather-app-current at it and restarts. The running server is untouched until then, so
# a failed pull or build changes nothing. The last builds are kept: deploying one of them again
# (a rollback) only restarts. A build that does not answer its health check within 30 s is
# replaced by the one before it at once.
#
# The source, this script and the unit stay root's: the build user runs npm (and so every
# dependency's install scripts) only inside the release, so a bad package cannot change what
# root runs next, and every build is root's once built.
#
# Usage: sudo bash /opt/weather-app/deploy/oracle/deploy.sh [commit]   (default: latest main)
set -euo pipefail

APP_DIR=/opt/weather-app
RELEASES=/opt/weather-app-releases
CURRENT=/opt/weather-app-current
# Builds run as a user of their own, not the server's: dependencies' install scripts and dev
# tools then cannot read the running server's environment (its secrets) in /proc.
BUILD_USER=weather-build
KEEP=3

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

# One deploy at a time: two would build in, and switch to, the same places.
exec 9>/run/weather-deploy.lock
if ! flock -n 9; then
  echo "Another deploy is running." >&2
  exit 1
fi

# SIGKILL until none is left: a process started by an install script may ignore SIGTERM.
stop_build_processes() {
  while pgrep -u "$BUILD_USER" >/dev/null; do
    pkill -KILL -u "$BUILD_USER" || true
    sleep 0.2
  done
}

as_build() { sudo -u "$BUILD_USER" -H "$@"; }

commit=
# The argument: a commit id (main's or an earlier one). Only a kept build skips the pull.
if [[ ${1:-} =~ ^[0-9a-f]{7,40}$ ]]; then
  commit=$(git -C "$APP_DIR" rev-parse --verify --quiet "$1^{commit}") || commit=
fi
# A rollback to a kept build needs no pull, so it works with GitHub unreachable.
if [[ -z $commit || ! -f $RELEASES/$commit.built ]]; then
  echo "== Pull"
  git -C "$APP_DIR" pull --quiet --ff-only origin main
  commit=$(git -C "$APP_DIR" rev-parse --verify "${1:-HEAD}^{commit}")
fi
if ! git -C "$APP_DIR" cat-file -e "$commit:deploy/oracle/weather-api.service" 2>/dev/null; then
  echo "${commit:0:7} predates the VM deploy (no deploy/oracle/weather-api.service)." >&2
  exit 1
fi
release=$RELEASES/$commit

# <commit>.built is written by root, beside the release where the build user cannot write, only
# once the build succeeded and is root's: a half-done or interrupted build is never reused.
if [[ -f $release.built ]]; then
  echo "== ${commit:0:7} is already built"
else
  echo "== Build ${commit:0:7} (shared and server only)"
  rm -rf "$release" "$release.built"
  install -d "$RELEASES"
  install -d -o "$BUILD_USER" -g "$BUILD_USER" "$release"
  git -C "$APP_DIR" archive "$commit" | tar -x --no-same-owner -C "$release"
  chown -R "$BUILD_USER:$BUILD_USER" "$release"
  # Chained with &&: on the left of ||, bash ignores set -e inside the subshell.
  (
    cd "$release" &&
      as_build npm ci --no-audit --no-fund -w @weather/shared -w server --include-workspace-root=false &&
      as_build npm run build -w @weather/shared &&
      as_build npm run build -w server
  ) || {
    stop_build_processes
    rm -rf "$release"
    echo "Build failed; the running server is unchanged." >&2
    exit 1
  }
  # Writable by the build user only while it is built: a later build's packages cannot change
  # this one, kept for a rollback, nor can the server change its own code.
  # Nothing the build started keeps running.
  stop_build_processes
  chown -R root:root "$release"
  touch "$release.built"
fi

# Points the server at a build (its unit and commit too) and restarts it. Chained with &&:
# called on the left of || (below), bash ignores set -e inside it.
switch_to() {
  local target=$1 id
  id=$(basename "$target")
  # The unit may change with the code; taken from git, not from the build user's release.
  git -C "$APP_DIR" show "$id:deploy/oracle/weather-api.service" >"$UNIT.new" &&
    chmod 644 "$UNIT.new" &&
    mv "$UNIT.new" "$UNIT" &&
    echo "GIT_COMMIT=$id" >/etc/weather-api.commit &&
    ln -sfn "$target" "$CURRENT.next" &&
    mv -T "$CURRENT.next" "$CURRENT" &&
    systemctl daemon-reload &&
    systemctl restart weather-api
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:3001/api/health; then
      echo
      return 0
    fi
    sleep 1
  done
  return 1
}

UNIT=/etc/systemd/system/weather-api.service
previous=$(readlink "$CURRENT" || true)

echo "== Switch and restart"
# Newest first when pruning below: a build deployed again (a rollback) is kept.
touch "$release"
ok=true
{ switch_to "$release" && healthy; } || ok=false

if ! $ok && [[ -n $previous && $previous != "$release" && -f $previous.built ]]; then
  echo "${commit:0:7} did not answer within 30 s; back to $(basename "$previous" | cut -c1-7)." >&2
  echo "Its log: journalctl -u weather-api -n 50" >&2
  { switch_to "$previous" && healthy; } || echo "The previous build does not answer either." >&2
fi

# Old builds go, except the newest few, the one deployed and the one before it.
for old in $(ls -1dt "$RELEASES"/*/ | tail -n +$((KEEP + 1))); do
  old=${old%/}
  [[ $old == "$release" || $old == "$previous" ]] || rm -rf "$old" "$old.built"
done

if $ok; then
  echo "Deployed ${commit:0:7}."
else
  echo "Deploy of ${commit:0:7} failed. Its log: journalctl -u weather-api -n 50" >&2
  exit 1
fi
