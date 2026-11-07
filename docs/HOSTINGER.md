# Hosting SideBooster on Hostinger

> **Use a Hostinger VPS (KVM), not Web, Shared or Cloud hosting.** As far as we know, those plans offer MySQL only; SideBooster needs **PostgreSQL**, a **permanent disk** for photos and documents, and **Docker**. All three come with a VPS.

Total time is about 30–45 minutes. You need a computer with a terminal (Windows PowerShell has `ssh` built in) and access to the domain `sidebooster.com`.

---

## Step 1: Buy the VPS

1. On hostinger.com, go to **VPS Hosting** and pick a plan:
   - **KVM 2** (2 vCPU, 8 GB RAM) is recommended.
   - **KVM 1** (1 vCPU, 4 GB RAM) is the minimum for a small launch.
2. **Server location:** pick the location closest to Australia from the list Hostinger offers.
3. **Operating system:** choose **Ubuntu 24.04 with Docker** under *Applications*. If it isn't listed, choose plain **Ubuntu 24.04**; step 4 installs Docker.
4. Set a strong **root password**, and add your **SSH key** if you have one.
5. When it's ready, open **hPanel → VPS → Overview** and note the server's **IPv4 address**, e.g. `203.0.113.10`.

## Step 2: Open the firewall

In **hPanel → VPS → Security → Firewall**, create a rule set that **allows TCP 22 (SSH), 80 (HTTP) and 443 (HTTPS)**, then activate it. If you have no firewall rules, everything is already open.

## Step 3: Point the domain at the server

**If `sidebooster.com` is registered at Hostinger:** go to **hPanel → Domains → sidebooster.com → DNS / Nameservers → DNS records**.
**If it's registered elsewhere:** add the same records at that registrar.

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `@` | *your VPS IPv4* | 300 |
| A | `www` | *your VPS IPv4* | 300 |

**Delete any other existing `A`, `AAAA` or `CNAME` records for `@` and `www`**, such as Hostinger's parking page. Otherwise HTTPS certificates will fail.

### Domain registered at GoDaddy

Keep the domain at GoDaddy and only change its DNS records. Don't change the nameservers.

1. Log in at godaddy.com → profile icon → **My Products** → next to `sidebooster.com` choose **DNS** (or **Manage DNS**).
2. **A record `@`:** find the A record named `@` (it usually says *Parked*), click the pencil, set **Value** to your VPS IP, set **TTL** to 600 seconds (or the lowest option), and save. If there are several `@` A records, delete the extra ones.
3. **`www`:** GoDaddy normally has `CNAME www → @`. Leave it as it is; it follows the `@` record. If `www` is missing, add **CNAME** `www` → `@`.
4. **Delete** any **AAAA** records for `@` or `www`.
5. Under **Forwarding** (same page, or Domain Settings), make sure **domain forwarding is OFF**.
6. Leave MX, TXT and CNAME records for email (e.g. `email`, `autodiscover`) as they are.

Check it from your computer. Both should show your VPS IP; it can take a few minutes up to a few hours.

```powershell
nslookup sidebooster.com
nslookup www.sidebooster.com
```

## Step 4: Connect to the server

```powershell
ssh root@YOUR_VPS_IP
```

You can also use **hPanel → VPS → Browser terminal**.

If you chose plain Ubuntu in step 1, install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Check it works:

```bash
docker --version && docker compose version
```

## Step 5: Download the code

**If the GitHub repository is public:**

```bash
cd /opt
git clone https://github.com/Silverbricks/sidebooster.git
cd sidebooster
```

**If the repository is private (recommended):** give the server a read-only *deploy key*:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/sidebooster -N "" && cat ~/.ssh/sidebooster.pub
```

1. Copy the printed key.
2. On GitHub, go to the repo → **Settings → Deploy keys → Add deploy key**, paste it, and leave write access off.
3. Then run:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/sidebooster\n' >> ~/.ssh/config
cd /opt && git clone git@github.com:Silverbricks/sidebooster.git && cd sidebooster
```

## Step 6: Create the settings file

```bash
cp .env.production.example .env.production
ln -s .env.production .env            # lets plain "docker compose" commands read it
openssl rand -hex 24                  # copy into POSTGRES_PASSWORD
openssl rand -hex 32                  # copy into ENCRYPTION_KEY
openssl rand -hex 24                  # copy into CRON_SECRET
nano .env.production
```

Fill in:

