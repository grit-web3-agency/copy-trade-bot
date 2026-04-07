#!/usr/bin/env tsx
/**
 * CLI: Create a new Solana wallet, encrypt the secret key, and store it in SQLite.
 *
 * Usage:
 *   npx tsx scripts/create-wallet.ts <telegramId>
 *   npx tsx scripts/create-wallet.ts 123456789
 */
import 'dotenv/config';
import { getDb, getOrCreateUser, getWallet } from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';

function main() {
  const telegramId = process.argv[2];
  if (!telegramId) {
    console.error('Usage: npx tsx scripts/create-wallet.ts <telegramId>');
    process.exit(1);
  }

  const db = getDb();
  getOrCreateUser(db, telegramId);

  const existing = getWallet(db, telegramId);
  if (existing) {
    console.log(`Wallet already exists for user ${telegramId}`);
    console.log(`  Public key: ${existing.public_key}`);
    process.exit(0);
  }

  const publicKey = createAndStoreWallet(db, telegramId);
  console.log(`Wallet created for user ${telegramId}`);
  console.log(`  Public key: ${publicKey}`);
  console.log(`  Encrypted secret stored in SQLite (copytrade.db)`);
}

main();
