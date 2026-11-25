# Docket

A self-hosted tracker for the work on all your products: apps, sites, servers, tools, games. One person, many products, one place for every feature, bug and chore, with a board, a calendar and an API that AI assistants can use over MCP.

Docket is one of three self-hosted apps from Odd Omens that are made to work together: [Quire](https://github.com/OddOmens/Quire) for notes and documents, [Coffer](https://github.com/OddOmens/Coffer) for files, and **Docket** for tracking work.

- **Products.** Each product has a short key (`PLN`), a status (planning, active, beta, maintenance, paused, deprecated, archived), a section in the sidebar (add your own headings and drag products between them; click a heading for an overview, board and list of everything in it, handy for a product family like a server and its apps), an icon and colour, its current version and links (repo, site, docs). Archived products leave the everyday views but keep their history.
- **Items.** Features, bugs, tasks, improvements, chores and ideas, numbered per product (`PLN-12`). Each has a status (backlog → to do → in progress → in review → done, or cancelled), a severity (low, medium, high, critical), labels, start and due dates, a milestone, a Markdown body with checklists, comments and a full change history that says who changed what (you, or the name of the API token, such as "Claude").
- **Inbox.** Capture now, decide where it belongs later: items without a product (`IN-3`) wait in the inbox.
- **Views.** A home overview (what's urgent, due soon, in progress, recent changes), a board across every product or one, a filterable list, a calendar of due dates and milestones, and milestones with progress per product.
- **API and MCP.** Everything the web app does with products and items is a REST API, and `/mcp` speaks the Model Context Protocol, so Claude (or any MCP client) can read and update your tracker with a token you create and can revoke.
- **Safe by default.** Password with Argon2id, optional two-factor codes, one-time setup code, sign-in limits, read-only or read-write API tokens, a trash for deleted items, and a daily snapshot of the database.

**You need** Docker with Compose on any Linux machine (x86-64 or ARM64). Docket is for one person: a single account, with API tokens for scripts and AI assistants.

## Run it

```sh
cp .env.example .env            # optional
docker compose up -d --build
docker compose logs docket      # look for the setup code
```

Open `http://127.0.0.1:8200`. Docker publishes the port on this machine only; reach it from other devices through Tailscale Serve or a reverse proxy, or set `DOCKET_BIND` in `.env`. Enter the setup code from the log, your name and a password. For unattended installs, set `DOCKET_PASSWORD` (and optionally `DOCKET_NAME`) on the first start instead.

Behind a proxy, set `DOCKET_TRUSTED_PROXIES` so Docket sees real client addresses, and if you reach it at your own domain (not an IP address, `localhost` or a `*.ts.net` name), add that name to `DOCKET_HOSTS`. Set `TZ` so "today", "overdue" and "due this week" match your day.

### Forgot your password

```sh
docker compose stop docket
docker compose run --rm docket reset-account
docker compose start docket
docker compose logs docket      # new setup code
```

This removes the account, its sessions and every API token. Products and items stay.

## Connect Claude (MCP)

1. In Docket, open **Settings → API & MCP** and create a token (it asks for your password). Choose **Read and write** to let Claude add and change items, or **Read only** to let it look.
2. Copy the token (it's shown once) and add the server to Claude Code:

   ```sh
   claude mcp add --transport http docket https://docket.example.ts.net/mcp \
     --header "Authorization: Bearer dkt_…"
   ```

   Use the address you open Docket at. Any MCP client that supports Streamable HTTP and a bearer header works the same way.

The tools:

| Tool | What it does |
| --- | --- |
| `overview` | Today's date, every product with open counts, urgent items, due soon, in progress |
| `list_products`, `get_product` | Products, their keys, status, counts and milestones |
| `create_product`, `update_product` | Add a product or change its status, version, group, links… |
| `list_items` | Find items by product or sidebar section, status, type, severity, label, milestone, words, due date |
| `get_item` | One item with its body, comments and history |
| `create_item`, `create_items` | Add one item, or up to 50 at once |
| `update_item` | Change any field, append to the body, add or remove labels, move to another product |
| `add_comment` | Leave a progress note on an item |
| `delete_item` | Move an item to the trash (restorable for 30 days) |
| `list_milestones`, `create_milestone`, `update_milestone` | Releases and goals |
| `list_labels`, `recent_activity` | Labels in use; what changed lately |

A read-only token only sees the tools that read. Tokens can never reach your account, sessions, other tokens, or delete a product; changing your password revokes them all.

## REST API

Send a token as `Authorization: Bearer dkt_…` (or use the web session). All bodies are JSON.

```sh
curl -H "Authorization: Bearer $DOCKET_TOKEN" "http://127.0.0.1:8200/api/items?product=PLN&open=1&severity=high,critical"
curl -H "Authorization: Bearer $DOCKET_TOKEN" -H "Content-Type: application/json" \
  -d '{"product":"PLN","title":"Subtitles drift after seek","type":"bug","severity":"high","labels":["playback"]}' \
  http://127.0.0.1:8200/api/items
```

| Method and path | |
| --- | --- |
| `GET /api/meta` | The allowed statuses, types and severities |
| `GET /api/overview` | Home screen data |
| `GET/POST /api/products`, `GET/PATCH /api/products/{key}` | Products |
| `POST /api/products/order` | Sidebar order, each product's section, and the order of section headings |
| `GET /api/groups`, `POST /api/sections`, `PATCH/DELETE /api/sections/{name}` | Sidebar section headings |
| `GET /api/items?product=&section=&status=&type=&severity=&label=&milestone=&q=&open=1&closed=1&overdue=1&dueFrom=&dueTo=&sort=&limit=&offset=` | Find items (`product=IN` for the inbox; lists take commas) |
| `POST /api/items`, `GET/PATCH/DELETE /api/items/{ref}` | One item (`DELETE` moves it to the trash) |
| `POST /api/items/{ref}/restore` | Bring it back from the trash |
| `GET/POST /api/items/{ref}/comments`, `PATCH/DELETE /api/comments/{id}` | Comments |
| `GET/POST /api/milestones`, `PATCH/DELETE /api/milestones/{id}` | Milestones |
| `GET /api/labels`, `GET /api/activity?product=&section=`, `GET /api/calendar?from=&to=`, `GET /api/search?q=` | The rest |

Item fields: `product`, `type`, `title`, `body`, `status`, `severity`, `labels`, `startDate`, `due`, `milestone`, `position`; on `PATCH` also `appendBody`, `addLabels`, `removeLabels`. Errors come back as `{"error": "…"}` with a 4xx status.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `DOCKET_DATA_DIR` | `./data` | Database and daily snapshots |
| `DOCKET_LISTEN` | `127.0.0.1:8200` (`:8080` in the image) | Address to serve on |
| `DOCKET_BIND`, `DOCKET_PORT` | `127.0.0.1`, `8200` | Compose: where the port is published |
| `DOCKET_TRUSTED_PROXIES` | | CIDR ranges allowed to set `X-Forwarded-For` |
| `DOCKET_HOSTS` | | Names you open Docket at besides IP addresses, `localhost` and `*.ts.net` (e.g. `docket.example.com`, `*.example.com`); others are refused |
| `DOCKET_TRASH_DAYS` | `30` | How long deleted items can be restored |
| `DOCKET_SNAPSHOTS` | `7` | Daily database copies kept in `data/snapshots/` (0 turns them off) |
| `DOCKET_PASSWORD`, `DOCKET_NAME` | | Create the account on first start, without the setup code |
| `TZ` | `UTC` | Time zone for dates |

## Backups

Everything is in `DOCKET_DATA_DIR/docket.db`. Docket keeps a copy of it each day in `data/snapshots/` (the last 7), but those sit on the same disk: back up the whole data folder somewhere else too. To restore, stop Docket and put a snapshot in place of `docket.db`.

## Development

Docker and Node are all you need; Go runs in a container.

```sh
make test     # Go tests
make run      # build everything and serve on 127.0.0.1:8200 with ./data (setup code in the output)
make dev      # Vite on 127.0.0.1:5173 with hot reload, proxying /api to make run
```

The backend is Go (standard library HTTP, SQLite through modernc.org/sqlite, no cgo); the web app is React, Vite, Tailwind and shadcn/ui, embedded in the binary.

## Security

Argon2id passwords, optional two-factor codes, a one-time setup code, sign-in limits, hashed sessions and tokens, CSRF and Host checks, a strict Content Security Policy, and a read-only, non-root container listening on 127.0.0.1 by default. [SECURITY.md](SECURITY.md) has the details, a deployment checklist and how to report a problem privately.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
