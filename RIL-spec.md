# RIL — Product & Technical Spec

*v0.3 · 2026-04-19 · 2-day personal build*

## 1. What we're building

A personal read-it-later system composed of three things you mostly already have, plus a small amount of glue:

- **Discord** as the universal capture inbox (works on phone + PC, share-sheet on mobile, Ctrl+L Ctrl+C Ctrl+V on desktop).
- **Obsidian** as the reader and second brain (cross-device via Obsidian Sync / iCloud, native highlights/tags/backlinks/Dataview).
- **A local Node service + a Zara-inspired triage dashboard** as the glue and the daily decision-making surface.

The whole thing runs on your laptop. No cloud, no auth, no monthly bill. Open-sourceable as "Discord-to-Obsidian read-it-later with a triage dashboard" once it stabilizes.

The thing that makes RIL not-a-dead-stack is the explicit **three-state triage flow** modeled on Zara Zhang's `tab-out` extension: every new item starts in **Inbox**, and your daily job is to push each one into **Saved for later**, **Archive**, or **Trash**. You don't read in the dashboard — you triage there. Reading happens in Obsidian.

---

## 2. Architecture

```
   Phone / PC                    Your laptop
   ─────────                     ────────────────────────────────
   Discord ───── messages ────▶  Node service (one process)
                                 │
                                 ├─▶ discord.js bot (gateway listener)
                                 ├─▶ URL extractor + Readability + turndown
                                 ├─▶ writes  ./vault/RIL/Inbox/<slug>.md
                                 │             with frontmatter
                                 │
                                 └─▶ HTTP API at localhost:3000
                                          ▲
                                          │  read/write frontmatter
                                          │
                       Triage dashboard (Vite + Preact + Tailwind)
                       served at localhost:3000
                                          │
                                          │  obsidian:// deep links
                                          ▼
                                       Obsidian (reader)
                                          │
                                          │  Obsidian Sync / iCloud
                                          ▼
                                       Phone Obsidian (read on the go)
```

One Node process, one Vite app, one Obsidian vault folder. That's the entire surface area.

---

## 3. The core loop

1. **Capture (anywhere).** See an article → copy URL → paste into the `#ril` Discord channel. On mobile, Share Sheet → Discord → done.
2. **Process (automatic, ~5s after posting).** The Node service grabs the URL, fetches the page, extracts a clean article via Mozilla Readability, converts to Markdown, writes a file into `vault/RIL/Inbox/`, and posts a 👍 reaction to the Discord message so you know it landed.
3. **Triage (daily, ~60 seconds).** Open `localhost:3000`. See your inbox grouped by domain. Walk through with `j/k`, hit `s` to save things you'll actually read, `e` to archive things you won't, `x` to trash junk. Bulk-archive by domain when you know a source isn't this week's priority.
4. **Read (in Obsidian, on any device).** "Saved for later" is your real reading queue. Open Obsidian, go to `RIL/Saved`, pick an article, read in the customized Markdown reader, highlight, add notes, tag.
5. **Sunset (passive).** Items in Saved older than 30 days get a frontmatter flag; a weekly script (later) prompts you to confirm or auto-archives them.

---

## 4. 2-day MVP scope

### Day 1 — Ingest

**Morning (~3h)**
- Scaffold a single Node + TypeScript project (or plain JS — whatever Cursor writes faster).
- Set up the Discord bot: create a private server with one channel `#ril`, register a bot, add it to the server, get the token, store in `.env`.
- Wire `discord.js` gateway listener to receive messages on that channel.
- For each message containing a URL: fetch the page (`undici` or native `fetch`), pass the HTML through `jsdom` + `@mozilla/readability`, convert the resulting article HTML to Markdown via `turndown`.

**Afternoon (~5h)**
- Define the frontmatter schema (see §6).
- Filename scheme: `YYYY-MM-DD-<slug>.md` written into `vault/RIL/Inbox/`.
- Duplicate detection: hash the canonical URL; skip if a file with the same `url` frontmatter already exists in any folder (Inbox/Saved/Archive).
- Graceful fallback: if Readability returns nothing (paywalls, JS-only sites, YouTube, X), still write a stub file with URL + title + `extraction_failed: true`. The triage UI handles these as "URL-only" items.
- **Heuristic auto-tagger** (see §5.1): run on every ingest, populate `tags: []` frontmatter with domain-prior + keyword-matched tags.
- React 👍 (success) or ⚠️ (extraction failed) on the originating Discord message.
- Run as a long-lived process via `pm2` or `launchd` so it auto-starts.

