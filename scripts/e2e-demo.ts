/**
 * E2E Demo Script — Devnet Dry-Run
 *
 * Demonstrates the full copy-trade flow:
 * 1. Create in-memory DB
 * 2. Register a user and create wallet
 * 3. Add a whale to watch list
 * 4. Enable copy trading
 * 5. Simulate a whale BUY event
 * 6. Copy policy evaluates and executes dry-run trade
 * 7. Print results
 */

import { createTestDb, getOrCreateUser, addWatchedWhale, setCopyEnabled } from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';
import { WhaleListener, WhaleTradeEvent } from '../src/whale-listener';
import { processWhaleTrade } from '../src/copy-policy';

const MOCK_WHALE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const MOCK_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC devnet

async function runDemo() {
  console.log('='.repeat(60));
  console.log('  COPY-TRADE BOT — E2E DEMO (Devnet Dry-Run)');
  console.log('='.repeat(60));

  // Step 1: Initialize
  console.log('\n[1] Initializing in-memory database...');
  const db = createTestDb();

  // Step 2: Register user
  console.log('[2] Registering user (telegram_id=demo_user)...');
  const user = getOrCreateUser(db, 'demo_user', 'demo');
  console.log(`    User created: ${user.telegram_id}`);

  // Step 3: Create wallet
  console.log('[3] Creating Solana wallet...');
  const pubkey = createAndStoreWallet(db, 'demo_user');
  console.log(`    Wallet: ${pubkey}`);

  // Step 4: Watch whale
  console.log(`[4] Adding whale to watch list: ${MOCK_WHALE}`);
  addWatchedWhale(db, 'demo_user', MOCK_WHALE);

  // Step 5: Enable copy trading
  console.log('[5] Enabling copy trading...');
  setCopyEnabled(db, 'demo_user', true);

  // Step 6: Create whale listener
  console.log('[6] Starting whale listener...');
  const listener = new WhaleListener();
  listener.addAddress(MOCK_WHALE);
  await listener.start();

  // Step 7: Wire up trade handler
  const tradeResults: any[] = [];
  const notifications: string[] = [];

  listener.on('trade', async (trade: WhaleTradeEvent) => {
    console.log(`\n[WHALE DETECTED] ${trade.direction} ${trade.amountSol} SOL → ${trade.tokenMint}`);
    console.log(`    Signature: ${trade.signature}`);

    const results = await processWhaleTrade(db, trade, (tid, msg) => {
      notifications.push(msg);
      console.log(`\n[NOTIFICATION to ${tid}]\n    ${msg.replace(/\n/g, '\n    ')}`);
    });

    tradeResults.push(...results);
  });

  // Step 8: Simulate whale BUY
  console.log('\n[7] Simulating whale BUY event...');
  const buyEvent: WhaleTradeEvent = {
    whaleAddress: MOCK_WHALE,
    direction: 'BUY',
    tokenMint: MOCK_TOKEN,
    amountSol: 2.5,
    signature: 'simulated-whale-buy-' + Date.now(),
    timestamp: Date.now(),
  };
  listener.simulateTrade(buyEvent);

  // Wait for async processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 9: Simulate whale SELL
  console.log('\n[8] Simulating whale SELL event...');
  const sellEvent: WhaleTradeEvent = {
    whaleAddress: MOCK_WHALE,
    direction: 'SELL',
    tokenMint: MOCK_TOKEN,
    amountSol: 1.0,
    signature: 'simulated-whale-sell-' + Date.now(),
    timestamp: Date.now(),
  };
  listener.simulateTrade(sellEvent);

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  DEMO SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Trades executed (dry-run): ${tradeResults.length}`);
  console.log(`  Notifications sent: ${notifications.length}`);
  tradeResults.forEach((r, i) => {
    console.log(`  Trade ${i + 1}: success=${r.success} sig=${r.signature} dryRun=${r.dryRun}`);
  });
  console.log('\n  All trades were DRY-RUN only. No real transactions sent.');
  console.log('='.repeat(60));

  listener.stop();
  process.exit(0);
}

runDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
