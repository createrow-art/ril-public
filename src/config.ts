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
  vaultPath: required('VAULT_PATH'),
};
