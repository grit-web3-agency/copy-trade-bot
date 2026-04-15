import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, getOrCreateUser, recordTrade } from '../src/db';
import { calculatePnL, formatPnLMessage } from '../src/pnl-tracker';
import Database from 'better-sqlite3';

const MOCK_TOKEN_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MOCK_TOKEN_B = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const MOCK_WHALE = 'WhaleAddr111111111111111111111111111111111';

describe('PnL Tracker', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '100', 'testuser');
  });

  it('returns empty summary when no trades', () => {
    const pnl = calculatePnL(db, '100');
    expect(pnl.totalTrades).toBe(0);
    expect(pnl.totalBuySol).toBe(0);
    expect(pnl.totalSellSol).toBe(0);
    expect(pnl.netPnlSol).toBe(0);
    expect(pnl.tokens).toHaveLength(0);
    expect(pnl.lastTradeAt).toBeNull();
  });

  it('calculates PnL for single token buy only', () => {
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 0.5, 'sig1', 'dry-run-quoted', true, '1000000');

    const pnl = calculatePnL(db, '100');
    expect(pnl.totalTrades).toBe(1);
    expect(pnl.totalBuySol).toBe(0.5);
    expect(pnl.totalSellSol).toBe(0);
    expect(pnl.netPnlSol).toBe(-0.5);
    expect(pnl.tokens).toHaveLength(1);
    expect(pnl.tokens[0].openPosition).toBe(true);
  });

  it('calculates PnL for buy and sell (profit)', () => {
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', MOCK_WHALE, 'SELL', MOCK_TOKEN_A, 0.8, 'sig2', 'dry-run-quoted', true);

    const pnl = calculatePnL(db, '100');
    expect(pnl.totalBuySol).toBe(0.5);
    expect(pnl.totalSellSol).toBe(0.8);
    expect(pnl.netPnlSol).toBeCloseTo(0.3);
    expect(pnl.tokens[0].netSol).toBeCloseTo(0.3);
    expect(pnl.tokens[0].openPosition).toBe(false);
  });

  it('calculates PnL for buy and sell (loss)', () => {
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 1.0, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', MOCK_WHALE, 'SELL', MOCK_TOKEN_A, 0.4, 'sig2', 'dry-run-quoted', true);

    const pnl = calculatePnL(db, '100');
    expect(pnl.netPnlSol).toBeCloseTo(-0.6);
  });

  it('tracks multiple tokens separately', () => {
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', MOCK_WHALE, 'SELL', MOCK_TOKEN_A, 0.8, 'sig2', 'dry-run-quoted', true);
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_B, 1.0, 'sig3', 'dry-run-quoted', true);

    const pnl = calculatePnL(db, '100');
    expect(pnl.tokens).toHaveLength(2);
    expect(pnl.totalBuySol).toBe(1.5);
    expect(pnl.totalSellSol).toBe(0.8);
    expect(pnl.netPnlSol).toBeCloseTo(-0.7);
  });

  it('excludes error trades from PnL', () => {
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 9.9, 'sig-err', 'dry-run-error', true);

    const pnl = calculatePnL(db, '100');
    // error trade still counted in totalTrades (getTradesForUser includes all)
    // but not in PnL calculation (getTradesSummaryByToken excludes errors)
    expect(pnl.totalBuySol).toBe(0.5);
  });

  it('isolates PnL per user', () => {
    getOrCreateUser(db, '200', 'otheruser');
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '200', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 2.0, 'sig2', 'dry-run-quoted', true);

    const pnl100 = calculatePnL(db, '100');
    const pnl200 = calculatePnL(db, '200');
    expect(pnl100.totalBuySol).toBe(0.5);
    expect(pnl200.totalBuySol).toBe(2.0);
  });

  it('formats empty PnL message', () => {
    const pnl = calculatePnL(db, '100');
    const msg = formatPnLMessage(pnl);
    expect(msg).toContain('No trades recorded');
  });

  it('formats PnL message with data', () => {
    recordTrade(db, '100', MOCK_WHALE, 'BUY', MOCK_TOKEN_A, 0.5, 'sig1', 'dry-run-quoted', true);
    recordTrade(db, '100', MOCK_WHALE, 'SELL', MOCK_TOKEN_A, 0.8, 'sig2', 'dry-run-quoted', true);

    const pnl = calculatePnL(db, '100');
    const msg = formatPnLMessage(pnl);
    expect(msg).toContain('PnL Summary');
    expect(msg).toContain('Total trades: 2');
    expect(msg).toContain('+0.3000 SOL');
  });
});
