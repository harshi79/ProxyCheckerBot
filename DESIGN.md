# DESIGN — Yori Proxy Checker Bot

> Status: **APPROVED implementation spec** · Node 22 + TypeScript · grammY · Bot API 10.3
> Author note: everything below is researched against the live Telegram Bot API docs (API 9.1 → 10.3 changelog). All "rich" features used are **free** (no Premium needed).

---

## 1. Product in one paragraph

A private-chat Telegram bot. The user sends a proxy list file in **any format** (or forwards one). The bot parses every line, classifies each proxy (http / socks4 / socks5), and live-streams a smooth progress bar while testing every proxy against the user's saved target URLs (max 5, or a universal default URL if the user chose to skip). The bot replies with **one .txt file per target URL containing only the hits**, named after the URL's hostname (e.g. `Yoriproxies.com.txt`). All UI text uses the user's small-caps font (`↯`, `➣`, `𓁺`) and every major screen carries its own dedicated AI-generated image (user-approved).

## 2. What Telegram gives us for free right now (Bot API 10.3, all free)

| Feature | Since | How we use it |
|---|---|---|
| **Rich Messages** (`sendRichMessage`, rich Markdown/HTML, headings, tables, code blocks, dividers, block quotes, 32 768 chars, 500 blocks) | 10.1 (Jun 11 2026) | Welcome, profile card, check-summary — one message, document-level layout |
| **Streaming drafts** (`sendRichMessageDraft`, fixed `draft_id` → Telegram animates each update, `can_stop` → native Stop button, ephemeral 30 s preview, finalized with `sendRichMessage`) | 10.1 | **The live loadbar.** No message-spamming, native smooth animation, no edit-rate-limit pain |
| **Ephemeral messages** (visible only to one user, `replace_callback_query_message` → button press *morphs* the message in place, `editEphemeralMessage*`, 15 s window) | 10.2 (Jul 14 2026) | "Set Url" flow: pressing a button replaces the menu message with the manage screen exactly as the user described |
| **Colored buttons** (`style`: `primary`/`success`/`danger`) | 9.4 (Feb 9 2026) | Free native button colors: primary = Set/Check, success = See/Keep, danger = Remove. (Custom-emoji *icons* on buttons are Premium/Fragment — we do **not** rely on them; plain emojis in the label are free) |
| `sendMessageDraft` (plain streaming, "Thinking…" placeholder) | 9.3/9.5 | Fallback progress stream for clients without rich support |
| `editMessageText` / `editMessageMedia` | always | Progress fallback + finalizing screens |
| Long polling | always | Zero-infrastructure deployment |

### Hard limits we design around (free tier)

| Limit | Value | Design consequence |
|---|---|---|
| Bot **download** (getFile) | **20 MB** | Max incoming list ≈ 20 MB (≈ 150k–300k lines). Friendly reject above. (Local Bot API server would lift to 2 GB — optional future) |
| Bot **upload** | 50 MB | Result docs always far smaller; safe |
| Message rate | ~1 msg/s per chat, 429 + FLOOD_WAIT on excess | All progress = **one** message, updated via draft/edit (1 update/sec). grammY throttler plugin absorbs 429s |
| `callback_data` | 64 bytes | Short codes: `dev`, `setu`, `set`, `mgr`, `rmv`, `see`, `skip`, `stop` |
| Plain message length | 4096 chars | Rich messages (32k) for the big screens; plain fallback keeps ≤4096 |
| File name | 60 chars | Hostname sanitized, truncated to 55 + `.txt` |

### Client-compatibility strategy ("as advanced as you can")

Every message has **two render paths** behind one builder:

1. **Rich path** — `sendRichMessage` / rich draft (new clients, animated).
2. **Plain path** — `sendMessage` / `editMessageText` with legacy HTML formatting (bold/mono/italic). Same content, same font — the small-caps glyphs are just Unicode text, so they render in every client.

First attempt goes rich; on a "not supported" error we remember it per-process and fall back forever after (no repeated failing round-trips). Users on ancient clients still get a fully working bot.

