import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database;

export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'copytrade.db');
    db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  initSchema(testDb);
  return testDb;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      copy_enabled INTEGER DEFAULT 0,
      max_trade_size_sol REAL DEFAULT 0.1,
      slippage_bps INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallets (
      telegram_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      encrypted_secret TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS watched_whales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      whale_address TEXT NOT NULL,
      label TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
      UNIQUE(telegram_id, whale_address)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      whale_address TEXT,
      direction TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      amount_sol REAL,
      tx_signature TEXT,
      status TEXT DEFAULT 'pending',
      dry_run INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS token_whitelist (
      mint TEXT PRIMARY KEY,
      symbol TEXT,
      name TEXT
    );
  `);

  // Migration: add quote_out_amount column to trades if missing
  const tradeColumns = database.pragma('table_info(trades)') as { name: string }[];
  if (!tradeColumns.some(c => c.name === 'quote_out_amount')) {
    database.exec(`ALTER TABLE trades ADD COLUMN quote_out_amount TEXT`);
  }

  // Migration: add trade_mode column to users if missing (default 'dry-run')
  const userColumns = database.pragma('table_info(users)') as { name: string }[];
  if (!userColumns.some(c => c.name === 'trade_mode')) {
    database.exec(`ALTER TABLE users ADD COLUMN trade_mode TEXT DEFAULT 'dry-run'`);
  }
}

// --- User operations ---

export type TradeMode = 'dry-run' | 'devnet';

export interface User {
  telegram_id: string;
  username: string | null;
  copy_enabled: number;
  max_trade_size_sol: number;
  slippage_bps: number;
  trade_mode: TradeMode;
}

export function getOrCreateUser(database: Database.Database, telegramId: string, username?: string): User {
  const existing = database.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
  if (existing) return existing;

  database.prepare('INSERT INTO users (telegram_id, username) VALUES (?, ?)').run(telegramId, username || null);
  return database.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User;
}

export function setCopyEnabled(database: Database.Database, telegramId: string, enabled: boolean) {
  database.prepare('UPDATE users SET copy_enabled = ? WHERE telegram_id = ?').run(enabled ? 1 : 0, telegramId);
}

export function getCopyEnabledUsers(database: Database.Database): User[] {
  return database.prepare('SELECT * FROM users WHERE copy_enabled = 1').all() as User[];
}

// New: user settings helpers
export function setUserSettings(database: Database.Database, telegramId: string, settings: { maxTradeSizeSol?: number; slippageBps?: number }) {
  const parts: string[] = [];
  const values: any[] = [];
  if (typeof settings.maxTradeSizeSol === 'number') {
    parts.push('max_trade_size_sol = ?');
    values.push(settings.maxTradeSizeSol);
  }
  if (typeof settings.slippageBps === 'number') {
    parts.push('slippage_bps = ?');
    values.push(settings.slippageBps);
  }
  if (parts.length === 0) return;
  values.push(telegramId);
  const sql = `UPDATE users SET ${parts.join(', ')} WHERE telegram_id = ?`;
  database.prepare(sql).run(...values);
}

export function getUserSettings(database: Database.Database, telegramId: string): { max_trade_size_sol: number; slippage_bps: number } {
  const row = database.prepare('SELECT max_trade_size_sol, slippage_bps FROM users WHERE telegram_id = ?').get(telegramId) as { max_trade_size_sol: number; slippage_bps: number } | undefined;
  if (!row) return { max_trade_size_sol: 0.1, slippage_bps: 100 };
  return { max_trade_size_sol: row.max_trade_size_sol, slippage_bps: row.slippage_bps };
}

// --- Trade mode operations ---

export function setTradeMode(database: Database.Database, telegramId: string, mode: TradeMode) {
  database.prepare('UPDATE users SET trade_mode = ? WHERE telegram_id = ?').run(mode, telegramId);
}

export function getTradeMode(database: Database.Database, telegramId: string): TradeMode {
  const row = database.prepare('SELECT trade_mode FROM users WHERE telegram_id = ?').get(telegramId) as { trade_mode: string } | undefined;
  return (row?.trade_mode === 'devnet' ? 'devnet' : 'dry-run') as TradeMode;
}

// --- Whale watch operations ---

export interface WatchedWhale {
  id: number;
  telegram_id: string;
  whale_address: string;
  label: string | null;
  active: number;
}

export function addWatchedWhale(database: Database.Database, telegramId: string, whaleAddress: string, label?: string): WatchedWhale {
  database.prepare(
    'INSERT OR IGNORE INTO watched_whales (telegram_id, whale_address, label) VALUES (?, ?, ?)'
  ).run(telegramId, whaleAddress, label || null);

  return database.prepare(
    'SELECT * FROM watched_whales WHERE telegram_id = ? AND whale_address = ?'
  ).get(telegramId, whaleAddress) as WatchedWhale;
}

export function getWatchedWhales(database: Database.Database, telegramId: string): WatchedWhale[] {
  return database.prepare(
    'SELECT * FROM watched_whales WHERE telegram_id = ? AND active = 1'
  ).all(telegramId) as WatchedWhale[];
}

export function getAllWatchedAddresses(database: Database.Database): string[] {
  const rows = database.prepare(
    'SELECT DISTINCT whale_address FROM watched_whales WHERE active = 1'
  ).all() as { whale_address: string }[];
  return rows.map(r => r.whale_address);
}

export function getUsersWatchingWhale(database: Database.Database, whaleAddress: string): User[] {
  return database.prepare(`
    SELECT u.* FROM users u
    JOIN watched_whales w ON u.telegram_id = w.telegram_id
    WHERE w.whale_address = ? AND w.active = 1 AND u.copy_enabled = 1
  `).all(whaleAddress) as User[];
}

// --- Wallet operations ---

export interface Wallet {
  telegram_id: string;
  public_key: string;
  encrypted_secret: string;
}

export function saveWallet(database: Database.Database, telegramId: string, publicKey: string, encryptedSecret: string) {
  database.prepare(
    'INSERT OR REPLACE INTO wallets (telegram_id, public_key, encrypted_secret) VALUES (?, ?, ?)'
  ).run(telegramId, publicKey, encryptedSecret);
}

export function getWallet(database: Database.Database, telegramId: string): Wallet | undefined {
  return database.prepare('SELECT * FROM wallets WHERE telegram_id = ?').get(telegramId) as Wallet | undefined;
}

// --- Trade operations ---

export interface Trade {
  id: number;
  telegram_id: string;
  whale_address: string | null;
  direction: string;
  token_mint: string;
  amount_sol: number | null;
  tx_signature: string | null;
  status: string;
  dry_run: number;
  quote_out_amount: string | null;
}

export function recordTrade(
  database: Database.Database,
  telegramId: string,
  whaleAddress: string,
  direction: string,
  tokenMint: string,
  amountSol: number,
  txSignature: string | null,
  status: string,
  dryRun: boolean,
  quoteOutAmount?: string
): Trade {
  const result = database.prepare(`
    INSERT INTO trades (telegram_id, whale_address, direction, token_mint, amount_sol, tx_signature, status, dry_run, quote_out_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(telegramId, whaleAddress, direction, tokenMint, amountSol, txSignature, status, dryRun ? 1 : 0, quoteOutAmount || null);

  return database.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid) as Trade;
}

