import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb,
  getOrCreateUser,
  setCopyEnabled,
  getCopyEnabledUsers,
  addWatchedWhale,
  getWatchedWhales,
  getAllWatchedAddresses,
  getUsersWatchingWhale,
  saveWallet,
  getWallet,
  recordTrade,
} from '../src/db';

describe('Database module', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('User operations', () => {
    it('creates a new user', () => {
      const user = getOrCreateUser(db, '100', 'alice');
      expect(user.telegram_id).toBe('100');
      expect(user.username).toBe('alice');
      expect(user.copy_enabled).toBe(0);
    });

    it('returns existing user on duplicate', () => {
      getOrCreateUser(db, '100', 'alice');
      const user2 = getOrCreateUser(db, '100', 'alice_new');
      expect(user2.username).toBe('alice'); // original username preserved
    });

    it('toggles copy enabled', () => {
      getOrCreateUser(db, '100');
      setCopyEnabled(db, '100', true);
      const enabled = getCopyEnabledUsers(db);
      expect(enabled.length).toBe(1);
      expect(enabled[0].telegram_id).toBe('100');

      setCopyEnabled(db, '100', false);
      expect(getCopyEnabledUsers(db).length).toBe(0);
    });
  });

  describe('Whale watch operations', () => {
    beforeEach(() => {
      getOrCreateUser(db, '100');
      getOrCreateUser(db, '200');
    });

    it('adds watched whale', () => {
      const whale = addWatchedWhale(db, '100', 'whaleAddr1', 'Big Fish');
      expect(whale.whale_address).toBe('whaleAddr1');
      expect(whale.label).toBe('Big Fish');
    });

    it('enforces uniqueness per user+address', () => {
      addWatchedWhale(db, '100', 'whaleAddr1');
      addWatchedWhale(db, '100', 'whaleAddr1'); // duplicate
      const whales = getWatchedWhales(db, '100');
      expect(whales.length).toBe(1);
    });

    it('getAllWatchedAddresses returns distinct addresses', () => {
      addWatchedWhale(db, '100', 'whaleAddr1');
      addWatchedWhale(db, '200', 'whaleAddr1');
      addWatchedWhale(db, '200', 'whaleAddr2');
      const all = getAllWatchedAddresses(db);
      expect(all.sort()).toEqual(['whaleAddr1', 'whaleAddr2']);
    });

    it('getUsersWatchingWhale returns only copy-enabled users', () => {
      addWatchedWhale(db, '100', 'whaleAddr1');
      addWatchedWhale(db, '200', 'whaleAddr1');
      setCopyEnabled(db, '100', true);
      // 200 is not enabled

      const users = getUsersWatchingWhale(db, 'whaleAddr1');
      expect(users.length).toBe(1);
      expect(users[0].telegram_id).toBe('100');
    });
  });

  describe('Wallet operations', () => {
    beforeEach(() => {
      getOrCreateUser(db, '100');
    });

    it('saves and retrieves wallet', () => {
      saveWallet(db, '100', 'pubkey123', 'encrypted_secret');
      const w = getWallet(db, '100');
      expect(w).toBeDefined();
      expect(w!.public_key).toBe('pubkey123');
      expect(w!.encrypted_secret).toBe('encrypted_secret');
    });

    it('returns undefined for non-existent wallet', () => {
      expect(getWallet(db, '999')).toBeUndefined();
    });

    it('upserts wallet (replace)', () => {
      saveWallet(db, '100', 'pubkey1', 'secret1');
      saveWallet(db, '100', 'pubkey2', 'secret2');
      const w = getWallet(db, '100');
      expect(w!.public_key).toBe('pubkey2');
    });
  });

  describe('Trade operations', () => {
    beforeEach(() => {
      getOrCreateUser(db, '100');
    });

    it('records a trade and returns it', () => {
      const trade = recordTrade(db, '100', 'whale1', 'BUY', 'token1', 0.5, 'sig123', 'dry-run', true);
      expect(trade.id).toBeGreaterThan(0);
      expect(trade.telegram_id).toBe('100');
      expect(trade.direction).toBe('BUY');
      expect(trade.amount_sol).toBe(0.5);
      expect(trade.dry_run).toBe(1);
    });

    it('records multiple trades', () => {
      recordTrade(db, '100', 'whale1', 'BUY', 'token1', 0.5, 'sig1', 'done', true);
      recordTrade(db, '100', 'whale1', 'SELL', 'token1', 0.3, 'sig2', 'done', true);
      const trades = db.prepare('SELECT * FROM trades WHERE telegram_id = ?').all('100');
      expect(trades.length).toBe(2);
    });
  });
});
