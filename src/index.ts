import { startBot } from './bot.js';
import { startApi } from './api.js';

startApi(3000);

startBot().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
