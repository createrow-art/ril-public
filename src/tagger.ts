import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

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

// Fixed taxonomy — edit this list to grow/shrink your tag space.
// The LLM maps content to these labels; it won't invent new ones.
const TAXONOMY = [
  'ai', 'agents', 'llm', 'tools', 'image-gen', 'ml', 'research',
  'growth', 'product', 'startup', 'marketing', 'gtm',
  'finance', 'trading', 'crypto',
  'design', 'ux',
  'health', 'career',
  'video', 'podcast', 'essay',
  'code', 'devtools',
  'openai', 'anthropic',
  'news', 'politics', 'geopolitics', 'science', 'business',
];

/**
 * LLM-based tagger using Claude Haiku.
 * Falls back silently if the API call fails or key is not set.
 */
export async function llmTag(args: {
  title: string;
  url: string;
  note: string;
  content: string;
  existingTags: string[];
}): Promise<string[]> {
  if (!config.anthropicApiKey) return [];

  const { title, url, note, content, existingTags } = args;

  // Only run if heuristics didn't already produce tags
  if (existingTags.length >= 2) return [];

  const snippet = [
    title,
    note,
    content.split(/\s+/).slice(0, 150).join(' '),
  ].filter(Boolean).join(' ').slice(0, 800);

  const prompt = [
    `Pick 1–3 tags from this list that best describe the content. Return ONLY the matching tag names, comma-separated, no explanation.`,
    `Tags: ${TAXONOMY.join(', ')}`,
    `Content: ${snippet}`,
    `URL: ${url}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 30,
      }),
    });

    if (!res.ok) {
      console.warn(`  (llm-tagger: API error ${res.status})`);
      return [];
    }

    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const raw = data?.content?.[0]?.text ?? '';

    const parsed = raw
      .split(/[,\n]+/)
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter((t) => TAXONOMY.includes(t));

    return [...new Set(parsed)];
  } catch (err) {
    console.warn(`  (llm-tagger: ${(err as Error).message})`);
    return [];
  }
}
