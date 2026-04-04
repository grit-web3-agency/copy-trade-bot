import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  getOrCreateUser,
  setUserSettings,
  getUserSettings,
} from '../src/db';
import Database from 'better-sqlite3';

describe('/settings DB operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns default settings for new user', () => {
    getOrCreateUser(db, '100', 'alice');
    const s = getUserSettings(db, '100');
    expect(s.max_trade_size_sol).toBe(0.1);
    expect(s.slippage_bps).toBe(100);
  });

  it('returns defaults when user does not exist', () => {
    const s = getUserSettings(db, 'nonexistent');
    expect(s.max_trade_size_sol).toBe(0.1);
    expect(s.slippage_bps).toBe(100);
  });

  it('updates max_trade_size_sol only', () => {
    getOrCreateUser(db, '100', 'alice');
    setUserSettings(db, '100', { maxTradeSizeSol: 0.5 });
    const s = getUserSettings(db, '100');
    expect(s.max_trade_size_sol).toBe(0.5);
    expect(s.slippage_bps).toBe(100); // unchanged
  });

  it('updates slippage_bps only', () => {
    getOrCreateUser(db, '100', 'alice');
    setUserSettings(db, '100', { slippageBps: 250 });
    const s = getUserSettings(db, '100');
    expect(s.max_trade_size_sol).toBe(0.1); // unchanged
    expect(s.slippage_bps).toBe(250);
  });

  it('updates both settings at once', () => {
    getOrCreateUser(db, '100', 'alice');
    setUserSettings(db, '100', { maxTradeSizeSol: 2.0, slippageBps: 500 });
    const s = getUserSettings(db, '100');
    expect(s.max_trade_size_sol).toBe(2.0);
    expect(s.slippage_bps).toBe(500);
  });

  it('does nothing when no settings provided', () => {
    getOrCreateUser(db, '100', 'alice');
    setUserSettings(db, '100', {});
    const s = getUserSettings(db, '100');
    expect(s.max_trade_size_sol).toBe(0.1);
    expect(s.slippage_bps).toBe(100);
  });

  it('persists settings across reads', () => {
    getOrCreateUser(db, '100', 'alice');
    setUserSettings(db, '100', { maxTradeSizeSol: 3.0, slippageBps: 50 });

    // Read twice to ensure persistence
    const s1 = getUserSettings(db, '100');
    const s2 = getUserSettings(db, '100');
    expect(s1).toEqual(s2);
    expect(s1.max_trade_size_sol).toBe(3.0);
  });
});
