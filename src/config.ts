import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing required env var: ${name}`);
    console.error(`  Check your .env file (see .env.example).`);
    process.exit(1);
  }
  return v;
}

export const config = {
  discordToken: required('DISCORD_TOKEN'),
  discordGuildId: required('DISCORD_GUILD_ID'),
  discordChannelId: required('DISCORD_CHANNEL_ID'),
  vaultPath: required('VAULT_PATH'),
  moonshotApiKey: process.env.MOONSHOT_API_KEY ?? '',
  moonshotBaseUrl: process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1',
};