**End of Day 1 demo:** Paste any URL into Discord, see it appear as a clean Markdown file in your Obsidian vault within seconds. That's a working product.

### Day 2 — Triage dashboard

**Morning (~4h)**
- Add a tiny HTTP API to the same Node process (express or hono). Endpoints:
  - `GET /api/items?status=inbox|saved|archived&groupBy=domain|topic` → list items with parsed frontmatter, pre-grouped.
  - `POST /api/items/:id/action` body `{action: 'save'|'archive'|'trash'|'unread'}` → updates frontmatter + moves the file between `Inbox/`, `Saved/`, `Archive/`, or deletes.
  - `POST /api/items/:id/tags` body `{tags: [...]}` → replace an item's tags (for manual correction of the auto-tagger).
  - `GET /api/health` → for sanity.
- Scaffold the dashboard with Vite + Preact + Tailwind. Pull in Newsreader + DM Sans from Google Fonts. Apply the design system in §7.

**Afternoon (~4h)**
- Three-section layout: **Inbox** (main, with a **Group by [domain ▾ | topic]** toggle in the section header) on the left, **Saved for later** sticky sidebar on the right with collapsible **Archive** below it.
- Each item row: tiny site icon + title + domain + relative date, with two icons on the right (bookmark = save, X = archive). Show inline tag chips in "topic" view; suppress them in "domain" view (redundant).
- Group headers show count + an "Archive all N" bulk action. In topic view, groups are the tags themselves (`#agents`, `#research`, `#essay`, etc.); untagged items land in a collapsed "Untagged" group at the bottom.
- Keyboard shortcuts: `j/k` next/previous item, `s` save, `e` archive, `x` trash, `o` open original URL in new tab, `Enter` open in Obsidian via `obsidian://open?vault=...&file=...`, `u` undo last action, `t` toggle domain/topic grouping.
- Action animations: subtle card-fade on remove (0.25s), no sound, no confetti.
- README + MIT license + `.env.example`.

**Buffer / cut list (in order to drop if behind):**
1. Drop the keyword-rule layer of the auto-tagger; keep only domain-prior tags. You still get `#video` / `#research` / `#code` / `#essay` grouping, just without topic-level nuance.
2. Drop the Group by topic toggle entirely; ship domain-only grouping in v1 and re-add once tagging quality is proven.
3. Drop the keyboard shortcuts (mouse-only is still usable).
4. Drop the Archive panel (just hide archived items from view).
5. Drop bulk-domain actions (per-item is still fast).
6. Never drop: domain grouping itself — that's the single most important feature for the not-a-dead-stack feeling.

---

## 5. Tech stack (concrete)

**Node service:**
- Runtime: Node 20+
- Discord: `discord.js` v14
- HTTP fetch: native `fetch` or `undici`
- Article extraction: `@mozilla/readability` + `jsdom`
- HTML→Markdown: `turndown`
- Frontmatter: `gray-matter`
- HTTP server: `hono` (lighter than express; AI tools write it well)
- Process supervisor: `pm2` on macOS/Linux, or `launchd` plist

