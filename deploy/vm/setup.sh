#!/usr/bin/env bash
# One-time set-up of a fresh Ubuntu 24.04 VM for the API (ADR 0020; AWS EC2, but nothing here
# depends on the provider): swap, firewall, Node 24, Caddy (HTTPS), users, the code, the unit.
# Safe to run again. Steps around it: docs/deploy-aws.md.
#
# Usage: sudo bash setup.sh <api-host>     e.g. sudo bash setup.sh 13-48-1-2.sslip.io
set -euo pipefail

API_HOST=${1:?usage: sudo bash setup.sh <api-host>}
REPO=https://github.com/natasha-vardo-dev/weather-app.git
APP_DIR=/opt/weather-app
APP_USER=weather
BUILD_USER=weather-build
ENV_FILE=/etc/weather-api.env

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

echo "== Swap (the 1 GB shape runs out of memory building without it)"
if ! swapon --show | grep -q /swapfile; then
  [[ -f /swapfile ]] || fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab

echo "== Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git iptables-persistent unattended-upgrades needrestart

echo "== Automatic updates, Node and Caddy included"
# unattended-upgrades installs only Ubuntu's own packages by default; Node (NodeSource) and
# Caddy (Cloudsmith) come from their own repositories, and both face the internet.
cat >/etc/apt/apt.conf.d/52weather-app-upgrades <<'EOF'
Unattended-Upgrade::Origins-Pattern {
	"site=deb.nodesource.com";
	"site=dl.cloudsmith.io";
};
EOF
# After an upgrade, restart the services still running the old binaries (the API, Caddy)
# without asking: unattended, nobody would answer.
mkdir -p /etc/needrestart/conf.d
echo "\$nrconf{restart} = 'a';" >/etc/needrestart/conf.d/weather-app.conf

echo "== Logs kept 14 days (the privacy policy says so)"
# Daily files, so whole days expire (12 days: a file goes at the first rotation after its newest
# entry passes it, up to a day later, so nothing is older than 14); no copy to rsyslog's /var/log/syslog, which Ubuntu
# rotates over about five weeks.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=12day\nMaxFileSec=1day\nForwardToSyslog=no\n' \
  >/etc/systemd/journald.conf.d/weather-app.conf
systemctl restart systemd-journald

echo "== Firewall: HTTP and HTTPS"
# Some providers' Ubuntu images (Oracle's) reject all but SSH in iptables; on AWS the security
# group does the filtering and this changes nothing.
for port in 80 443; do
  rule=(INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT)
  iptables -C "${rule[@]}" 2>/dev/null || iptables -I "${rule[@]}"
done
netfilter-persistent save >/dev/null

echo "== Node.js 24"
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -q nodejs
fi
node --version

echo "== Caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi
# HTTPS certificate from Let's Encrypt for the host, renewed by Caddy. No access log, and no
# request errors (a 502 while the API restarts): both would write the request with its
# headers (X-Proxy-Secret, X-Client-IP) and query (coordinates, search words). The API logs
# what it needs without them; certificate logs stay.
cat >/etc/caddy/Caddyfile <<EOF
{
	log default {
		exclude http.log.error http.handlers.reverse_proxy
	}
}

$API_HOST {
	reverse_proxy 127.0.0.1:3001
}
EOF
systemctl reload-or-restart caddy

echo "== Service user and code (the source; builds go to /opt/weather-app-releases)"
id "$APP_USER" >/dev/null 2>&1 ||
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$APP_USER"
# Builds (deploy.sh) run as another user, so they cannot read the server's environment.
id "$BUILD_USER" >/dev/null 2>&1 ||
  useradd --system --create-home --home-dir /var/lib/$BUILD_USER --shell /usr/sbin/nologin "$BUILD_USER"
if [[ ! -d $APP_DIR/.git ]]; then
  git clone --quiet --branch main "$REPO" "$APP_DIR"
fi
# The source stays root's: deploy.sh, run as root, comes from it (deploy.sh, top).

echo "== Settings"
if [[ ! -f $ENV_FILE ]]; then
  install -m 600 -o root -g root "$APP_DIR/deploy/vm/api.env.example" "$ENV_FILE"
fi

echo "== systemd unit"
# Only the first time: after that deploy.sh installs the unit of the build it deploys.
if [[ ! -f /etc/systemd/system/weather-api.service ]]; then
  install -m 644 "$APP_DIR/deploy/vm/weather-api.service" /etc/systemd/system/weather-api.service
fi
systemctl daemon-reload
systemctl enable weather-api >/dev/null

cat <<EOF

Done. Next:
  1. sudo nano $ENV_FILE        (PROXY_SECRET and the rest; see the comments there)
  2. sudo bash $APP_DIR/deploy/vm/deploy.sh
  3. curl https://$API_HOST/api/health
EOF
