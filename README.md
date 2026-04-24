# RIL — Read It Later

A personal read-it-later system that lives entirely on your machine. Save links from anywhere via a Chrome extension — new tab page, toolbar popup, or right-click menu. Articles are saved as Markdown files in a local folder.

No cloud. No subscription. No account. No AI API required.

## What you get

- **New tab page** — your reading list, grouped by domain, tag, or time
- **Extension popup** — click the toolbar icon to save the current tab in one click
- **Right-click menu** — save any link without leaving the page
- **Auto-tagging** — domain and keyword rules assign tags automatically (YouTube → `#video`, GitHub → `#code`, etc.)
- **Inline notes** — add a note to any saved item directly from the new tab page
- **Keyboard-first triage** — `j`/`k` to navigate, `e` to archive, `s` to save for later

## Requirements

- macOS or Windows with Node.js 20+ installed
- Chrome browser

That's it — no API keys needed.

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

Open `.env` and set `VAULT_PATH` — the folder where your articles will be saved (e.g. `/Users/yourname/Documents/RIL`). It will be created automatically on first run.

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
- `t` — cycle between group-by views (domain / tag / time)
- `?` — show keyboard shortcuts

## Customising auto-tags

Tags are assigned automatically using two JSON config files — no code required:

- **`config/domain-tags.json`** — maps domains to tags. Add any site you read regularly.
- **`config/keyword-tags.json`** — regex patterns matched against the article title and URL.

Both files are plain JSON. Open them in any text editor to add your own rules.

> **Tip — AI-assisted tagging:** You can ask any AI assistant (Claude, ChatGPT, etc.) to help batch-tag your existing articles. Your saves are plain Markdown files with YAML frontmatter in `VAULT_PATH/Inbox/`. Point your AI at those files and ask it to fill in the `tags:` field, or to suggest new keyword rules to add to `keyword-tags.json`.

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
