#!/usr/bin/env tsx
/**
 * CLI utility to create a new encrypted wallet for a given Telegram user ID.
 *
 * Usage:
 *   npx tsx scripts/create-wallet.ts <telegram_id>
 *
 * The wallet keypair is generated, encrypted with AES-256-CBC, and stored in
 * the SQLite database. The public key is printed to stdout.
 */
import { getDb, getOrCreateUser, getWallet } from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';

const telegramId = process.argv[2];

if (!telegramId) {
  console.error('Usage: npx tsx scripts/create-wallet.ts <telegram_id>');
  process.exit(1);
}

const db = getDb();
getOrCreateUser(db, telegramId);

const existing = getWallet(db, telegramId);
if (existing) {
  console.log(`Wallet already exists for user ${telegramId}`);
  console.log(`Public key: ${existing.public_key}`);
  process.exit(0);
}

const publicKey = createAndStoreWallet(db, telegramId);
console.log(`Wallet created for user ${telegramId}`);
console.log(`Public key: ${publicKey}`);
