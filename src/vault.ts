import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOLDERS = ['Inbox', 'Saved', 'Archive'] as const;
type Folder = typeof FOLDERS[number];

export type VaultItem = {
  id: string;
  folder: Folder;
  url: string;
  title: string;
  site: string;
  domain: string;
  savedAt: string;
  status: string;
  tags: string[];
  note: string | null;
  readingTimeMin: number | null;
  extractionFailed: boolean;
  author: string | null;
  publishedAt: string | null;
};

export async function listItems(
  vaultPath: string,
  folder?: Folder
): Promise<VaultItem[]> {
  const foldersToScan = folder ? [folder] : [...FOLDERS];
  const items: VaultItem[] = [];

  for (const f of foldersToScan) {
    const dir = path.join(vaultPath, f);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(dir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(content);
        // Support Obsidian Web Clipper frontmatter (source, clipped) as fallbacks
        const resolvedUrl = data.url || data.canonical_url || data.source || '';
        let derivedDomain = data.domain || data.site || '';
        if (!derivedDomain && resolvedUrl) {
          try { derivedDomain = new URL(resolvedUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
        }
        items.push({
          id: file.replace(/\.md$/, ''),
          folder: f,
          url: resolvedUrl,
          title: data.title || file,
          site: derivedDomain,
          domain: derivedDomain,
          savedAt: data.saved_at || data.clipped || data.created || data.published_at || data.date || '',
          status: data.status || 'inbox',
          tags: Array.isArray(data.tags) ? data.tags : [],
          note: data.note || null,
          readingTimeMin: data.reading_time_min || null,
          extractionFailed: data.extraction_failed || false,
          author: data.author || null,
          publishedAt: data.published_at || null,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return items;
}

export async function moveItem(
  vaultPath: string,
  id: string,
  action: 'save' | 'archive' | 'trash' | 'inbox'
): Promise<void> {
  for (const folder of FOLDERS) {
    const filePath = path.join(vaultPath, folder, `${id}.md`);
    try {
      await fs.access(filePath);
      // Found the file
      if (action === 'trash') {
        await fs.unlink(filePath);
        return;
      }

      const destFolder: Folder =
        action === 'save' ? 'Saved' :
        action === 'archive' ? 'Archive' :
        'Inbox';

      const newStatus =
        action === 'save' ? 'saved' :
        action === 'archive' ? 'archived' :
        'inbox';

      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(content);
      parsed.data.status = newStatus;
      const newContent = matter.stringify(parsed.content, parsed.data);

      const destPath = path.join(vaultPath, destFolder, `${id}.md`);
      await fs.writeFile(destPath, newContent, 'utf-8');
      if (destPath !== filePath) await fs.unlink(filePath);
      return;
    } catch {
      continue;
    }
  }
  throw new Error(`Item not found: ${id}`);
}

export type SaveItem = {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  site: string;
  domain: string;
  publishedAt: string | null;
  savedAt: string;
  readingTimeMin: number | null;
  extractionFailed: boolean;
  tags: string[];
  note: string | null;
  source: string;
  discordMessageId: string;
  contentMarkdown: string;
};

export async function ensureFolders(vaultPath: string): Promise<void> {
  for (const folder of FOLDERS) {
    await fs.mkdir(path.join(vaultPath, folder), { recursive: true });
  }
}

/**
 * On a brand-new vault (empty Inbox), copy seed articles from seed/Inbox/
 * so first-time users have something to read immediately.
 */
export async function seedVault(vaultPath: string): Promise<void> {
  const inboxPath = path.join(vaultPath, 'Inbox');
  try {
    const existing = await fs.readdir(inboxPath);
    if (existing.some((f) => f.endsWith('.md'))) return; // not empty, skip
  } catch {
    return; // folder doesn't exist yet — ensureFolders will create it
  }

  const seedDir = path.resolve(__dirname, '..', 'seed', 'Inbox');
  let seeds: string[];
  try {
    seeds = await fs.readdir(seedDir);
  } catch {
    return; // no seed directory
  }

  for (const file of seeds) {
    if (!file.endsWith('.md')) continue;
    await fs.copyFile(path.join(seedDir, file), path.join(inboxPath, file));
  }
}

/** Returns the path of an existing file with the same URL, or null. */
export async function findDuplicate(
  vaultPath: string,
  url: string
): Promise<string | null> {
  for (const folder of FOLDERS) {
    const dir = path.join(vaultPath, folder);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(dir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = matter(content);
        const existingUrl = parsed.data.url || parsed.data.canonical_url;
        if (existingUrl === url) return filePath;
      } catch {
        // skip unreadable files
      }
    }
  }
  return null;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'untitled'
  );
}

function filename(item: SaveItem): string {
  const date = item.savedAt.slice(0, 10); // YYYY-MM-DD
  const slug = slugify(item.title);
  const hash = crypto
    .createHash('md5')
    .update(item.canonicalUrl)
    .digest('hex')
    .slice(0, 6);
  return `${date}-${slug}-${hash}.md`;
}

export async function updateItemNote(vaultPath: string, id: string, note: string): Promise<void> {
  for (const folder of FOLDERS) {
    const dir = path.join(vaultPath, folder);
    let files: string[];
    try { files = await fs.readdir(dir); } catch { continue; }
    const match = files.find((f) => f.startsWith(id) || f.replace(/\.md$/, '') === id);
    if (!match) continue;
    const filePath = path.join(dir, match);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(content);
      parsed.data.note = note || null;
      await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
      return;
    } catch { continue; }
  }
}


export async function saveItem(
  vaultPath: string,
  item: SaveItem
): Promise<string> {
  await ensureFolders(vaultPath);

  const frontmatter = {
    url: item.url,
    canonical_url: item.canonicalUrl,
    title: item.title,
    author: item.author,
    site: item.domain,
    domain: item.domain,
    published_at: item.publishedAt,
    saved_at: item.savedAt,
    read_at: null,
    status: 'inbox',
    source: item.source,
    discord_message_id: item.discordMessageId,
    reading_time_min: item.readingTimeMin,
    extraction_failed: item.extractionFailed,
    tags: item.tags,
    note: item.note || null,
  };

  const body = item.extractionFailed
    ? `# ${item.title}\n\n*Couldn't extract article content from this URL — saved as reference only.*\n\n[Open original](${item.url})\n`
    : `# ${item.title}\n\n${item.contentMarkdown}\n`;

  const fileContent = matter.stringify(body, frontmatter);
  const fileName = filename(item);
  const filePath = path.join(vaultPath, 'Inbox', fileName);

  await fs.writeFile(filePath, fileContent, 'utf-8');
  return filePath;
}
