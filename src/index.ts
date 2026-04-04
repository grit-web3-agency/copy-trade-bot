import 'dotenv/config';
import { getDb, getAllWatchedAddresses } from './db';
import { createBot } from './bot';
import { WhaleListener } from './whale-listener';
import { processWhaleTrade } from './copy-policy';

// Catch unhandled errors to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('[Main] BOT_TOKEN not set in environment');
    process.exit(1);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const wsUrl = process.env.SOLANA_WS_URL;

  // Initialize database
  const db = getDb();
  console.log('[Main] Database initialized');

  // Create Telegram bot
  const bot = createBot(botToken, db, rpcUrl);

  // Create whale listener
  const listener = new WhaleListener();

  // Load existing watched addresses
  const addresses = getAllWatchedAddresses(db);
  addresses.forEach(addr => listener.addAddress(addr));
  console.log(`[Main] Loaded ${addresses.length} watched addresses`);

  // Wire up: when whale trades, process copy policy
  listener.on('trade', async (trade) => {
    try {
      console.log(`[Main] Whale trade detected: ${trade.direction} ${trade.amountSol} SOL → ${trade.tokenMint}`);
      await processWhaleTrade(db, trade, (telegramId, message) => {
        bot.api.sendMessage(telegramId, message).catch(err => {
          console.error(`[Main] Failed to notify user ${telegramId}:`, err.message);
        });
      });
    } catch (err: any) {
      console.error('[Main] Error processing whale trade:', err?.message || err);
    }
  });

  listener.on('error', (err: any) => {
    console.error('[Main] Whale listener error:', err?.message || err);
  });

  // Start services
  try {
    await listener.start(wsUrl);
    console.log('[Main] Whale listener started');
  } catch (err: any) {
    console.error('[Main] Failed to start whale listener:', err?.message || err);
    console.log('[Main] Continuing without whale listener — bot commands still work');
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Main] Shutting down...');
    listener.stop();
    bot.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  bot.start({
    onStart: () => console.log('[Main] Telegram bot started'),
  });
}

main().catch(err => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
