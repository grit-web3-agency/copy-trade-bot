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

// --- PnL operations ---

export interface TokenPnL {
  token_mint: string;
  total_bought_sol: number;
  total_sold_sol: number;
  buy_count: number;
  sell_count: number;
  realized_pnl: number;
}

export interface UserPnL {
  tokens: TokenPnL[];
  total_pnl: number;
  total_trades: number;
}

export function getUserTrades(database: Database.Database, telegramId: string): Trade[] {
  return database.prepare(
    'SELECT * FROM trades WHERE telegram_id = ? ORDER BY created_at ASC'
  ).all(telegramId) as Trade[];
}

export function getUserPnL(database: Database.Database, telegramId: string): UserPnL {
  const rows = database.prepare(`
    SELECT
      token_mint,
      SUM(CASE WHEN direction = 'BUY' THEN amount_sol ELSE 0 END) AS total_bought_sol,
      SUM(CASE WHEN direction = 'SELL' THEN amount_sol ELSE 0 END) AS total_sold_sol,
      SUM(CASE WHEN direction = 'BUY' THEN 1 ELSE 0 END) AS buy_count,
      SUM(CASE WHEN direction = 'SELL' THEN 1 ELSE 0 END) AS sell_count
    FROM trades
    WHERE telegram_id = ? AND status NOT IN ('error', 'dry-run-error')
    GROUP BY token_mint
  `).all(telegramId) as Array<{
    token_mint: string;
    total_bought_sol: number;
    total_sold_sol: number;
    buy_count: number;
    sell_count: number;
  }>;

  const tokens: TokenPnL[] = rows.map(r => ({
    token_mint: r.token_mint,
    total_bought_sol: r.total_bought_sol,
    total_sold_sol: r.total_sold_sol,
    buy_count: r.buy_count,
    sell_count: r.sell_count,
    realized_pnl: r.total_sold_sol - r.total_bought_sol,
  }));

  const total_pnl = tokens.reduce((sum, t) => sum + t.realized_pnl, 0);
  const total_trades = tokens.reduce((sum, t) => sum + t.buy_count + t.sell_count, 0);

  return { tokens, total_pnl, total_trades };
}
