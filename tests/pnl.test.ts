import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb,
  getOrCreateUser,
  recordTrade,
  getUserPnL,
  getUserTrades,
} from '../src/db';

describe('PnL tracking', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '100', 'alice');
  });

  it('returns zero PnL when no trades exist', () => {
    const pnl = getUserPnL(db, '100');
    expect(pnl.total_pnl).toBe(0);
    expect(pnl.total_trades).toBe(0);
    expect(pnl.tokens).toEqual([]);
  });

  it('calculates negative PnL for buy-only (unrealized cost)', () => {
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 0.5, 'sig1', 'dry-run-quoted', true);
    const pnl = getUserPnL(db, '100');
    expect(pnl.total_trades).toBe(1);
    expect(pnl.total_pnl).toBeCloseTo(-0.5);
    expect(pnl.tokens[0].buy_count).toBe(1);
    expect(pnl.tokens[0].sell_count).toBe(0);
  });

  it('calculates profit when sell > buy', () => {
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', 'whale1', 'SELL', 'tokenA', 0.8, 'sig2', 'dry-run-quoted', true);
    const pnl = getUserPnL(db, '100');
    expect(pnl.total_pnl).toBeCloseTo(0.3);
    expect(pnl.tokens[0].realized_pnl).toBeCloseTo(0.3);
  });

  it('calculates loss when sell < buy', () => {
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 1.0, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', 'whale1', 'SELL', 'tokenA', 0.6, 'sig2', 'dry-run-quoted', true);
    const pnl = getUserPnL(db, '100');
    expect(pnl.total_pnl).toBeCloseTo(-0.4);
  });

  it('tracks multiple tokens independently', () => {
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', 'whale1', 'SELL', 'tokenA', 0.9, 'sig2', 'dry-run-quoted', true);
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenB', 0.3, 'sig3', 'dry-run-quoted', true);
    recordTrade(db, '100', 'whale1', 'SELL', 'tokenB', 0.1, 'sig4', 'dry-run-quoted', true);

    const pnl = getUserPnL(db, '100');
    expect(pnl.total_trades).toBe(4);
    // tokenA: +0.4, tokenB: -0.2 → total +0.2
    expect(pnl.total_pnl).toBeCloseTo(0.2);
    expect(pnl.tokens.length).toBe(2);
  });

  it('excludes error trades from PnL', () => {
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 1.0, null, 'error', true);
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 2.0, null, 'dry-run-error', true);

    const pnl = getUserPnL(db, '100');
    // Only the 0.5 trade should count
    expect(pnl.tokens[0].total_bought_sol).toBeCloseTo(0.5);
  });

  it('getUserTrades returns trades in order', () => {
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 0.5, 'sig1', 'done', true);
    recordTrade(db, '100', 'whale1', 'SELL', 'tokenA', 0.7, 'sig2', 'done', true);
    const trades = getUserTrades(db, '100');
    expect(trades.length).toBe(2);
    expect(trades[0].direction).toBe('BUY');
    expect(trades[1].direction).toBe('SELL');
  });

  it('isolates PnL between users', () => {
    getOrCreateUser(db, '200', 'bob');
    recordTrade(db, '100', 'whale1', 'BUY', 'tokenA', 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '200', 'whale1', 'BUY', 'tokenA', 1.0, 'sig2', 'dry-run-quoted', true);

    const pnl100 = getUserPnL(db, '100');
    const pnl200 = getUserPnL(db, '200');
    expect(pnl100.tokens[0].total_bought_sol).toBeCloseTo(0.5);
    expect(pnl200.tokens[0].total_bought_sol).toBeCloseTo(1.0);
  });
});
