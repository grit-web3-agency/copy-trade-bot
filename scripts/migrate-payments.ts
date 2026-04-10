#!/usr/bin/env tsx
/**
 * Payment module migration script.
 *
 * Applies the payment_history table to an existing database.
 * Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
 *
 * Usage:
 *   npx tsx scripts/migrate-payments.ts [db-path]
 *
 * Examples:
 *   npx tsx scripts/migrate-payments.ts                    # default: ./copytrade.db
 *   npx tsx scripts/migrate-payments.ts /path/to/my.db     # custom path
 */
import Database from 'better-sqlite3';
import path from 'path';

function migrate(dbPath: string) {
  console.log(`[Migration] Opening database: ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Migration 1: payment_history table
  console.log('[Migration] Applying: payment_history table');
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      plan TEXT,
      amount_sol REAL DEFAULT 0,
      tx_signature TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
  `);
  console.log('[Migration] payment_history table OK');

  // Migration 2: ensure subscriptions table exists (idempotent)
  console.log('[Migration] Applying: subscriptions table (idempotent)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      tx_signature TEXT,
      paid_sol REAL DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
  `);
  console.log('[Migration] subscriptions table OK');

  db.close();
  console.log('[Migration] All migrations applied successfully');
}

const dbPath = process.argv[2] || path.join(process.cwd(), 'copytrade.db');
migrate(dbPath);
