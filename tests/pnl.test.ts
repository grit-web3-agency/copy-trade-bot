import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb,
  getOrCreateUser,
  recordTrade,
  getPnlSnapshots,
  getRecentTrades,
} from '../src/db';
import {
  recomputePnlFromTrades,
  getPnlSummary,
  formatPnlMessage,
} from '../src/pnl';

describe('PnL module', () => {
  let db: Database.Database;
  const userId = 'pnl_user';
  const tokenA = 'TokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const tokenB = 'TokenBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, userId, 'pnltest');
  });

  describe('recomputePnlFromTrades', () => {
    it('returns empty map when user has no trades with price data', () => {
      // Record a trade without price data (legacy format)
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 0.1, 'sig1', 'dry-run', true);
      const result = recomputePnlFromTrades(db, userId);
      expect(result.size).toBe(0);
    });

    it('tracks a single BUY position', () => {
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 0.1, 'sig1', 'done', true, 0.005, 20, 0.0001);
      const result = recomputePnlFromTrades(db, userId);
      expect(result.size).toBe(1);
      const pos = result.get(tokenA)!;
      expect(pos.quantityHeld).toBe(20);
      expect(pos.realizedPnl).toBe(0);
      // avg entry = (0.005*20 + 0.0001) / 20 = 0.100001 / 20 = 0.0050005
      expect(pos.avgEntryPrice).toBeCloseTo(0.005000, 4);
    });

    it('computes realized PnL on full sell', () => {
      // BUY 100 tokens @ 0.01 each, no fees
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);
      // SELL 100 tokens @ 0.02 each, no fees
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 2.0, 'sig2', 'done', true, 0.02, 100, 0);

      const result = recomputePnlFromTrades(db, userId);
      const pos = result.get(tokenA)!;
      expect(pos.quantityHeld).toBe(0);
      // Realized = (0.02 * 100 - 0) - (0.01 * 100) = 2.0 - 1.0 = 1.0
      expect(pos.realizedPnl).toBeCloseTo(1.0, 6);
    });

    it('computes realized PnL on partial sell', () => {
      // BUY 100 @ 0.01
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);
      // SELL 50 @ 0.03
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 1.5, 'sig2', 'done', true, 0.03, 50, 0);

      const result = recomputePnlFromTrades(db, userId);
      const pos = result.get(tokenA)!;
      expect(pos.quantityHeld).toBe(50);
      // Realized = (0.03*50) - (0.01*50) = 1.5 - 0.5 = 1.0
      expect(pos.realizedPnl).toBeCloseTo(1.0, 6);
      expect(pos.avgEntryPrice).toBeCloseTo(0.01, 6);
    });

    it('handles loss scenario', () => {
      // BUY 100 @ 0.05
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 5.0, 'sig1', 'done', true, 0.05, 100, 0);
      // SELL 100 @ 0.02 (sold at a loss)
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 2.0, 'sig2', 'done', true, 0.02, 100, 0);

      const result = recomputePnlFromTrades(db, userId);
      const pos = result.get(tokenA)!;
      expect(pos.realizedPnl).toBeCloseTo(-3.0, 6);
      expect(pos.quantityHeld).toBe(0);
    });

    it('tracks multiple tokens independently', () => {
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);
      recordTrade(db, userId, 'whale1', 'BUY', tokenB, 2.0, 'sig2', 'done', true, 0.02, 100, 0);
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 2.0, 'sig3', 'done', true, 0.02, 100, 0);

      const result = recomputePnlFromTrades(db, userId);
      expect(result.size).toBe(2);
      expect(result.get(tokenA)!.realizedPnl).toBeCloseTo(1.0, 6);
      expect(result.get(tokenA)!.quantityHeld).toBe(0);
      expect(result.get(tokenB)!.quantityHeld).toBe(100);
      expect(result.get(tokenB)!.realizedPnl).toBe(0);
    });

    it('handles multiple BUYs with average cost basis', () => {
      // BUY 50 @ 0.01
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 0.5, 'sig1', 'done', true, 0.01, 50, 0);
      // BUY 50 @ 0.03
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.5, 'sig2', 'done', true, 0.03, 50, 0);
      // SELL 100 @ 0.04
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 4.0, 'sig3', 'done', true, 0.04, 100, 0);

      const result = recomputePnlFromTrades(db, userId);
      const pos = result.get(tokenA)!;
      // Avg entry = (0.01*50 + 0.03*50) / 100 = 2.0/100 = 0.02
      // Realized = (0.04*100) - (0.02*100) = 4.0 - 2.0 = 2.0
      expect(pos.realizedPnl).toBeCloseTo(2.0, 6);
      expect(pos.quantityHeld).toBe(0);
    });

    it('accounts for fees in PnL', () => {
      // BUY 100 @ 0.01 with 0.01 fee
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0.01);
      // SELL 100 @ 0.02 with 0.01 fee
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 2.0, 'sig2', 'done', true, 0.02, 100, 0.01);

      const result = recomputePnlFromTrades(db, userId);
      const pos = result.get(tokenA)!;
      // Cost basis w/ fee: (0.01*100 + 0.01) / 100 = 0.0101, totalCost = 1.01
      // Sell revenue: 0.02*100 - 0.01 = 1.99
      // Realized = 1.99 - (0.0101 * 100) = 1.99 - 1.01 = 0.98
      expect(pos.realizedPnl).toBeCloseTo(0.98, 4);
    });

    it('persists snapshots to DB', () => {
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);
      recomputePnlFromTrades(db, userId);

      const snapshots = getPnlSnapshots(db, userId);
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].token_mint).toBe(tokenA);
      expect(snapshots[0].quantity_held).toBe(100);
    });
  });

  describe('getPnlSummary', () => {
    it('returns zero summary for user with no trades', async () => {
      const mockPrices = vi.fn().mockResolvedValue(new Map());
      const summary = await getPnlSummary(db, userId, mockPrices);
      expect(summary.totalRealizedPnl).toBe(0);
      expect(summary.totalUnrealizedPnl).toBe(0);
      expect(summary.totalPnl).toBe(0);
      expect(summary.positions.length).toBe(0);
    });

    it('computes unrealized PnL with current prices', async () => {
      // BUY 100 @ 0.01
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);

      // Mock current price at 0.05 (5x)
      const mockPrices = vi.fn().mockResolvedValue(new Map([[tokenA, 0.05]]));
      const summary = await getPnlSummary(db, userId, mockPrices);

      expect(summary.totalRealizedPnl).toBe(0);
      // Unrealized = (0.05 * 100) - (0.01 * 100) = 5.0 - 1.0 = 4.0
      expect(summary.totalUnrealizedPnl).toBeCloseTo(4.0, 6);
      expect(summary.totalPnl).toBeCloseTo(4.0, 6);
      expect(summary.positions.length).toBe(1);
      expect(summary.positions[0].currentPrice).toBe(0.05);
    });

    it('handles mixed realized and unrealized PnL', async () => {
      // Token A: BUY 100 @ 0.01, SELL 50 @ 0.03 (realized = 1.0, hold 50)
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 1.5, 'sig2', 'done', true, 0.03, 50, 0);

      // Current price of tokenA = 0.04
      const mockPrices = vi.fn().mockResolvedValue(new Map([[tokenA, 0.04]]));
      const summary = await getPnlSummary(db, userId, mockPrices);

      expect(summary.totalRealizedPnl).toBeCloseTo(1.0, 6);
      // Unrealized on 50 held: (0.04 - 0.01) * 50 = 1.5
      expect(summary.totalUnrealizedPnl).toBeCloseTo(1.5, 6);
      expect(summary.totalPnl).toBeCloseTo(2.5, 6);
    });

    it('returns null currentPrice when price feed fails', async () => {
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 1.0, 'sig1', 'done', true, 0.01, 100, 0);

      const mockPrices = vi.fn().mockResolvedValue(new Map()); // no prices
      const summary = await getPnlSummary(db, userId, mockPrices);

      expect(summary.positions[0].currentPrice).toBeNull();
      expect(summary.totalUnrealizedPnl).toBe(0); // can't compute without price
    });
  });

  describe('formatPnlMessage', () => {
    it('formats empty state', () => {
      const msg = formatPnlMessage({
        totalRealizedPnl: 0,
        totalUnrealizedPnl: 0,
        totalPnl: 0,
        positions: [],
      }, []);
      expect(msg).toContain('PnL Summary');
      expect(msg).toContain('No trades recorded');
    });

    it('formats positions and recent trades', () => {
      const msg = formatPnlMessage({
        totalRealizedPnl: 1.5,
        totalUnrealizedPnl: 0.5,
        totalPnl: 2.0,
        positions: [{
          tokenMint: tokenA,
          quantityHeld: 50,
          avgEntryPrice: 0.01,
          realizedPnl: 1.5,
          unrealizedPnl: 0.5,
          currentPrice: 0.02,
        }],
      }, [{
        id: 1,
        telegram_id: userId,
        whale_address: 'whale1',
        direction: 'BUY',
        token_mint: tokenA,
        amount_sol: 1.0,
        tx_signature: 'sig1',
        status: 'done',
        dry_run: 1,
        executed_price: 0.01,
        quantity: 100,
        fees: 0,
        created_at: '2026-01-01',
      }]);

      expect(msg).toContain('+1.5000 SOL');
      expect(msg).toContain('+0.5000 SOL');
      expect(msg).toContain('+2.0000 SOL');
      expect(msg).toContain('Positions');
      expect(msg).toContain('Last 1 trades');
      expect(msg).toContain('BUY');
      expect(msg).toContain('[dry]');
    });

    it('shows closed positions', () => {
      const msg = formatPnlMessage({
        totalRealizedPnl: -0.5,
        totalUnrealizedPnl: 0,
        totalPnl: -0.5,
        positions: [{
          tokenMint: tokenA,
          quantityHeld: 0,
          avgEntryPrice: 0.01,
          realizedPnl: -0.5,
          unrealizedPnl: 0,
          currentPrice: null,
        }],
      }, []);

      expect(msg).toContain('closed');
      expect(msg).toContain('-0.5000');
    });
  });

  describe('getRecentTrades', () => {
    it('returns trades in reverse chronological order', () => {
      recordTrade(db, userId, 'whale1', 'BUY', tokenA, 0.1, 'sig1', 'done', true);
      recordTrade(db, userId, 'whale1', 'SELL', tokenA, 0.2, 'sig2', 'done', true);
      recordTrade(db, userId, 'whale1', 'BUY', tokenB, 0.3, 'sig3', 'done', true);

      const trades = getRecentTrades(db, userId, 2);
      expect(trades.length).toBe(2);
      expect(trades[0].token_mint).toBe(tokenB); // most recent first
      expect(trades[1].direction).toBe('SELL');
    });
  });
});