## 3. The font

All bot copy passes through one `stylize()` util: lowercase a–z → small caps (verified mapping: `ᴀ ʙ ᴄ ᴅ ᴇ ꜰ ɢ ʜ ɪ ᴊ ᴋ ʟ ᴍ ɴ ᴏ ᴘ ꜱ ʀ ᴛ ᴜ ᴠ ᴡ x  ᴢ` — note `q` shares the glyph with `s`, acceptable), digits → `⁰¹²³⁴⁵⁶⁸⁹`, symbols kept as-is (`↯ ➣ 𓁺 ゟ ⚡  ▱ ·`). URLs, proxy lines, code and file names are **never** stylized (legibility + they live in code blocks/files).

```
Input:  **↯ user information ↯**     →  **↯ ᴜꜱᴇʀ ɪɴꜰᴏʀᴍᴀᴛɪᴏɴ ↯**
Input:  [↯] type ➣ human 𓁺          →  [↯] ᴛʏᴘᴇ ➣ ʜᴜᴍᴀɴ 𓁺
```

## 4. UX flows (with mockups)

### 4.1 `/start` — welcome (rich message + image)

```
┌────────────────────────────────┐
│        [ welcome.jpg ]         │
└────────────────────────────────┘
**↯ ᴏʀɪᴏɴ ᴘʀxʏ ᴄʜᴇᴄᴋᴇʀ ↯**          ← bot name = open question Q1

⚡ ꜰᴀꜱᴛ · ꜱᴛᴇᴀʟᴛʜ · ꜰʀᴇᴇ

ꜱᴇɴᴅ ᴍᴇ ʏᴏᴜʀ ᴘʀxʏ ʟꜱᴛ (ᴀɴʏ ꜰʀᴍᴀᴛ, ғɪʟᴇ ʀ ᴛᴇxᴛ) —
ɪ ᴡɪʟʟ ᴛᴇꜱᴛ ᴠᴇʀʏ ꜱɪɴɢʟᴇ ʀᴏxʏ ᴀɴᴅ ꜱᴇɴᴅ ʙᴀᴄᴋ ɴʟʏ ᴛʜᴇ ʜɪᴛꜱ.

ᴄʜᴇᴄᴋꜱ ʀᴜɴ ᴀɢɪɴᴛ ᴛʜᴇ ʀʟꜱ ʏᴏᴜ ꜱᴇᴛ (ᴍx 5) ʀ ᴀ ɴɪᴠᴇʀᴀʟ ᴅᴇꜰᴜʟᴛ.

[ ↯ ᴅᴠᴇʟᴏᴘᴇʀ ]  [ ⚙ ꜱᴇᴛ ᴜʀʟ ]  [ ◉ ᴘᴏꜰʟᴇ ]
   (url btn        (primary)       (primary)
   t.me/WhoEvenYori)
```

### 4.2 `↯ ᴅᴠᴇᴏᴘᴇ`

Message replaced (ephemeral-replace or edit) with developer card:

```
┌────────────────────────────────┐
│        [ developer.jpg ]       │
└────────────────────────────────┘
**↯ ᴅᴇᴠᴇʟᴏᴇʀ ↯**
ᴛʜᴇ ᴍɴᴅ ʙᴇʜɪɴᴅ ᴛʜᴇ ʙᴏᴛ

[ ↯ ᴏᴘᴇɴ ᴅᴇᴠ ]        (url button → https://t.me/WhoEvenYori)
[ ◁ ʙᴀᴄᴋ ]
```

### 4.3 `⚙ ᴇᴛ ᴜʀʟ` → manage screen (message replaced in place)

