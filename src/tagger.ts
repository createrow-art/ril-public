import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// config/ lives at the project root (one level up from src/)
const configDir = path.resolve(__dirname, '..', 'config');

type KeywordRule = { pattern: string; tag: string };

const domainTags: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(configDir, 'domain-tags.json'), 'utf-8')
);
const keywordRules: KeywordRule[] = JSON.parse(
  fs.readFileSync(path.join(configDir, 'keyword-tags.json'), 'utf-8')
);

/**
 * Heuristic auto-tagger. Two additive layers:
 *   A) domain priors — map domain (or parent domain) to coarse tags
 *   B) title/URL/content keyword regex → topical tags
 * See RIL-spec.md §5.1 for rationale.
 */
export function autoTag(args: {
  domain: string;
  title: string;
  url: string;
  content: string;
  note?: string;
}): string[] {
  const { domain, title, url, content, note = '' } = args;
  const tags = new Set<string>();

  // Layer A: domain priors
  for (const [pattern, tagList] of Object.entries(domainTags)) {
    if (domain === pattern || domain.endsWith('.' + pattern)) {
      tagList.forEach((t) => tags.add(t));
    }
  }

  // Layer B: keyword rules against title + URL + first 200 words
  const snippet = [
    title,
    url,
    note,
    content.split(/\s+/).slice(0, 200).join(' '),
  ]
    .join(' ')
    .toLowerCase();

  for (const { pattern, tag } of keywordRules) {
    try {
      const re = new RegExp(pattern, 'i');
      if (re.test(snippet)) tags.add(tag);
    } catch (err) {
      console.warn(`  (skipping bad regex rule "${pattern}")`);
    }
  }

  return Array.from(tags).map((t) => t.replace(/^#/, '')).sort();
}