**Triage dashboard:**
- Build: Vite
- Framework: Preact (smaller than React, same JSX, faster cold start)
- Styling: Tailwind CSS, configured with the custom palette in §7
- Fonts: Newsreader + DM Sans via `<link>` from Google Fonts
- Icons: `lucide-preact` (matches Zara's clean line-icon style)
- State: just `useState` + fetch; no Redux/Zustand needed for one user

**Repo layout:**
```
ril/
├── packages/
│   ├── service/        # Node ingest + API
│   │   ├── src/bot.ts
│   │   ├── src/extractor.ts
│   │   ├── src/api.ts
│   │   └── src/vault.ts
│   └── dashboard/      # Vite app
│       └── src/...
├── .env.example
├── README.md
└── LICENSE             # MIT
```

A monorepo is overkill for one user but makes future open-sourcing tidier. If it slows Day 1, collapse to a single package.

### 5.1 Auto-tagger rules (heuristic, local, free)

Runs synchronously during ingest, right after Readability extraction but before writing the Markdown file. Two layers, additive — an item can receive tags from both.

**Layer A — Domain priors.** Maps each domain (or domain family) to one or more coarse topic tags. Baseline rules to ship with:

| Domain pattern | Tags added |
|---|---|
| `youtube.com`, `youtu.be` | `#video` |
| `arxiv.org` | `#research` |
| `github.com` | `#code`, `#tools` |
| `substack.com`, `every.to`, `stratechery.com`, `platformer.news` | `#essay` |
| `anthropic.com`, `openai.com`, `deepmind.google` | `#lab-post` |
| `huggingface.co` | `#ml`, `#models` |
| `x.com`, `twitter.com` | `#social` |
| `news.ycombinator.com` | `#discussion` |
| *(fallback)* | *(no tag)* |

Keep the rules in a single `config/domain-tags.json` file so they're editable without code changes.

**Layer B — Title / URL keyword rules.** Regex-lite word-boundary match on `title + url + h1 + first 200 words`, case-insensitive. Baseline rules:

| Pattern | Tag |
|---|---|
| `\b(agent|agentic|autonomous|claude-code)\b` | `#agents` |
| `\b(rag|retrieval[- ]augmented)\b` | `#rag` |
| `\b(eval|evals|benchmark|harness)\b` | `#evals` |
| `\b(fine[- ]?tune|post[- ]training|rlhf|dpo)\b` | `#training` |
| `\b(mcp|tool[- ]use|function[- ]calling)\b` | `#tools` |
| `\b(alignment|safety|interpretability|constitutional)\b` | `#alignment` |
| `\b(reasoning|chain[- ]of[- ]thought|cot)\b` | `#reasoning` |
| `\b(design|ux|ui|figma)\b` | `#design` |
| `\b(founder|startup|seed|series [a-d])\b` | `#startup` |

Keep these in `config/keyword-tags.json`, likewise editable. Dedupe before writing. If zero tags match, leave `tags: []` — items show up in the "Untagged" group in topic view.

**Expected quality:** this is deliberately coarse. It'll mis-tag some things (e.g. an article about "AI agents in healthcare policy" tagged `#agents` when you'd call it `#policy`). That's fine — every tag chip in the dashboard is click-to-edit, and the point is to beat a blank slate, not to be right. After a few weeks of real usage you'll see which rules need tightening, which is the right time to graduate to LLM classification (see §9).

---

## 6. Vault file format

Every saved item is a Markdown file with YAML frontmatter:

```yaml
---
url: https://example.com/article
canonical_url: https://example.com/article
title: "How AI agents and Claude skills work together"
author: "Some Person"
site: youtube.com         # used for grouping
domain: youtube.com
published_at: 2026-04-15
saved_at: 2026-04-19T10:32:11Z
read_at: null              # set when you mark read
status: inbox              # inbox | saved | archived | trashed
source: discord            # discord | bookmarklet | manual
discord_message_id: "1234..."
reading_time_min: 7
extraction_failed: false
tags: ['#video', '#agents']   # auto-populated by the tagger; manually editable
---

# How AI agents and Claude skills work together

<clean article body in markdown>
```

This format is portable, plays nicely with Obsidian Dataview, and gives you everything needed for the v1.5 features (ranking by `saved_at`, sunset by age, source-aware grouping).

---

## 7. Design system

Lifted directly from `zarazhangrui/tab-out`. Use these values exactly — don't improvise a different palette.

**Palette:**
| Token | Hex | Usage |
|---|---|---|
| `paper` | `#f8f5f0` | App background |
| `card` | `#fffdf9` | Card / panel background |
| `ink` | `#1a1613` | Primary text |
| `warm-gray` | `#e8e2da` | Borders, dividers |
| `muted` | `#9a918a` | Secondary text, metadata |
| `sage` | `#5a7a62` | Save action, positive |
| `rose` | `#b35a5a` | Archive/destructive |
| `amber` | `#c8713a` | Attention / CTA |
| `shadow` | `rgba(26,22,19,0.06)` | Card hover shadow |

Optional: an SVG noise overlay at opacity 0.03 fixed over the whole viewport for the "paper" feel.

**Typography:**
- Headers — **Newsreader**, italic, weight 300–400. Section titles like "Inbox" / "Saved for later" at 18px italic. Page title at 28px.
- Body / UI — **DM Sans**, weights 400–600. Body 13px, labels 10–12px (often uppercase with 0.5–1.5px letter-spacing), buttons 11–12px weight 500–600.
- Letter-tracking: `-0.5px` on serif headers.

**Spacing & radii:**
- Container padding: `48px 32px 80px`
- Section gap: `48px`
- Card gap: `12px`
- Border radius: `8px` cards, `6px` buttons, `4px` small chips
- Borders: `1px solid warm-gray`

