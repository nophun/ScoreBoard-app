HTTPS setup for ScoreBoard-app

Purpose
- Instructions to obtain DNS‑01 TLS certs using DuckDNS + acme.sh, install them for nginx, enable WSS, test externally on port 58162, and set up renewal.

Prerequisites
- Root / sudo access on the server.
- A DuckDNS host (e.g. big2.duckdns.org) and its token.
- Port mapping from external 58162 → internal 443 on your router.
- `nginx` installed and your Node API listening locally (e.g., on 127.0.0.1:3000).

1) Create DuckDNS host
- Create a DuckDNS subdomain (big2.duckdns.org) and copy its token from https://www.duckdns.org.

2) Install `acme.sh`

```bash
# as regular user (not root) or root if you prefer centralized install
curl https://get.acme.sh | sh
# then restart shell or source the profile it added
. ~/.acme.sh/acme.sh.env
```

3) Export DuckDNS token for acme.sh DNS hook

```bash
# export for current shell (replace TOKEN)
export DuckDNS_Token="YOUR_DUCKDNS_TOKEN"
# optional: persist for root/renewals (create /etc/profile.d/duckdns.sh)
sudo tee /etc/profile.d/duckdns.sh >/dev/null <<'EOF'
export DuckDNS_Token="YOUR_DUCKDNS_TOKEN"
EOF
sudo chmod 644 /etc/profile.d/duckdns.sh
```

4) Issue DNS‑01 certs with acme.sh (DuckDNS hook)
- Request a certificate for the apex (and optional www) using the DuckDNS DNS API hook:

```bash
# example issuing for big2.duckdns.org (use --issue once credentials exported)
~/.acme.sh/acme.sh --issue --dns dns_duckdns -d big2.duckdns.org
# for apex + www:
~/.acme.sh/acme.sh --issue --dns dns_duckdns -d big2.duckdns.org -d www.big2.duckdns.org
```

- If acme.sh requests you to set `_acme-challenge` TXT records manually, use DuckDNS API or the DuckDNS web UI. Confirm with `dig`:

```bash
dig +short TXT _acme-challenge.big2.duckdns.org
```

5) Install certs to a system location
- acme.sh writes certs under `~/.acme.sh/big2.duckdns.org/` (or `_ecc/`). Install them into `/etc/ssl/scoreboard` (choose one path and keep it consistent).

```bash
# create target
sudo mkdir -p /etc/ssl/scoreboard
# use acme.sh helper to install (adjust path names if using _ecc)
~/.acme.sh/acme.sh --install-cert -d big2.duckdns.org \
  --key-file       /etc/ssl/scoreboard/big2.duckdns.org.key \
  --fullchain-file /etc/ssl/scoreboard/big2.duckdns.org.fullchain.cer \
  --reloadcmd     "sudo systemctl reload nginx"
```

- Alternative (quick): create symlinks from expected `/etc/letsencrypt/live/...` to `~/.acme.sh/...` but installing to a dedicated folder is cleaner.

6) Nginx vhost example (serve TLS and proxy to Node; also proxy WebSocket)
- Place this in your nginx sites-available and enable it (adjust root, server_name and proxy_pass as needed):

```nginx
server {
    listen 443 ssl;
    server_name big2.duckdns.org;

    ssl_certificate     /etc/ssl/scoreboard/big2.duckdns.org.fullchain.cer;
    ssl_certificate_key /etc/ssl/scoreboard/big2.duckdns.org.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:3000; # your Node API
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- If nginx has separate HTTP vhost for ACME challenges during issuance, keep it enabled until certs are installed.

7) Test nginx config and start

```bash
sudo nginx -t
sudo systemctl enable --now nginx
# or reload after installing certs
sudo systemctl reload nginx
```

8) Router / firewall and external port mapping
- Open/allow port 58162 on your firewall (ufw/firewalld/iptable rules) and map external 58162 -> internal 443 on the router.

9) Verify externally (from remote machine)

```bash
# from outside your network; test TLS and server name
curl -vk https://big2.duckdns.org:58162/
# or inspect certificate
openssl s_client -connect big2.duckdns.org:58162 -servername big2.duckdns.org
```

10) Update frontend API_BASE and WSS
- If your frontend uses a constant `API_BASE`, update to `https://big2.duckdns.org:58162` and ensure websocket URL uses `wss://big2.duckdns.org:58162/ws`.

11) Renewal and token persistence
- acme.sh installs a cron job by default; confirm it:

```bash
~/.acme.sh/acme.sh --installed --list
# or check crontab for acme.sh entries
crontab -l | grep acme.sh || sudo systemctl list-timers | grep acme
```

- Ensure `DuckDNS_Token` is available to the process that runs renewals (persist in `/etc/profile.d/duckdns.sh` or use root's env).

12) Troubleshooting notes
- If `nginx -t` fails because it expects `/etc/letsencrypt/...`, either update nginx to point at `/etc/ssl/scoreboard/...` or symlink the acme.sh files into `/etc/letsencrypt/live/<domain>/`.
- If DNS TXT challenges fail: confirm `_acme-challenge.big2.duckdns.org` returns the expected token via public DNS (`dig +short TXT ...`).
- For WebSocket issues behind nginx, ensure `proxy_set_header Upgrade` and `Connection` are set.

Files created
- https_readme.md — this file (in repository root).

Next steps
- Install certs as root to `/etc/ssl/scoreboard` using the `--install-cert` command above, then run `sudo nginx -t` and `sudo systemctl reload nginx`.
- Configure your router to forward external port 58162 → internal 443 and verify from a remote network.

