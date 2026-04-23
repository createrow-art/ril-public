import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export type Extracted = {
  title: string;
  author: string | null;
  contentMarkdown: string;
  contentText: string;
  publishedAt: string | null;
  readingTimeMin: number | null;
  canonicalUrl: string;
  extractionFailed: boolean;
};

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

/** Strip trailing punctuation Discord users often leave. */
function cleanUrl(u: string): string {
  return u.replace(/[.,;:!?)\]]+$/, '');
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches.map(cleanUrl)));
}

export function getDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isXUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'x.com' || host === 'twitter.com';
  } catch {
    return false;
  }
}

async function extractViaJina(url: string): Promise<Extracted> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
  });
  const text = await res.text();

  if (!text || text.trim().length < 20) {
    return { title: url, author: null, contentMarkdown: '', contentText: '', publishedAt: null, readingTimeMin: null, canonicalUrl: url, extractionFailed: true };
  }

  // Jina returns markdown — first # line is the title
  const lines = text.trim().split('\n');
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : url;
  const contentMarkdown = lines.filter((l) => !l.startsWith('# ')).join('\n').trim();
  const contentText = contentMarkdown.replace(/[#*`[\]]/g, '');
  const wordCount = contentText.trim().split(/\s+/).filter(Boolean).length;

  // Try to extract author from URL (x.com/{handle}/status/...)
  let author: string | null = null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 1) author = `@${parts[0]}`;
  } catch {}

  return {
    title,
    author,
    contentMarkdown,
    contentText,
    publishedAt: null,
    readingTimeMin: wordCount > 50 ? Math.max(1, Math.round(wordCount / 220)) : null,
    canonicalUrl: url,
    extractionFailed: false,
  };
}

export async function extract(url: string): Promise<Extracted> {
  // X/Twitter posts: use Jina reader for clean extraction
  if (isXUrl(url)) {
    try {
      return await extractViaJina(url);
    } catch (err) {
      console.error(`  ✗ Jina extraction error for ${url}:`, (err as Error).message);
      // fall through to standard extraction
    }
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const html = await res.text();
    const finalUrl = res.url || url;

    const dom = new JSDOM(html, { url: finalUrl });
    const doc = dom.window.document;

    const article = new Readability(doc).parse();

    if (!article || !article.content) {
      return {
        title: doc.title || url,
        author: null,
        contentMarkdown: '',
        contentText: '',
        publishedAt: null,
        readingTimeMin: null,
        canonicalUrl: finalUrl,
        extractionFailed: true,
      };
    }

    const contentMarkdown = turndown.turndown(article.content);
    const contentText = article.textContent || '';
    const wordCount = contentText.trim().split(/\s+/).filter(Boolean).length;
    const readingTimeMin = wordCount > 0 ? Math.max(1, Math.round(wordCount / 220)) : null;

    return {
      title: (article.title || doc.title || url).trim(),
      author: article.byline ? article.byline.trim() : null,
      contentMarkdown,
      contentText,
      publishedAt: (article as unknown as { publishedTime?: string }).publishedTime ?? null,
      readingTimeMin,
      canonicalUrl: finalUrl,
      extractionFailed: false,
    };
  } catch (err) {
    console.error(`  ✗ extraction error for ${url}:`, (err as Error).message);
    return {
      title: url,
      author: null,
      contentMarkdown: '',
      contentText: '',
      publishedAt: null,
      readingTimeMin: null,
      canonicalUrl: url,
      extractionFailed: true,
    };
  }
}
