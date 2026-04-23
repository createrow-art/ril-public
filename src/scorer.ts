import { config } from './config.js';
import type { VaultItem } from './vault.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILE_PATH = path.resolve(__dirname, '..', 'config', 'interest-profile.json');

export type InterestProfile = {
  topics: string[];
  summary: string;
  generatedAt: string;
};

async function llm(prompt: string, maxTokens = 300): Promise<string> {
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
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`LLM API ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return (data?.content?.[0]?.text ?? '').trim();
}

export async function getProfile(): Promise<InterestProfile | null> {
  try {
    const raw = await fs.readFile(PROFILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const SEED_PROFILE: InterestProfile = {
  topics: ['AI tools', 'startups', 'product design', 'engineering', 'crypto'],
  summary: 'Default starter interests — will update as you save more articles.',
  generatedAt: new Date(0).toISOString(),
};

export async function buildProfile(items: VaultItem[]): Promise<InterestProfile> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = items
    .filter((i) => i.savedAt && new Date(i.savedAt).getTime() > cutoff)
    .slice(0, 80);

  // If no recent items, use all items (older saves are still useful signal)
  const pool = recent.length >= 5 ? recent : items.slice(0, 80);

  if (pool.length === 0) {
    const seed = { ...SEED_PROFILE, generatedAt: new Date().toISOString() };
    await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true });
    await fs.writeFile(PROFILE_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }

  const list = pool
    .map((i) => `- ${i.title}${i.tags.length ? ` [${i.tags.join(', ')}]` : ''}`)
    .join('\n');

  const prompt = `Analyze these recently saved articles and identify the reader's key interests.

${list}

Return JSON only, no other text:
{"topics":["topic1","topic2",...],"summary":"one sentence describing their current focus"}

Rules: 3-7 specific topics ordered by frequency. Topics should be concrete (e.g. "AI agents" not "technology").`;

  try {
    const raw = await llm(prompt, 250);
    const json = raw.match(/\{[\s\S]*?\}/)?.[0];
    if (!json) throw new Error('no JSON in response');
    const parsed = JSON.parse(json) as { topics?: unknown; summary?: unknown };
    const profile: InterestProfile = {
      topics: Array.isArray(parsed.topics) ? (parsed.topics as string[]).slice(0, 7) : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      generatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true });
    await fs.writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf-8');
    return profile;
  } catch (err) {
    console.warn('(profiler error:', (err as Error).message, ')');
    return {
      topics: [],
      summary: 'Could not build profile — check your ANTHROPIC_API_KEY.',
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function scoreItem(item: VaultItem, profile: InterestProfile): Promise<number> {
  if (!config.anthropicApiKey || profile.topics.length === 0) return 0;

  const desc = [item.title, item.tags.join(', ')]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 400);

  const prompt = `Topics this reader cares about: ${profile.topics.join(', ')}

Article: "${desc}"

Rate how relevant this article is to their interests on a scale of 0-10.
10 = directly on their core topics, 0 = completely unrelated.
Reply with a single integer only.`;

  try {
    const raw = await llm(prompt, 5);
    const n = parseInt(raw.match(/\d+/)?.[0] ?? '5');
    return Math.min(10, Math.max(0, n));
  } catch {
    return 0;
  }
}
