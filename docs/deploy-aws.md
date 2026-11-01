# Deploying the API to AWS EC2

Why EC2: [ADR 0020](adr/0020-api-on-aws-ec2.md). The site stays on Vercel (README, "Deployment"). Commands run on
your computer unless marked "on the VM". `13.48.1.2` below stands for your Elastic IP.

## 1. Account and budget

1. Sign up at [aws.amazon.com/free](https://aws.amazon.com/free/) and choose the **free plan**. A card is asked for.
2. Top right, pick the region: **Europe (Stockholm) eu-north-1** (or Frankfurt). Everything below is created in it.
3. Note the date the free plan ends (Billing home page). The plan does not turn into charges: at that date, or when
   the credits run out, the account is suspended and the API stops. Before it, upgrade to the paid plan (about
   $10–12 a month) or move; put the date in your calendar.
4. **Billing and Cost Management → Budgets → Create budget → Use a template → Zero spend budget**, with your email:
   after an upgrade, it warns of the first charge.

## 2. The instance

**EC2 → Instances → Launch instances:**

- Name: `weather-api`.
- Application and OS image: **Ubuntu Server 24.04 LTS**, architecture **64-bit (Arm)**.
- Instance type: **t4g.micro** (or, with the x86 image, t3.micro).
- Key pair: **Create new key pair**, RSA, `.pem`; the file downloads. Keep it: without it there is no way in.
- Network settings → **Edit**, auto-assign public IP **Enable**, **Create security group** with three rules:
  - SSH, TCP 22, source **My IP**;
  - HTTP, TCP 80, source **Anywhere (0.0.0.0/0)**;
  - HTTPS, TCP 443, source **Anywhere (0.0.0.0/0)**.
- Storage: 8–10 GiB gp3.
- **Launch instance**.

If your own address changes later and SSH stops connecting, edit the SSH rule's source to **My IP** again (EC2 →
Security groups), or use **Connect → EC2 Instance Connect** in the console.

## 3. Elastic IP

Without it the public address changes on every stop and start, and with it the host name below.

**EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**, then **Actions → Associate Elastic IP address** →
instance `weather-api` → **Associate**. Note the address, e.g. `13.48.1.2`. (An Elastic IP that is not attached to a
running instance is charged too: release it if you delete the instance.)

## 4. Host name

The API needs a host name for its HTTPS certificate: the address with dashes and `.sslip.io`. `13-48-1-2.sslip.io`
resolves to `13.48.1.2`, with nothing to register. Check: `nslookup 13-48-1-2.sslip.io`.

## 5. Set up the VM

```bash
chmod 600 ~/Downloads/weather-api.pem
ssh -i ~/Downloads/weather-api.pem ubuntu@13.48.1.2
```

On the VM:

```bash
curl -fsSLO https://raw.githubusercontent.com/natasha-vardo-dev/weather-app/main/deploy/vm/setup.sh
sudo bash setup.sh 13-48-1-2.sslip.io
```

It installs Node 24 and Caddy, adds swap, clones the repository to `/opt/weather-app` and installs the service. Then
fill in the settings (the comments in the file say what each is):

```bash
sudo nano /etc/weather-api.env
```

- `PROXY_SECRET`: the same value as on Vercel.
- `FIREBASE_SERVICE_ACCOUNT` and `ALERTS_NOTIFY_SECRET`: for push.

To copy a value without showing it, on your computer: `openssl rand -base64 48 | tr -d '\n' | pbcopy` for a new
secret, `base64 -i <key>.json | tr -d '\n' | pbcopy` for the Firebase key. Paste into nano with Cmd+V, save with
Ctrl+O, Enter, Ctrl+X. Then build and start:

```bash
sudo bash /opt/weather-app/deploy/vm/deploy.sh
```

It prints the health answer, then `Deployed <commit>.` Check once that the 14-day log retention (the privacy policy
states it) is in force: the output of `systemd-analyze cat-config systemd/journald.conf` includes
`MaxRetentionSec=12day` and `ForwardToSyslog=no`.

## 6. Point everything at the VM

- **Vercel:** `API_ORIGIN` = `https://13-48-1-2.sslip.io`, then Deployments → Redeploy (Production).
- **cron-job.org:** the job's URL = `https://13-48-1-2.sslip.io/api/internal/alerts/notify`.
- **Render:** suspend or delete the old service, so it stops using Firestore and Open-Meteo.
- Check: `https://<site>/api/health` shows `"proxied":true`, a forecast opens on the site, and
  `https://13-48-1-2.sslip.io/api/v1/forecast?lat=52.23&lon=21.01` (straight to the VM) gets 404.

## Updating and rolling back

A deploy is manual for now: after merging to `main`,

```bash
ssh -i ~/Downloads/weather-api.pem ubuntu@13.48.1.2 sudo bash /opt/weather-app/deploy/vm/deploy.sh
```

A failed pull or build stops before anything changes, and a build that does not answer within 30 s is replaced by the
previous one at once (the script then fails, with the log to read). The last three builds are kept in
`/opt/weather-app-releases`: to go back, `ls -t /opt/weather-app-releases` on the VM and
`sudo bash /opt/weather-app/deploy/vm/deploy.sh <commit>`.

## On the VM

| What                     | Command                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| Logs, live               | `journalctl -u weather-api -f`                                              |
| Last errors              | `journalctl -u weather-api -p warning -n 50`                                |
| Status, restart          | `systemctl status weather-api`, `sudo systemctl restart weather-api`        |
| Caddy (certificate) logs | `journalctl -u caddy -n 50`                                                 |
| Settings changed         | `sudo nano /etc/weather-api.env`, then `sudo systemctl restart weather-api` |

Ubuntu installs security updates by itself (unattended-upgrades), Node's and Caddy's included, and restarts the API
or Caddy after upgrading them. Some need a reboot (`/var/run/reboot-required` exists): `sudo reboot` at a quiet time;
the API and Caddy start again on their own.
