# RIL — Discord → Obsidian Read-It-Later

A personal read-it-later system. Paste a URL into a private Discord channel from your phone or laptop; a local Node service extracts the article, writes a clean Markdown file with frontmatter into an Obsidian vault, and reacts on Discord to confirm. You read in Obsidian on any device.

Day 1 scope is the ingest pipeline in this repo. The triage dashboard (Day 2) will read and update items in the vault via a small local HTTP API.

## Prerequisites

- **Node 20+** (for native `fetch`). Check with `node --version`.
- **An Obsidian vault** you already sync to your phone (via Obsidian Sync, iCloud, or Syncthing).
- **A Discord bot** in a private server (see setup below).

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env`

```bash
cp .env.example .env
```

Then open `.env` in your editor (Cursor, VS Code, or `nano .env`) and fill in `DISCORD_TOKEN` with the token you get from the Discord Developer Portal. The other three values are prefilled.

### 3. Create the Discord bot (one-time)

1. Go to <https://discord.com/developers/applications> → New Application → name it "RIL".
2. **Bot** tab → Reset Token → copy the new token into `.env` (it's only shown once).
3. Still on the Bot tab, enable **"Message Content Intent"** and **"Server Members Intent"**. Save.
4. **OAuth2 → URL Generator** → scopes: `bot`. Permissions: `View Channels`, `Read Message History`, `Add Reactions`.
5. Copy the generated URL, open it in your browser, and invite the bot to your private server.
6. In Discord (with Developer Mode enabled in Settings → Advanced), right-click the server → Copy Server ID, and right-click the `#ril` channel → Copy Channel ID. Paste these into `.env` if they're not already filled.

### 4. Run

```bash
npm run dev
```

You should see:

```
✓ Logged in as <YourBotName>
  Watching channel: 1495339706974470186
  Vault path:       /Users/shanzhong/Documents/Obsidian/RIL
  Ready. Paste a URL into #ril.
```

Paste any URL into the `#ril` channel. Within a few seconds:

- A file appears in `VAULT_PATH/Inbox/` with frontmatter + clean Markdown.
- The bot reacts on Discord:
  - 👍 saved with full extraction
  - ⚠️  saved as URL-only stub (paywall / JS-heavy / X post etc.)
  - 🔁 duplicate — already in your vault
  - ❌ unexpected error — check terminal logs

## Vault layout

```
VAULT_PATH/
├── Inbox/     # new arrivals from Discord
├── Saved/     # items triaged as "will read"  (Day 2 will populate)
└── Archive/   # processed, kept for reference (Day 2 will populate)
```

The three folders are created automatically on first run.

## Auto-tagger

Every ingested item gets `tags: [...]` populated from two rule layers (see `RIL-spec.md` §5.1):

- `config/domain-tags.json` — coarse tags based on the source domain (e.g. `arxiv.org` → `#research`).
- `config/keyword-tags.json` — topical tags from regex patterns over title + URL + first 200 words (e.g. `\bagent\b` → `#agents`).

Both files are editable JSON — tune them freely as your corpus emerges.

## Development

```bash
npm run dev     # tsx watch — auto-restarts on file changes
npm start       # one-shot run without watch
```

For production-style run (auto-restart on crash, survives reboot), wrap with `pm2`:

```bash
npm install -g pm2
pm2 start --name ril --interpreter tsx src/index.ts
pm2 save
pm2 startup   # follow printed instructions
```

## Troubleshooting

**"Missing required env var: DISCORD_TOKEN"** — you haven't filled `.env` yet.

**Bot logs in but doesn't react to messages** — you forgot to enable "Message Content Intent" in the Bot tab of the Developer Portal. Enable it and restart.

**Bot sees the message but can't react** — invite permissions didn't include "Add Reactions". Re-invite with the correct OAuth URL or adjust channel/role permissions.

**Articles extract as garbled HTML** — Readability failed for that site. Expected behavior for paywalls, heavy-JS pages, YouTube, X, etc. The stub still captures URL + title, which is enough for triage.

**File not appearing in Obsidian** — `VAULT_PATH` points somewhere your vault isn't actually syncing. Confirm by `ls $VAULT_PATH/.obsidian` — if `.obsidian` exists, it's the right vault root.

## License

MIT
