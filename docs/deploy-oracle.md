# Deploying the API to an Oracle Cloud free VM

Why a VM and not Render: [ADR 0019](adr/0019-api-on-oracle-free-vm.md). The site stays on Vercel (README,
"Deployment"). Commands below run on your computer unless marked "on the VM".

## 1. Account and VM

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). A card is asked for to verify the
   account; Always Free resources are not charged. The home region chosen at sign-up is permanent: pick one in
   Europe (Frankfurt, Amsterdam, Stockholm, Milan, Madrid, Paris, Marseille).
2. Upgrade the account to **Pay As You Go** (Billing → Upgrade and Manage Payment): Always Free resources stay free,
   and idle instances are no longer reclaimed. Then **Budgets → Create Budget** with an alert at 1 (in your
   currency), so a paid resource created by mistake is noticed.
3. **Compute → Instances → Create instance:**
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **Ampere → VM.Standard.A1.Flex**, 1 OCPU and 6 GB (Always Free). If it says "Out of capacity", try again
     later or take **AMD → VM.Standard.E2.1.Micro** (1 GB; setup adds swap for it).
   - Networking: a new virtual cloud network with a public subnet, **Assign a public IPv4 address**.
   - SSH keys: **Generate a key pair for me** and download the private key (or paste your own public key).
4. When it is running, note the **Public IP address**, for example `158.101.1.2`.

## 2. Open ports 80 and 443

**Networking → Virtual cloud networks →** your network **→ Security → Security lists → Default security list → Add
Ingress Rules:** source CIDR `0.0.0.0/0`, IP protocol TCP, destination port range `80,443`. (setup.sh opens the same
ports in the VM's own firewall.)

## 3. Host name

The API needs a host name for its HTTPS certificate. Use the IP address with dashes and `.sslip.io`:
`158-101-1-2.sslip.io` resolves to `158.101.1.2`, with nothing to register. Check:

```bash
nslookup 158-101-1-2.sslip.io
```

## 4. Set up the VM

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@158.101.1.2
```

On the VM:

```bash
curl -fsSLO https://raw.githubusercontent.com/natasha-vardo-dev/weather-app/main/deploy/oracle/setup.sh
sudo bash setup.sh 158-101-1-2.sslip.io
```

It installs Node 24 and Caddy, opens the firewall, clones the repository to `/opt/weather-app` and installs the
service. Then fill in the settings (comments in the file say what each is):

```bash
sudo nano /etc/weather-api.env
```

- `PROXY_SECRET`: the same value as on Vercel.
- `FIREBASE_SERVICE_ACCOUNT` and `ALERTS_NOTIFY_SECRET`: as on Render before, for push.

To copy a value without showing it, on your computer: `openssl rand -base64 48 | tr -d '\n' | pbcopy` for a new
secret, `base64 -i <key>.json | tr -d '\n' | pbcopy` for the Firebase key. Paste into nano with Cmd+V, save with
Ctrl+O, Enter, Ctrl+X. Then build and start:

```bash
sudo bash /opt/weather-app/deploy/oracle/deploy.sh
```

It prints the health answer, then `Deployed <commit>.` Check once that the 14-day log retention (the privacy
policy states it) is in force: the output of `systemd-analyze cat-config systemd/journald.conf` includes
`MaxRetentionSec=12day` and `ForwardToSyslog=no`.

## 5. Point everything at the VM

- **Vercel:** `API_ORIGIN` = `https://158-101-1-2.sslip.io`, then Deployments → Redeploy (Production).
- **cron-job.org:** the job's URL = `https://158-101-1-2.sslip.io/api/internal/alerts/notify`.
- **Render:** suspend or delete the old service, so it stops using Firestore and Open-Meteo.
- Check: `https://<site>/api/health` shows `"proxied":true`, a forecast opens on the site, and
  `https://158-101-1-2.sslip.io/api/v1/forecast?lat=52.23&lon=21.01` (straight to the VM) gets 404.

## Updating and rolling back

A deploy is manual for now: after merging to `main`,

```bash
ssh -i ~/Downloads/ssh-key-*.key ubuntu@158.101.1.2 sudo bash /opt/weather-app/deploy/oracle/deploy.sh
```

A failed pull or build stops before anything changes, and a build that does not answer within 30 s is replaced by the
previous one at once (the script then fails, with the log to read). The last three builds are kept in `/opt/weather-app-releases`:
to go back, `ls -t /opt/weather-app-releases` on the VM and `sudo bash /opt/weather-app/deploy/oracle/deploy.sh <commit>`.

## On the VM

| What                     | Command                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| Logs, live               | `journalctl -u weather-api -f`                                              |
| Last errors              | `journalctl -u weather-api -p warning -n 50`                                |
| Status, restart          | `systemctl status weather-api`, `sudo systemctl restart weather-api`        |
| Caddy (certificate) logs | `journalctl -u caddy -n 50`                                                 |
| Settings changed         | `sudo nano /etc/weather-api.env`, then `sudo systemctl restart weather-api` |

Ubuntu installs security updates by itself (unattended-upgrades), Node's and Caddy's included, and restarts the API
or Caddy after upgrading them. Some need a reboot (`/var/run/reboot-required`
exists): `sudo reboot` at a quiet time; the API and Caddy start again on their own.