// --- PnL operations ---

export interface TradeWithQuote extends Trade {
  quote_out_amount: string | null;
  created_at: string;
}

export function getTradesForUser(database: Database.Database, telegramId: string): TradeWithQuote[] {
  return database.prepare(
    'SELECT * FROM trades WHERE telegram_id = ? ORDER BY created_at DESC'
  ).all(telegramId) as TradeWithQuote[];
}

export function getTradesByToken(database: Database.Database, telegramId: string, tokenMint: string): TradeWithQuote[] {
  return database.prepare(
    'SELECT * FROM trades WHERE telegram_id = ? AND token_mint = ? ORDER BY created_at DESC'
  ).all(telegramId, tokenMint) as TradeWithQuote[];
}

export function getTradesSummaryByToken(database: Database.Database, telegramId: string): { token_mint: string; buy_count: number; sell_count: number; total_buy_sol: number; total_sell_sol: number }[] {
  return database.prepare(`
    SELECT
      token_mint,
      SUM(CASE WHEN direction = 'BUY' THEN 1 ELSE 0 END) as buy_count,
      SUM(CASE WHEN direction = 'SELL' THEN 1 ELSE 0 END) as sell_count,
      SUM(CASE WHEN direction = 'BUY' THEN amount_sol ELSE 0 END) as total_buy_sol,
      SUM(CASE WHEN direction = 'SELL' THEN amount_sol ELSE 0 END) as total_sell_sol
    FROM trades
    WHERE telegram_id = ? AND status NOT IN ('error', 'dry-run-error')
    GROUP BY token_mint
  `).all(telegramId) as any[];
}

// --- Unwatch operations ---

export function removeWatchedWhale(database: Database.Database, telegramId: string, whaleAddress: string): boolean {
  const result = database.prepare(
    'UPDATE watched_whales SET active = 0 WHERE telegram_id = ? AND whale_address = ? AND active = 1'
  ).run(telegramId, whaleAddress);
  return result.changes > 0;
}

export function removeAllWatchedWhales(database: Database.Database, telegramId: string): number {
  const result = database.prepare(
    'UPDATE watched_whales SET active = 0 WHERE telegram_id = ? AND active = 1'
  ).run(telegramId);
  return result.changes;
}