| Setting | Value |
|---|---|
| `DOMAIN` | `sidebooster.com` |
| `APP_URL` | `https://sidebooster.com` |
| `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `CRON_SECRET` | the three random values above |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_MOBILE` | your real admin login. Password is 12+ characters; mobile is `+614XXXXXXXX` |
| `ALLOW_TEST_PAYMENTS` | `true` while you test, **delete before real launch** |

Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

**Copy `ENCRYPTION_KEY` and `POSTGRES_PASSWORD` into your password manager now.**

## Step 7: Start SideBooster

```bash
docker compose up -d --build
```

The first build takes 3–8 minutes. Then watch the app start:

```bash
docker compose logs -f app
```

Wait for these lines:

- `All migrations have been successfully applied.`
- `Created 8 default categories…`
- `Created Super Admin ADM-000001 <your email>`
- `Ready in …`

Then press `Ctrl+C` (the app keeps running).

Open **https://sidebooster.com**. The padlock appears once Caddy has fetched the certificate, usually within a minute. Also check:

- **https://sidebooster.com/api/health** shows `{"ok":true,…}`
- **https://www.sidebooster.com** redirects to `https://sidebooster.com`

## Step 8: Secure the admin account

1. Log in at `https://sidebooster.com/login` with your admin email and password, then open `/admin`.
2. On the server, remove the password from the settings file and restart the app:
   ```bash
   nano .env.production          # delete the ADMIN_PASSWORD line's value
   docker compose up -d          # recreates the app with the new settings
   ```
3. In `/admin/settings`, check `site_name` = SideBooster and `support_email` = support@sidebooster.com.
4. Work through the **launch checklist** in [DEPLOY.md](../DEPLOY.md#6-launch-checklist):
   - legal pages;
   - Stripe in test mode;
   - removing `ALLOW_TEST_PAYMENTS`;
   - connecting email and SMS.

> Until an email/SMS provider is connected, registration codes don't reach users; admins can see them at `/admin/messages`. **Don't open the site to the public before this is connected.**

## Step 9: Backups

1. In **hPanel → VPS → Backups & Monitoring**, check that automatic backups are on. Take a **snapshot** before every update.
2. Add a nightly database dump that keeps 14 days:

```bash
mkdir -p /opt/backups
crontab -e
```

Add this line:

```
30 2 * * * cd /opt/sidebooster && docker compose exec -T db pg_dump -U sidebooster sidebooster | gzip > /opt/backups/db-$(date +\%F).sql.gz && find /opt/backups -name 'db-*.sql.gz' -mtime +14 -delete
```

3. Regularly copy `/opt/backups` off the server, e.g. download it, or sync it to cloud storage.

Uploaded photos and documents are in the Docker volume `sidebooster_appdata`. The VPS backups and snapshots include it.

## Updating to a new version

```bash
cd /opt/sidebooster
git pull
docker compose up -d --build
```

Database migrations run automatically on start.

## Useful commands

| What | Command (run in `/opt/sidebooster`) |
|---|---|
| Status of all services | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| HTTPS / certificate logs | `docker compose logs -f caddy` |
| Restart the app | `docker compose restart app` |
| Stop everything | `docker compose down` (data is kept) |
| Database shell | `docker compose exec db psql -U sidebooster sidebooster` |
| Run the cron job now | `curl -H "Authorization: Bearer $(grep ^CRON_SECRET .env.production \| cut -d= -f2)" http://127.0.0.1:3000/api/cron/tick` |

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser says "not secure" or there's a certificate error | DNS isn't pointing at the VPS yet, or an old record still exists (step 3). Check `docker compose logs caddy`, fix DNS, then `docker compose restart caddy` |
| `502 Bad Gateway` | The app is still starting or has crashed. Check `docker compose logs app` |
| App log says `Refusing to start — fix the environment` | A setting in `.env.production` is missing or wrong (the message says which). Fix it, then run `docker compose up -d` |
| `failed to bind host port ... address already in use` (5432) | Another PostgreSQL is already on the server. Set `DB_HOST_PORT=5433` in `.env.production`, then `docker compose up -d` |
| `failed to bind host port ... 0.0.0.0:80` or `:443` | Another web server (nginx/apache) holds the port: `systemctl disable --now nginx apache2`, then `docker compose up -d` |
| Build stops with "killed" or out of memory | Use KVM 2, or add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Forgot the admin password | See [ADMIN.md §6](ADMIN.md) |

## Email for @sidebooster.com

**Hostinger Email** (or Google Workspace or Microsoft 365) can provide `support@sidebooster.com`. Add the MX, SPF, DKIM and DMARC records it gives you in the same DNS zone as step 3; they don't affect the website records. Sending the app's own emails (verification codes, receipts) needs a transactional email service connected in `src/lib/notify.ts`.