```
┌────────────────────────────────┐
│        [ manager.jpg ]         │
└────────────────────────────────┘
** ᴍᴀɴᴀɢᴇ ᴜʀʟꜱ ↯**
ᴛʜᴇ ꜱᴛᴇꜱ ʏᴏᴜʀ ᴘʀᴏxɪᴇ ɢᴇᴛ ᴛᴇꜱᴛᴅ ᴀɢᴀɪɴꜱᴛ

ꜱᴛᴏʀᴇ: 2 / 5
› https://yoriproxies.com
› https://example.com

[ ⚙ ᴇᴛ ᴜʀʟꜱ ]   [ ◉ ᴍᴀɴᴀɢᴇ ]
```

- **⚙ ᴇᴛ ᴜʀʟꜱ** → bot replies: `ꜱᴇɴᴅ ᴍᴇ ᴜᴘ ᴛᴏ 5 ᴜʀʟꜱ — ᴏɴᴇ ᴘᴇʀ ʟɪɴᴇ ` (force reply). User's next text is parsed: ≤5 lines, each must be a valid http(s) URL (scheme auto-added if missing), private/IP ranges rejected (SSRF guard), duplicates merged. Stored list **replaced** with the new set. Confirmation re-renders the manage screen.
- **◉ ᴍᴀɴᴀɢᴇ** → shows two buttons:

```
[ ✕ ʀᴇᴍᴏᴠᴇ ]  [ 📄 ꜱᴇᴇ ]
```

- **📄 ꜱᴇᴇ** → sends the stored URLs as a `.txt` document (`urls.txt`, one per line).
- **✕ ʀᴇᴍᴏᴠᴇ** → bot replies: `ꜱᴇɴᴅ ᴛʜᴇ ᴜʀ ᴛᴏ ʀᴍᴏᴠ — ᴏ ꜱᴇɴᴅ 0 ᴛᴏ ᴄʟᴇᴀʀ ᴀʟʟ`. User sends a URL → removed (confirmed, list re-rendered); sends `0` → all cleared.
- **Back** always returns to the /start welcome.

State machine (per user, persisted): `idle | awaiting_set_urls | awaiting_remove`. Stray messages in a waiting state are routed to the state; everything else in `idle` that looks proxy-like kicks off a check.

### 4.4 Proxy check — the core flow

User sends a file (any format: `.txt`, `.zip`? → v1 text-based, zip rejected with hint) or plain text with proxy lines:

```
1.92.3.4:8080
http://2.3.4.5:3128
socks5://user:pass@1.2.3.4:1080
1.2.3.4:1080/5 9x8y7z        ← "host:port/proto user:pass" style
[2001:db8::1]:8081           ← IPv6
```

**Step 1 — parse report** (instant, before any check):

```
**↯ ᴘʀᴏxɪᴇ ʟᴏᴀᴅᴇᴅ ↯**

ꜰɪʟᴇ: ᴘʀx.txt (4.2 ᴍ · 52 341 ʟɪɴᴇꜱ)

ʜᴛᴛᴘ    ➣ 41 209
ꜱᴄᴋ5  ➣  8 930
ꜱᴏᴄᴋꜱ4    1 128
ʀᴇᴊᴇᴄᴛᴇᴅ ➣     74

ᴄʜᴇᴄᴋ ᴛᴀʀᴇᴛꜱ:
› https://yoriproxies.com
› https://example.com
```

**Step 2 — target branch** (the buttons matter, exactly as specified):

- User has saved URLs → buttons `[ ✅ ꜀ʜᴇᴄᴋ (2 ᴜʀꜱ) ] [ ◁ ʙᴀᴄᴋ ]` — check runs against **all** saved URLs.
- User has **no** saved URLs → buttons `[ ⚙ ꜱᴇᴛ ᴜʀʟ ] [ ⏭ ꜱᴋɪᴘ ]`
  - **⚙ ꜱᴇᴛ ᴜʀʟ** → goes to the 4.3 manage flow; on save, returns to this parse screen with the check button.
  - **⏭ ꜱᴋᴘ** → tests against the **universal default** `https://api.ipify.org` (tiny, global, fast, returns the exit IP → lets us also flag elite vs transparent proxies).

**Step 3 — live loadbar** (one rich draft, same `draft_id` → native smooth animation, ~1 update/s, native Stop button):