**Motion:**
- Page load: staggered `fadeUp` (opacity 0→1, translateY 12px→0).
- Card hover: `translateY(-1px)` + shadow.
- Card removal on action: scale to 0.9 + fade over 0.25s.
- No sound, no confetti — it's a calm reading tool, not a tab game.

**Layout:**
- Desktop: two columns. Left ~70%: Inbox with a **Group by [domain ▾ | topic]** toggle chip in the section header; by default groups by domain. Each group is a card with a header showing count + "Archive all N" bulk action, then rows of items. In topic view, group titles are tag chips (`#agents`, `#research`) and items keep a small domain badge so you don't lose source context. Right ~30%: sticky sidebar with "Saved for later" on top, collapsible "Archive" below. Max container width 1300px.
- Tablet (<1000px): sidebar stacks below.
- No mobile design in v1 (Obsidian mobile handles reading; triage is desktop-only).

---

## 8. Keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `↓` | Next item |
| `k` / `↑` | Previous item |
| `s` | Save (move to Saved for later) |
| `e` | Archive |
| `x` | Trash (delete file) |
| `o` | Open original URL in new tab |
| `Enter` | Open in Obsidian via `obsidian://` deep link |
| `u` | Undo last action |
| `t` | Toggle grouping (domain ↔ topic) |
| `g i` / `g s` / `g a` | Jump to Inbox / Saved / Archive |
| `?` | Show shortcut help overlay |

---

## 9. What stays out of v1 (and where they'd live in v1.5+)

- **AI ranking + daily digest** → a nightly Node script that scores items with simple weights (recency, domain affinity from past saves, novelty) and writes a `Daily.md` note in the vault. Free, no LLM calls needed.
- **LLM auto-classification upgrade** → once the heuristic tagger's failure modes are visible, swap it for a Claude Haiku / GPT-4o-mini call per ingest with a fixed topic taxonomy. ~$1/month at your volume, much better tag quality, no change to the downstream UI. Keep the heuristic tagger as a pre-warm so items still get tags if the API call fails.
- **Embedding-based study paths** → generate local embeddings (`@xenova/transformers`, free) on ingest; nightly clustering produces emergent topic groups beyond the fixed taxonomy. Dataview query in Obsidian renders each cluster as a Map of Content.
- **Content sunset** → cron in the same Node process, weekly: items in Saved older than 30 days with no `read_at` get a `needs_review: true` flag; the dashboard surfaces a "Review old saves" pile.
- **Bookmarklet for one-click desktop save** (skip Discord) → 20-line JS bookmarklet that POSTs the current URL to a new `/api/ingest` endpoint on the local service. Half-hour build.
- **YouTube transcript / X post extraction** → swap in `youtube-transcript` and a simple X embed scraper inside the extractor for those domains.
- **Mobile triage** → expose the dashboard via Cloudflare Tunnel + add a single shared-secret query param. Cheap.
- **Claude → vault MCP** → small MCP server that lets you say "save this" in Claude and have it land in the vault directly.

---

## 10. Open questions

1. **Vault path.** Where will the Obsidian vault live on disk? The service needs an absolute path. Confirm it's a folder you sync (Obsidian Sync / iCloud / Syncthing), not a local-only folder.
2. **Discord server.** Will you create a new private server for this, or reuse an existing one with a dedicated `#ril` channel?
3. **Highlights & notes — v1 or v1.5?** Native Obsidian handles them with zero extra code; the question is whether the dashboard should *show* highlight counts per item. Cheap to add now, costs nothing to defer.
4. **Tag taxonomy.** The §5.1 rules are a starting baseline. Worth a 15-min review once you see your real Discord corpus — add domains you actually use, drop ones you don't.
5. **Open-source timing.** Public repo from day one (forces clean commits) or local-only until v1 is solid? My suggestion: public repo, make it private until you're ready. Costs nothing.

---

## 11. First step if you want to start

```bash
mkdir ril && cd ril
npm init -y
npm i discord.js @mozilla/readability jsdom turndown gray-matter hono dotenv
mkdir -p packages/service/src
echo "DISCORD_TOKEN=" > .env
echo "VAULT_PATH=" >> .env
echo "RIL_CHANNEL_ID=" >> .env
```

Then point Cursor at this spec and have it write `packages/service/src/bot.ts` with the message-listener + extractor + vault-writer. The whole Day 1 deliverable is roughly one focused chat session.
