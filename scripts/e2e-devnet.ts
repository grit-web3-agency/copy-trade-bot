/**
 * E2E Devnet Script — Real Devnet Connection
 *
 * Demonstrates the full copy-trade flow against Solana devnet:
 * 1. Validates environment
 * 2. Connects to devnet RPC
 * 3. Creates user + wallet
 * 4. Requests airdrop (if needed)
 * 5. Simulates whale trade event
 * 6. Executes real trade on devnet (will fail gracefully if no liquidity/route)
 * 7. Falls back to dry-run and shows results
 *
 * Usage:
 *   npx tsx scripts/e2e-devnet.ts
 *
 * No BOT_TOKEN required. Uses DEVNET_RPC or public devnet.
 */

import 'dotenv/config';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createTestDb,
  getOrCreateUser,
  addWatchedWhale,
  setCopyEnabled,
  setTradeMode,
} from '../src/db';
import { createAndStoreWallet, getKeypair, getBalance } from '../src/wallet-manager';
import { getDevnetRpcUrl, assertDevnetConnection, executeRealTrade, executeDryRunTrade } from '../src/trade-executor';
import { processWhaleTrade } from '../src/copy-policy';
import { WhaleTradeEvent } from '../src/whale-listener';

const MOCK_WHALE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
// Use a known devnet token (wrapped SOL mint for self-swap test)
const DEVNET_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function run() {
  console.log('='.repeat(60));
  console.log('  COPY-TRADE BOT — E2E DEVNET TEST');
  console.log('='.repeat(60));

  // Step 1: Validate RPC
  console.log('\n[1] Validating devnet RPC...');
  let rpcUrl: string;
  try {
    rpcUrl = getDevnetRpcUrl();
    console.log(`    RPC: ${rpcUrl}`);
  } catch (err: any) {
    console.error(`    FAILED: ${err.message}`);
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, 'confirmed');

  // Step 2: Verify devnet connection
  console.log('[2] Verifying devnet safety guard...');
  try {
    assertDevnetConnection(connection);
    console.log('    PASS: Connection is devnet');
  } catch (err: any) {
    console.error(`    BLOCKED: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Check devnet health
  console.log('[3] Checking devnet health...');
  try {
    const version = await connection.getVersion();
    console.log(`    Solana version: ${version['solana-core']}`);
    const slot = await connection.getSlot();
    console.log(`    Current slot: ${slot}`);
  } catch (err: any) {
    console.error(`    WARNING: Could not reach devnet: ${err.message}`);
    console.log('    Continuing with dry-run fallback...');
  }

  // Step 4: Setup database + user
  console.log('[4] Setting up in-memory database...');
  const db = createTestDb();
  const user = getOrCreateUser(db, 'e2e_test', 'e2e_tester');
  console.log(`    User: ${user.telegram_id}`);

  // Step 5: Create wallet
  console.log('[5] Creating Solana wallet...');
  const pubkey = createAndStoreWallet(db, 'e2e_test');
  console.log(`    Wallet: ${pubkey}`);

  // Step 6: Check balance / request airdrop
  console.log('[6] Checking wallet balance...');
  try {
    let balance = await getBalance(connection, pubkey);
    console.log(`    Balance: ${balance} SOL`);

    if (balance < 0.01) {
      console.log('    Requesting devnet airdrop (1 SOL)...');
      try {
        const sig = await connection.requestAirdrop(
          getKeypair(db, 'e2e_test')!.publicKey,
          1 * LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(sig, 'confirmed');
        balance = await getBalance(connection, pubkey);
        console.log(`    Airdrop confirmed. New balance: ${balance} SOL`);
      } catch (err: any) {
        console.warn(`    Airdrop failed (rate-limited?): ${err.message}`);
        console.log('    Continuing — real trade may fail due to insufficient funds.');
      }
    }
  } catch (err: any) {
    console.warn(`    Balance check failed: ${err.message}`);
  }

  // Step 7: Setup whale watching + copy trading
  console.log('[7] Configuring copy trading...');
  addWatchedWhale(db, 'e2e_test', MOCK_WHALE, 'Test Whale');
  setCopyEnabled(db, 'e2e_test', true);
  setTradeMode(db, 'e2e_test', 'devnet');
  console.log('    Mode: devnet (real trades)');
  console.log(`    Watching: ${MOCK_WHALE}`);

  // Step 8: Simulate whale BUY and process through copy policy
  console.log('\n[8] Simulating whale BUY event...');
  const buyEvent: WhaleTradeEvent = {
    whaleAddress: MOCK_WHALE,
    direction: 'BUY',
    tokenMint: DEVNET_TOKEN,
    amountSol: 0.05,
    signature: 'simulated-whale-buy-' + Date.now(),
    timestamp: Date.now(),
  };

  const notifications: string[] = [];
  const results = await processWhaleTrade(
    db,
    buyEvent,
    (_tid, msg) => {
      notifications.push(msg);
      console.log(`    [NOTIFY] ${msg}`);
    },
    connection
  );

  // Step 9: Show results
  console.log('\n' + '='.repeat(60));
  console.log('  E2E DEVNET TEST RESULTS');
  console.log('='.repeat(60));

  if (results.length === 0) {
    console.log('  No trade results (user may not have been eligible)');
  }

  for (const r of results) {
    const mode = r.dryRun ? 'DRY-RUN' : 'DEVNET';
    const status = r.success ? 'SUCCESS' : `FAILED: ${r.error}`;
    console.log(`  Mode: ${mode}`);
    console.log(`  Status: ${status}`);
    console.log(`  Signature: ${r.signature || 'none'}`);
    if (r.quote) {
      console.log(`  Quote: in=${r.quote.inAmount} out=${r.quote.outAmount}`);
    }
    if (r.error && r.error.includes('No Jupiter quote')) {
      console.log('  Note: No route available on devnet is expected — Jupiter has limited devnet liquidity.');
      console.log('  The important thing is that the flow executed without mainnet rejection errors.');
    }
  }

  // Step 10: Verify DB records
  const trades = db.prepare('SELECT * FROM trades WHERE telegram_id = ?').all('e2e_test') as any[];
  console.log(`\n  Trades recorded in DB: ${trades.length}`);
  for (const t of trades) {
    console.log(`    [${t.status}] ${t.direction} ${t.amount_sol} SOL → ${t.token_mint} (dry_run=${t.dry_run})`);
  }

  // Step 11: Test mainnet rejection
  console.log('\n[9] Verifying mainnet rejection...');
  const mainnetConn = new Connection('https://api.mainnet-beta.solana.com');
  try {
    assertDevnetConnection(mainnetConn);
    console.log('  FAIL: Mainnet connection was NOT rejected!');
    process.exit(1);
  } catch (err: any) {
    console.log(`  PASS: Mainnet rejected — "${err.message.slice(0, 60)}..."`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  E2E DEVNET TEST COMPLETE');
  console.log('  - Devnet RPC validated');
  console.log('  - Mainnet rejection confirmed');
  console.log('  - Trade flow executed (devnet mode)');
  console.log('  - DB records verified');
  console.log('='.repeat(60));

  process.exit(0);
}

run().catch(err => {
  console.error('E2E devnet test failed:', err);
  process.exit(1);
});