Three candidates — **pick one (Q2)**:

```
A ▸ classic bar + braille spinner        B ▸ per-URL rows (my pick)        C ▸ minimal radar
─────────────────────────────            ────────────────────────────        ─────────────────
⟨ ᴘʀxʏ ʜᴜɴᴛᴇʀ ⟩                         ⟨ ʜᴇᴄɪɴ ʜɪᴛ ⟩                   ᴄʜᴀɪɴ…
▰▰▰▰▰▱▱▱▱ 57%                           ▰▰▰▰▱▱ 48%                          ʜɪᴛꜱ ꜱᴏ ғᴀʀ: 317
ᴅᴏɴᴇ 29 912 / 52 341                       ▸ yoriproxies.com  29912 · 203 ✓   29 912 / 52 341
ʜɪᴛꜱ 3 170 · ᴅᴇᴅ 26 742                   ▸ example.com      29912 · 158 ✓   ⏱ 00:47
⏱ 00:47 · ʀᴇsɪᴅᴜᴀʟ 01:12                   ʜɪᴛꜱ 361 · ᴅᴇᴅ 29 551 · ⏱ 00:47   ʜɪᴛ ʀᴀᴛ 6.7%
```

Why B: with up to 5 targets, per-URL rows show *where* each hit lands — it doubles as a live results preview and looks custom, not template. The bar itself is `▰▱` blocks + a braille spinner cycle `⠋⠙⣾⠏⠟⠗⠎` between updates, ETA from running rate.

If the client lacks rich drafts → same layout via `editMessageText` (1 edit/s, identical layout).

**Step 4 — results** (rich summary + documents):

```
┌────────────────────────────────┐
│        [ results.jpg ]         │
└────────────────────────────────┘
**↯ ᴄʜᴇᴄᴋ ᴄᴏᴍᴘʟᴇᴛᴇ ↯**

 02:14 · 52 341 ᴛᴇꜱᴛᴅ

› yoriproxies.com   ✅ 3 402 ʜɪᴛ   [📄 Yoriproxies.com.txt]
› example.com       ✅ 2 887 ʜɪᴛꜱ   [📄 example.com.txt]

ᴛᴏᴛᴀʟ ᴜɴɪǫᴜᴇ ʜɪᴛꜱ: 4 913   [📄 ALL_HITS.txt]

(inline buttons open/send the docs · or docs are sent directly, ≤3 at a time to respect rate limits)
```

- One doc per target URL, **hits only**, original line format (ready to paste back into scrapers). Filename = sanitized hostname exactly as entered (default behavior; Q — see open questions), e.g. `Yoriproxies.com.txt`.
- `ALL_HITS.txt` = union.
- Zero hits → styled "ɴᴏ ʜɪᴛꜱ ꜰᴏᴜɴᴅ" message with a hint (list may be stale / targets blocking datacenter IPs).

### 4.5 `◉ ᴘᴏꜰɪʟᴇ`

```
┌────────────────────────────────┐
│          [ profile.jpg ]       │  ← user pfp-style card (bot-generated frame)
└────────────────────────────────┘
**↯ ᴜꜱᴇʀ ɪɴꜰᴏʀᴍᴀᴛɪᴏɴ ↯**

[↯] ɴᴀᴍᴇ ➣ ʏᴏɪ ᴀꜱꜱɪꜱᴛᴀɴᴛ 𓁺
[↯] ᴜꜱᴇʀɴᴀᴍᴇ ➣ @YorichiiPrime
[↯] ɪᴅ ➣ `7728424218`
[↯] ᴛᴘᴇ ➣ ʜᴜᴍᴀɴ
[↯] ʙɪᴏ ➣ ʟʟ ᴄʜᴀɴɴʟꜱ : @YoriNetwork ゟ
```

Name/username/id straight from the update; `type` = `ʜᴜᴍᴀɴ` or `ʙᴏᴛ` (auto-detected); bio shown if the user has one (else `ɴᴏɴᴇ`). Plus a stats footer (proxies checked lifetime) — cheap from SQLite, makes it feel "detailed".

