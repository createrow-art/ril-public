# RIL — Read It Later

A personal read-it-later system that lives on your machine. Save links from anywhere via a Chrome extension (new tab page + popup + right-click menu). Articles are saved as Markdown files in a local folder and powered by Claude AI for auto-tagging and Smart Mode relevance scoring.

No cloud, no subscription, no account. Just a Chrome extension + a local server.

## What you get

- **New tab page** — your reading list, grouped by domain, tag, time, or AI relevance
- **Extension popup** — click the toolbar icon to save the current tab in one click
- **Right-click menu** — save any link without leaving the page
- **Auto-tagging** — Claude reads the article and picks relevant tags automatically
- **Smart Mode** — Claude builds an interest profile from your saves and ranks new articles by how relevant they are to you

## Requirements

- macOS or Windows with Node.js 20+ installed
- Chrome browser
- An Anthropic API key (for tagging + Smart Mode — optional but recommended)

## Setup

### 1. Clone and install

```bash
git clone <this-repo-url> RIL
cd RIL
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in:

- `VAULT_PATH` — a folder where your articles will be saved (e.g. `/Users/yourname/Documents/RIL`). It will be created automatically on first run.
- `ANTHROPIC_API_KEY` — your Anthropic API key from [console.anthropic.com](https://console.anthropic.com). Optional — the app works without it but tagging and Smart Mode will be off.

  > **Already using Claude Code?** If you set it up with an API key, run `echo $ANTHROPIC_API_KEY` in your terminal. If it prints a key, you're done — RIL picks it up automatically and you can skip this line in `.env`.

### 3. Start the server

```bash
npm start
```

You should see:
```
✓ API server at http://localhost:3000
```

To keep it running in the background across reboots:

```bash
npm install -g pm2
pm2 start npm --name ril -- start
pm2 save && pm2 startup   # follow the printed instructions
```

### 4. Install the Chrome extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** → select the `extension/` folder inside this repo
4. Open a new tab — you should see your RIL dashboard

## Using RIL

**Save a link:**
- Paste a URL into the bar at the top of the new tab page and press Enter
- Click the RIL icon in the Chrome toolbar to save the current tab
- Right-click any link → "Save page to RIL"

**Triage your inbox:**
- `j` / `k` — move up/down
- `e` — archive (done reading)
- `s` — save for later
- `o` — open the original URL
- `a` — focus the URL input to save a new link
- `t` — cycle between group-by views (domain / tag / time / Smart)
- `?` — show keyboard shortcuts

**Smart Mode:**
- Click ⚙ → toggle "Smart Mode" on
- Claude analyzes your recent saves and builds an interest profile
- New articles are scored 0–10 for relevance to your interests
- Click "Smart ✦" in the header to sort by relevance tier

## Folder layout

Articles are saved as Markdown files with frontmatter:

```
VAULT_PATH/
├── Inbox/     # new saves land here
├── Saved/     # items you want to read later
└── Archive/   # done, kept for reference
```

You can open these files in any text editor, Obsidian, or any Markdown app.

## Updating

```bash
git pull
npm install
pm2 restart ril
```

Then reload the extension in Chrome (`chrome://extensions` → refresh icon).

## License

MIT

---

Built by [Shan](https://x.com/paladinworld)
