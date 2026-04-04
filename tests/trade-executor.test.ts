import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, getOrCreateUser } from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';
import Database from 'better-sqlite3';

// Mock getJupiterQuote to avoid network calls and retry delays
vi.mock('../src/trade-executor', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/trade-executor')>();
  return {
    ...mod,
    getJupiterQuote: vi.fn().mockResolvedValue(null),
  };
});

// Import after mock setup
const { executeDryRunTrade, _getInFlightTrades } = await import('../src/trade-executor');

const TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WHALE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

describe('TradeExecutor', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '100', 'alice');
    createAndStoreWallet(db, '100');
    _getInFlightTrades().clear();
  });

  it('executes a dry-run trade successfully', async () => {
    const result = await executeDryRunTrade(db, '100', WHALE, 'BUY', TOKEN, 0.05, 100);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.signature).toBeTruthy();
  });

  it('blocks duplicate in-flight trades', async () => {
    _getInFlightTrades().add('100:' + TOKEN + ':BUY');

    const result = await executeDryRunTrade(db, '100', WHALE, 'BUY', TOKEN, 0.05, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Duplicate trade already in-flight');
  });

  it('clears in-flight after trade completes', async () => {
    await executeDryRunTrade(db, '100', WHALE, 'BUY', TOKEN, 0.05, 100);
    expect(_getInFlightTrades().has('100:' + TOKEN + ':BUY')).toBe(false);
  });

  it('records trade in database', async () => {
    await executeDryRunTrade(db, '100', WHALE, 'BUY', TOKEN, 0.05, 100);
    const trades = db.prepare('SELECT * FROM trades WHERE telegram_id = ?').all('100');
    expect(trades.length).toBe(1);
  });

  it('handles SELL direction', async () => {
    const result = await executeDryRunTrade(db, '100', WHALE, 'SELL', TOKEN, 0.05, 100);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
  });
});