## 5. Proxy engine

### 5.1 Parser (permissive by design)
- Line → candidates via ordered regexes:
  1. `(http|https|socks4|socks5|sockss)://(user:pass@)?host(:port)?`
  2. `host:port (/proto (user:pass)?)`
  3. bare `host:port` → protocol **auto-detected** by probe order http → socks5 → socks4
- Hosts: IPv4, IPv6 (`[v6]:port`), domains. Ports 1–65535.
- Normalization, de-dupe (case-insensitive), blank/comment/malformed lines counted as `rejected`.
- Accepts: direct document, forwarded document, plain text message (≥1 proxy-looking line). Hard cap 20 MB / 300 000 lines.

### 5.2 Checker
Per `(proxy, targetUrl)`:
1. **TCP + protocol handshake** (5 s cap) — SOCKS4/SOCKS5 greeting+connect, HTTP `CONNECT` for https targets / plain GET otherwise. Auth sent when the proxy line carries credentials.
2. **Fetch through the tunnel** (12 s total) — GET target, first ~1 KB is enough.
3. **Verdict** — "hit" = the proxy delivered an HTTP response from the *target site* (status any — even 403/404 proves reachability; proxy-level errors/timeouts = dead). Q3 asks you to confirm the strictness.
4. **Latency** recorded; with the universal default target the body is the exit IP → compared with our own egress IP → `ᴇʟᴛᴇ` vs `ᴛʀᴀɴᴘᴀᴇɴᴛ` tag (bonus info, free).

### 5.3 Concurrency & scale
- Per job: **200** concurrent checks; global: **600** in flight; max **4** jobs running, FIFO queue (others get `ǫᴜᴇᴜᴇ · ᴘꜱᴛɪᴏɴ 2`).
- Worst case 300k × 5 URLs ≈ 1.5 M requests → at 200 workers / ~1.5 s avg ≈ 10–40 min. Fine for a private bot; the ETA bar makes it feel alive.
- Memory: stream-parse the file, keep only `{line, proto, hits[], latency[]}` rows. 300k rows ≈ tens of MB — OK on a small VPS.
- **SSRF guard** on user-set targets: DNS-resolve first; reject loopback, RFC1918, 169.254 (incl. cloud metadata `169.254.169.254`), `::1`, ULA, CGNAT. http/https only. A checker that can be pointed at internal IPs is an SSRF tool — not shipping that.
- Proxy targets in private ranges are skipped as dead (no outbound surprise).

