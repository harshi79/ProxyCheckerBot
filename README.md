# Yori Proxy Checker

A private-chat Telegram bot that parses proxy lists, checks every proxy against up to five target URLs, and returns **only the working lines**. It is written in Node.js + TypeScript with [grammY](https://grammy.dev/) and SQLite.

The bot's visual language is intentionally restrained: user-approved matte-black and gold screen art, small-caps copy, and one edited/drafted progress message instead of a message storm.

## What it does

- `/start` opens a rich welcome card with separate Developer, Set URL, and Profile actions.
- Developer links to `https://t.me/WhoEvenYori`.
- Set URL stores up to **five** public `http`/`https` URLs, one per line.
- Manage lets the user remove one URL, send `0` to clear all, or download the complete stored list as `urls.txt`.
- Accepts proxy files and proxy-looking text messages. Common URL, `host:port`, protocol suffix, IPv6, and credential formats are supported.
- Reports HTTP, SOCKS4, SOCKS5, auto-detected, and rejected counts before checking.
- With no saved URLs, offers exactly **Set URL** and **Skip**. Skip uses `https://api.ipify.org`.
- Checks each proxy against every target. Any valid HTTP response, including `301`, `403`, and `404`, is a hit; timeouts, handshake failures, and proxy errors are dead.
- Streams a single smooth per-URL progress loadbar with a rich draft where available, and falls back to one edited message on older Bot API servers.
- Sends one target-hostname `.txt` file plus `ALL_HITS.txt`. Empty target files are not sent, and no dead proxies are included.
- Shows a profile card with Telegram name, username, id, human/bot type, bio, and lifetime statistics.

## Requirements

- Node.js **22+**
- A bot token from [@BotFather](https://t.me/BotFather)
- A server with outbound TCP/HTTPS access to Telegram and to the public targets/proxies you want to check

Telegram is deliberately not contacted by the test suite. This sandbox cannot reach `api.telegram.org`; the repository includes a local mock Bot API integration test instead.

## Local setup

```bash
cp .env.example .env
# put your BotFather token in .env
npm ci
npm run build
npm start
```

`npm ci` skips install scripts (see `.npmrc`). `better-sqlite3` 13 already ships N-API prebuilds, and a lockfile install otherwise tries to compile them with node-gyp. That compile needs Python and a C++ toolchain, which deploy images do not have.

Development mode:

```bash
npm run dev
```

The bot uses long polling, so no public webhook URL is required. Private chats are accepted; group updates are ignored.

A tiny health HTTP server also binds on `PORT` (default `8080`) at `/`, `/health`, and `/healthz` so container platforms can probe readiness. Without `BOT_TOKEN`, only the health server starts.

## Docker

```bash
cp .env.example .env
# edit .env and set BOT_TOKEN

docker build -t yori-proxy-checker .
docker run -d \
  --name yori-proxy-checker \
  --restart unless-stopped \
  --env-file .env \
  -v yori-proxy-data:/app/data \
  yori-proxy-checker
```

`/app/data/bot.db` is the SQLite database. `API_BASE_URL` can point to a self-hosted Local Bot API Server if larger downloads are required; the public Bot API download limit is 20 MB.

## Configuration

All settings are optional except `BOT_TOKEN`:

| Variable | Default | Purpose |
|---|---:|---|
| `BOT_TOKEN` | — | Token from @BotFather (required for Telegram polling) |
| `PORT` / `HEALTH_PORT` | `8080` | Health-check HTTP listen port |
| `API_BASE_URL` | `https://api.telegram.org` | Bot API root, useful for a local Bot API server |
| `DB_FILE` | `data/bot.db` | SQLite path |
| `MAX_TARGET_URLS` | `5` | Stored target URL limit |
| `MAX_FILE_MB` | `20` | Incoming document cap |
| `MAX_LINES` | `300000` | Parsed non-empty line cap |
| `JOB_CONCURRENCY` | `200` | Checks per running job |
| `GLOBAL_CONCURRENCY` | `600` | Checks across all jobs |
| `MAX_RUNNING_JOBS` | `4` | Running jobs before FIFO queueing |
| `DAILY_JOBS_PER_USER` | `20` | Soft per-user daily limit |
| `DEFAULT_TARGET_URL` | `https://api.ipify.org` | Skip-path target |

## Safety and limits

User target URLs are validated at save time and again at check time. Only HTTP(S) is accepted. Loopback, RFC1918, link-local/metadata, CGNAT, benchmarking, IPv6 ULA, and other private destinations are rejected. Proxy endpoints in private ranges are skipped in production as well.

The checker has bounded job/global concurrency, one active job per user, a four-job running cap, a daily soft limit, and one progress update per second. These limits protect both the host and Telegram's per-chat rate limits.

## Tests

```bash
npm test
npm run build
```

The test suite contains:

- parser, small-caps, SSRF, and result-file tests;
- local HTTP-proxy and SOCKS5-proxy integration fixtures, including 403/404 hit semantics;
- a local mock Telegram Bot API server exercising grammY's rich welcome route and URL-manager callback morph.

For a deployment smoke test, set a real `BOT_TOKEN` on the VPS, run the Docker image, send `/start`, set a harmless public target such as `https://example.com`, and check a tiny known proxy fixture. Do not use private/internal targets.

## Project layout

```text
assets/img/          approved screen art: welcome, developer, manager, profile, results
src/bot/             grammY assembly, state machine, handlers, UI delivery/templates
src/checker/         parser, SSRF guard, HTTP/SOCKS clients, bounded engine, reports
src/store/           SQLite persistence for users, URLs, and light job history
src/util/            stylization and file helpers
test/                mock Bot API and local proxy integration fixtures
DESIGN.md            researched Bot API/design decisions and UX specification
```

## License

GPL-3.0-only. See [LICENSE](LICENSE).
