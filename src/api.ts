import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { listItems, moveItem, saveItem, findDuplicate, updateItemScore, type VaultItem, type SaveItem } from './vault.js';
import { extract, getDomain } from './extractor.js';
import { autoTag } from './tagger.js';
import { getSettings, saveSettings } from './settings.js';
import { getProfile, buildProfile, scoreItem } from './scorer.js';

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
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
    relevanceScore: null,
  };

  const filePath = await saveItem(config.vaultPath, item);

  // Async background scoring — don't block the response
  (async () => {
    try {
      const settings = await getSettings();
      if (!settings.smartMode || !config.anthropicApiKey) return;
      const profile = await getProfile();
      if (!profile || profile.topics.length === 0) return;
      // Build a minimal VaultItem for scoring
      const vaultItem: VaultItem = {
        id: filePath.split('/').pop()?.replace(/\.md$/, '') ?? '',
        folder: 'Inbox',
        url,
        title: extracted.title,
        site: domain,
        domain,
        savedAt: item.savedAt,
        status: 'inbox',
        tags,
        note: note ?? null,
        readingTimeMin: extracted.readingTimeMin,
        extractionFailed: extracted.extractionFailed,
        author: extracted.author,
        publishedAt: extracted.publishedAt,
        relevanceScore: null,
      };
      const score = await scoreItem(vaultItem, profile);
      await updateItemScore(config.vaultPath, vaultItem.id, score);
    } catch (err) {
      console.warn('(background scoring error:', (err as Error).message, ')');
    }
  })();

  return c.json({ ok: true });
});

app.post('/api/items/:id/action', async (c) => {
  const id = c.req.param('id');
  const { action } = await c.req.json<{ action: 'save' | 'archive' | 'trash' | 'inbox' }>();
  await moveItem(config.vaultPath, id, action);
  return c.json({ ok: true });
});

// Settings
app.get('/api/settings', async (c) => {
  const settings = await getSettings();
  return c.json(settings);
});

app.post('/api/settings', async (c) => {
  const body = await c.req.json<{ smartMode?: boolean }>();
  const current = await getSettings();
  const updated = { ...current, ...body };
  await saveSettings(updated);
  return c.json(updated);
});

// Interest profile
app.get('/api/profile', async (c) => {
  const profile = await getProfile();
  return c.json(profile ?? { topics: [], summary: null, generatedAt: null });
});

app.post('/api/profile/refresh', async (c) => {
  const items = await listItems(config.vaultPath);
  const profile = await buildProfile(items);

  // Background: score any unscored items against the fresh profile
  if (profile.topics.length > 0) {
    const unscored = items.filter((i) => i.relevanceScore === null || i.relevanceScore === undefined);
    if (unscored.length > 0) {
      (async () => {
        for (const item of unscored.slice(0, 100)) {
          try {
            const score = await scoreItem(item, profile);
            await updateItemScore(config.vaultPath, item.id, score);
          } catch {}
        }
        console.log(`(scored ${Math.min(unscored.length, 100)} unscored items)`);
      })();
    }
  }

  return c.json({ ...profile, unscoredCount: items.filter((i) => i.relevanceScore === null || i.relevanceScore === undefined).length });
});

// Serve the extension UI as a local web app
app.get('/*', serveStatic({ root: 'extension', index: 'newtab.html' }));

export function startApi(port = 3000): void {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`✓ API server at http://localhost:${info.port}`);
  });
}
