import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import { config } from './config.js';
import { extractUrls, extract, getDomain } from './extractor.js';
import { saveItem, findDuplicate, type SaveItem } from './vault.js';
import { autoTag, llmTag } from './tagger.js';

export async function startBot(): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✓ Logged in as ${c.user.tag}`);
    console.log(`  Watching channel: ${config.discordChannelId}`);
    console.log(`  Vault path:       ${config.vaultPath}`);
    console.log(`  Ready. Paste a URL into #ril.\n`);
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    if (msg.channelId !== config.discordChannelId) return;

    const urls = extractUrls(msg.content);
    if (urls.length === 0) return;

    // Extract note: everything in the message that isn't a URL
    const urlPattern = /https?:\/\/[^\s]+/g;
    const note = msg.content.replace(urlPattern, '').trim() || null;

    console.log(`\n→ ${urls.length} URL(s) from @${msg.author.username}${note ? ` | note: "${note}"` : ''}`);

    let hadError = false;
    let anyFailed = false;
    let anyDuplicate = false;

    for (const url of urls) {
      try {
        const existing = await findDuplicate(config.vaultPath, url);
        if (existing) {
          console.log(`  ~ duplicate (already in vault): ${url}`);
          anyDuplicate = true;
          continue;
        }

        const extracted = await extract(url);
        const domain = getDomain(extracted.canonicalUrl);
        const heuristicTags = autoTag({
          domain,
          title: extracted.title,
          url: extracted.canonicalUrl,
          content: extracted.contentText,
          note: note ?? '',
        });

        const llmTags = await llmTag({
          title: extracted.title,
          url: extracted.canonicalUrl,
          note: note ?? '',
          content: extracted.contentText,
          existingTags: heuristicTags,
        });

        // Merge: heuristic tags first, then any LLM tags not already present
        const tags = [...new Set([...heuristicTags, ...llmTags])];

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
          note,
          source: 'discord',
          discordMessageId: msg.id,
          contentMarkdown: extracted.contentMarkdown,
        };

        const savedPath = await saveItem(config.vaultPath, item);
        const tagStr = tags.length ? tags.join(' ') : '(no tags)';
        const status = extracted.extractionFailed ? '⚠  url-only' : '✓  saved ';
        console.log(`  ${status}: "${item.title}" ${tagStr}`);
        console.log(`             → ${savedPath}`);

        if (extracted.extractionFailed) anyFailed = true;
      } catch (err) {
        console.error(`  ✗ error processing ${url}:`, (err as Error).message);
        hadError = true;
      }
    }

    // React once per message summarising overall result.
    try {
      if (hadError) {
        await msg.react('❌');
      } else if (anyFailed) {
        await msg.react('⚠️');
      } else if (anyDuplicate && urls.length === 1) {
        await msg.react('🔁');
      } else {
        await msg.react('👍');
      }
    } catch (err) {
      console.warn('  (could not react to message — check bot permissions)');
    }
  });

  client.on(Events.Error, (err) => {
    console.error('Discord client error:', err);
  });

  await client.login(config.discordToken);
}
