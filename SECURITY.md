# Security policy

Please report vulnerabilities privately to **support@oddomens.com** or through a GitHub security advisory, not in a public issue. Include steps to reproduce and the version (Settings → About). We aim to reply within 3 working days.

## How Docket protects your data

- One owner account. The first visitor needs a one-time setup code printed in the server log.
- Passwords are hashed with Argon2id. Two-factor codes (TOTP) and single-use recovery codes are optional. Repeated wrong passwords, codes or API tokens lock the address out for a while (IPv6 by its /64). When failures pile up from many addresses, attempts take turns, one every few seconds. A valid API token is never refused because its address is locked out.
- Sessions and API tokens are random 256-bit values; only their SHA-256 hashes are stored.
- API tokens are read-only or read-write. Creating one needs your password. They can't reach the account, sessions or other tokens, can't delete a product or empty the trash, and are rate limited (each call in an MCP batch counts). Changing the password or resetting the account revokes them all.
- Docket only answers to IP addresses, `localhost`, Tailscale (`*.ts.net`) names and the names in `DOCKET_HOSTS`, so a web page can't reach it by pointing its own domain at your machine (DNS rebinding).
- Browser writes need a same-origin request with an `X-Client-Id` header (CSRF), and a strict Content Security Policy forbids scripts, frames, pictures and connections from anywhere else. Markdown is sanitised before it's shown, and a picture in an item can't call out to another site.
- The container runs as a non-root user on a read-only file system with no capabilities, and listens on 127.0.0.1 unless you choose otherwise.

## Deployment checklist

- [ ] Docket is only reachable from this machine, your LAN or your VPN. `DOCKET_BIND` is `127.0.0.1` unless you chose otherwise.
- [ ] Remote access goes over HTTPS (Tailscale Serve or a reverse proxy), and the proxy's address is in `DOCKET_TRUSTED_PROXIES`. Without it, everyone behind the proxy shares one sign-in limit.
- [ ] If you open Docket at your own domain, it's in `DOCKET_HOSTS`.
- [ ] Two-factor sign-in is on, and the recovery codes are saved somewhere other than the server.
- [ ] API tokens are read-only where writing isn't needed, have an expiry, and are stored only in the client that uses them.
- [ ] `DOCKET_DATA_DIR` is readable only by the user Docket runs as, and is backed up somewhere else.

## What Docket does not do

Docket does not encrypt its database on disk. Anyone who can read the data folder on the server can read your items. If that matters, keep it on an encrypted disk.
