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
}

// --- User operations ---

export interface User {
  telegram_id: string;
  username: string | null;
  copy_enabled: number;
  max_trade_size_sol: number;
  slippage_bps: number;
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
  dryRun: boolean
): Trade {
  const result = database.prepare(`
    INSERT INTO trades (telegram_id, whale_address, direction, token_mint, amount_sol, tx_signature, status, dry_run)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(telegramId, whaleAddress, direction, tokenMint, amountSol, txSignature, status, dryRun ? 1 : 0);

  return database.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid) as Trade;
}

// --- Subscription operations ---

export interface Subscription {
  id: number;
  telegram_id: string;
  plan: string;
  tx_signature: string | null;
  paid_sol: number;
  started_at: string;
  expires_at: string | null;
  active: number;
}

export function getActiveSubscription(database: Database.Database, telegramId: string): Subscription | undefined {
  return database.prepare(
    `SELECT * FROM subscriptions
     WHERE telegram_id = ? AND active = 1
       AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY id DESC LIMIT 1`
  ).get(telegramId) as Subscription | undefined;
}

export function createSubscription(
  database: Database.Database,
  telegramId: string,
  plan: string,
  txSignature: string | null,
  paidSol: number,
  durationDays: number
): Subscription {
  const result = database.prepare(`
    INSERT INTO subscriptions (telegram_id, plan, tx_signature, paid_sol, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' days'))
  `).run(telegramId, plan, txSignature, paidSol, durationDays);

  return database.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid) as Subscription;
}

export function deactivateSubscriptions(database: Database.Database, telegramId: string) {
  database.prepare('UPDATE subscriptions SET active = 0 WHERE telegram_id = ?').run(telegramId);
}