### 5.4 Testing strategy (honest constraint)
This sandbox **cannot reach `api.telegram.org`** (egress allowlist: npm + GitHub work, Telegram doesn't). So:
- A **mock Telegram Bot API server** (local HTTP, ~200 lines: `getUpdates`, `sendMessage/RichMessage`, `sendRichMessageDraft`, `edit*`, `getFile`, `answerCallbackQuery`) drives full **integration tests of every UX flow** headlessly.
- The checker engine is tested against **local mock proxies** (tiny HTTP-CONNECT + SOCKS4/5 servers in the test suite, loopback allow-listed in test mode) + a local target server — full end-to-end verification of parsing, protocols, tunneling, verdicts, result files.
- Real-world smoke test = deploy (your VPS/Docker) + a handful of real public proxies. Documented in README.

## 6. Storage (SQLite, `better-sqlite3`)

```
users(id, name, username, bio, is_bot, created_at, last_seen_at, checks_done, proxies_tested)
url_settings(user_id, seq, url)          -- ≤5 rows/user, ordered
jobs(user_id, job_id, created_at, finished_at, total, hits, status, queue_pos)
```
Settings survive restarts. No heavy history in v1 (job rows = light history).

## 7. Anti-abuse (it's a public @bot eventually)

- Private chats only; groups ignored.
- One active job per user; 4 global; queue capped.
- 20/day soft job cap per user (config), 20 MB file cap (API-enforced anyway).
- SSRF guard (§5.3); no arbitrary-host "ping" feature; target URLs validated at set-time, not just check-time.
- Token from `.env` (already gitignored; `.env.example` provided).

## 8. Art direction (AI images, you approve each)

Five separate images, one per screen, sent uncompressed (as photo):

| Asset | Screen | Purpose |
|---|---|---|
| `welcome.jpg` | /start | brand hero |
| `developer.jpg` | Developer | dev card |
| `manager.jpg` | Set/Manage URL | manage screen |
| `profile.jpg` | Profile | user-info frame |
| `results.jpg` | Check complete | "hits found" stamp |

Style = **one question (Q4)**. Generation: 2 candidates each via side-by-side options → you pick → rest of the set follows the chosen direction. Target: looks like a designed asset, not AI slop (clean composition, restrained detail, no extra limbs/text artifacts). ~1080×608 (16:9-ish) JPEG < 400 KB.

## 9. Repo layout

```
ProxyCheckerBot/
├─ src/
│  ├─ index.ts              # bootstrap: env, bot, start long-poll
│  ├─ bot/
│  │  ├─ bot.ts             # grammY bot, middleware (rate-limit, private-only, state)
│  │  ├─ handlers/
│  │  │  ├─ start.ts        # /start, welcome, main menu
│  │  │  ├─ developer.ts
│  │  │  ├─ profile.ts
│  │  │  ├─ urls.ts         # set/manage/remove/see flow (FSM)
│  │  │  ├─ check.ts        # file intake, parse report, target branch, results
│  │  │  └─ progress.ts     # draft-streaming loadbar + fallback
│  │  └─ ui/
│  │     ├─ stylize.ts      # small-caps font engine
│  │     ├─ keyboards.ts    # all inline keyboards (styled, ≤64B callback codes)
│  │     ├─ templates.ts    # every message template (rich + plain path)
│  │     └─ send.ts         # rich-with-fallback sender, 429-aware
│  ├─ checker/
│  │  ├─ parse.ts           # permissive proxy parser
│  │  ├─ types.ts
│  │  ├─ engine.ts          # worker pool, job queue, verdicts
│  │  ├─ http.ts            # http/https proxy client (CONNECT)
│  │  ├─ socks.ts           # socks4/socks5 client (auth, no-rdns)
│  │  ├─ targets.ts         # url validation + SSRF guard
│  │  └─ report.ts          # per-URL hit files, ALL_HITS, stats
│  ├─ store/  db.ts, users.ts, urls.ts, jobs.ts
│  └─ config.ts             # env + limits, one place
├─ assets/img/              # the 5 approved images
├─ test/
│  ├─ mocktg/               # mock Bot API server
│  ├─ mockproxy/            # local http/socks4/5 test proxies + target
│  ├─ parser.test.ts  engine.test.ts  flows.test.ts
├─ .env.example  tsconfig.json  package.json
├─ Dockerfile  README.md  DESIGN.md
```

## 10. Build plan

| M | Deliverable |
|---|---|
| M0 | Scaffold: TS + grammY + eslint + env + CI-less green `npm test` |
| M1 | Font engine, templates, keyboards, mock-TG server, /start + developer + profile |
| M2 | URL set/manage/remove/see flow (FSM + SQLite) — full integration test |
| M3 | Parser + engine + mock proxies — unit/integration, per-protocol coverage |
| M4 | Check flow end-to-end: parse report → target branch → live loadbar → result docs |
| M5 | Images (your picks), Dockerfile, README (deploy: Docker / VPS+systemd), final polish |

## 11. Decisions (approved)

1. **Bot name:** Yori Proxy Checker (welcome header: `↯ ʏᴏʀɪ ᴘʀᴏxʏ ᴄʜᴇᴄᴋᴇʀ ↯`)
2. **Loadbar:** variant B — per-URL rows + bar
3. **Hit rule:** any HTTP response from the target through the proxy = hit (200/301/403/404…)
4. **Art:** black + gold minimal — matte black, thin gold hairlines, one accent object, no AI-slop texture
