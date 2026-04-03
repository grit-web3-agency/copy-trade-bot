import 'dotenv/config';
import { getDb, getAllWatchedAddresses } from './db';
import { createBot } from './bot';
import { WhaleListener } from './whale-listener';
import { processWhaleTrade } from './copy-policy';

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('BOT_TOKEN not set in environment');
    process.exit(1);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const wsUrl = process.env.SOLANA_WS_URL;

  // Initialize database
  const db = getDb();

  // Create Telegram bot
  const bot = createBot(botToken, db, rpcUrl);

  // Create whale listener
  const listener = new WhaleListener();

  // Load existing watched addresses
  const addresses = getAllWatchedAddresses(db);
  addresses.forEach(addr => listener.addAddress(addr));

  // Wire up: when whale trades, process copy policy
  listener.on('trade', async (trade) => {
    console.log(`[Main] Whale trade detected: ${trade.direction} ${trade.amountSol} SOL → ${trade.tokenMint}`);
    await processWhaleTrade(db, trade, (telegramId, message) => {
      bot.api.sendMessage(telegramId, message).catch(err => {
        console.error(`[Main] Failed to notify user ${telegramId}:`, err.message);
      });
    });
  });

  // Start services
  await listener.start(wsUrl);
  console.log('[Main] Whale listener started');

  bot.start({
    onStart: () => console.log('[Main] Telegram bot started'),
  });
}

main().catch(err => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
