import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { listItems, moveItem, saveItem, findDuplicate, updateItemNote, type VaultItem, type SaveItem } from './vault.js';
import { extract, getDomain } from './extractor.js';
import { autoTag } from './tagger.js';

const app = new Hono();

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    if (origin.startsWith('chrome-extension://')) return origin;
    if (origin === 'http://localhost:3000') return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/items', async (c) => {
  const folder = (c.req.query('folder') ?? 'Inbox') as 'Inbox' | 'Saved' | 'Archive';
  const groupBy = c.req.query('groupBy') ?? 'domain';

  const items = await listItems(config.vaultPath, folder);

  // Build groups
  const groupMap = new Map<string, VaultItem[]>();

  for (const item of items) {
    const keys: string[] =
      groupBy === 'tag'
        ? item.tags.length ? item.tags : ['untagged']
        : [item.domain || item.site || 'unknown'];

    for (const key of keys) {
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(item);
    }
  }

  let groups = Array.from(groupMap.entries()).map(([key, groupItems]) => ({
    key,
    label: key,
    count: groupItems.length,
    items: groupItems,
  }));

  // Sort by count desc; for tag view push 'untagged' to the bottom
  groups.sort((a, b) => b.count - a.count);
  if (groupBy === 'tag') {
    const idx = groups.findIndex((g) => g.key === 'untagged');
    if (idx > 0) groups.push(groups.splice(idx, 1)[0]);
  }

  return c.json({ groups, total: items.length, folder, groupBy });
});

app.get('/api/counts', async (c) => {
  const [inbox, saved, archive] = await Promise.all([
    listItems(config.vaultPath, 'Inbox'),
    listItems(config.vaultPath, 'Saved'),
    listItems(config.vaultPath, 'Archive'),
  ]);
  return c.json({
    inbox: inbox.length,
    saved: saved.length,
    archive: archive.length,
  });
});

app.post('/api/items', async (c) => {
  const { url, note } = await c.req.json<{ url: string; note?: string }>();
  if (!url) return c.json({ error: 'url is required' }, 400);

  const existing = await findDuplicate(config.vaultPath, url);
  if (existing) return c.json({ ok: true, duplicate: true });

  const extracted = await extract(url);
  const domain = getDomain(extracted.canonicalUrl);
  const tags = autoTag({
    domain,
    title: extracted.title,
    url: extracted.canonicalUrl,
    content: extracted.contentText,
    note: note ?? '',
  });

  const item: SaveItem = {
    url,
    canonicalUrl: extracted.canonicalUrl,
    title: extracted.title,
    author: extracted.author,
    site: domain,
    domain,
    publishedAt: extracted.publishedAt,
    savedAt: new Date().toISOString(),
    readingTimeMin: extracted.readingTimeMin,
    extractionFailed: extracted.extractionFailed,
    tags,
    note: note ?? null,
    source: 'web',
    discordMessageId: '',
    contentMarkdown: extracted.contentMarkdown,
  };

  await saveItem(config.vaultPath, item);

  return c.json({ ok: true });
});

app.post('/api/items/:id/action', async (c) => {
  const id = c.req.param('id');
  const { action } = await c.req.json<{ action: 'save' | 'archive' | 'trash' | 'inbox' }>();
  await moveItem(config.vaultPath, id, action);
  return c.json({ ok: true });
});

app.patch('/api/items/:id', async (c) => {
  const id = c.req.param('id');
  const { note } = await c.req.json<{ note: string }>();
  await updateItemNote(config.vaultPath, id, note ?? '');
  return c.json({ ok: true });
});

// Serve the extension UI as a local web app
app.get('/*', serveStatic({ root: 'extension', index: 'newtab.html' }));

export function startApi(port = 3000): void {
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
    console.log(`✓ API server at http://localhost:${info.port}`);
  });
}
