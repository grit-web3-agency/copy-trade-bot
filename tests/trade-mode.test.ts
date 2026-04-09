import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb,
  getOrCreateUser,
  setTradeMode,
  getTradeMode,
  addWatchedWhale,
  setCopyEnabled,
} from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';
import { processWhaleTrade } from '../src/copy-policy';
import { WhaleTradeEvent } from '../src/whale-listener';

// Mock trade executor to avoid network calls
vi.mock('../src/trade-executor', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/trade-executor')>();
  return {
    ...mod,
    getJupiterQuote: vi.fn().mockResolvedValue(null),
    executeRealTrade: vi.fn().mockResolvedValue({
      success: true,
      signature: 'devnet-mock-sig',
      quote: null,
      dryRun: false,
    }),
  };
});

const MOCK_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MOCK_WHALE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

function makeTrade(overrides?: Partial<WhaleTradeEvent>): WhaleTradeEvent {
  return {
    whaleAddress: MOCK_WHALE,
    direction: 'BUY',
    tokenMint: MOCK_TOKEN,
    amountSol: 0.05,
    signature: 'testsig123',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('Trade Mode (DB)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('defaults to dry-run mode', () => {
    getOrCreateUser(db, '100', 'alice');
    expect(getTradeMode(db, '100')).toBe('dry-run');
  });

  it('sets mode to devnet', () => {
    getOrCreateUser(db, '100', 'alice');
    setTradeMode(db, '100', 'devnet');
    expect(getTradeMode(db, '100')).toBe('devnet');
  });

  it('sets mode back to dry-run', () => {
    getOrCreateUser(db, '100', 'alice');
    setTradeMode(db, '100', 'devnet');
    setTradeMode(db, '100', 'dry-run');
    expect(getTradeMode(db, '100')).toBe('dry-run');
  });

  it('returns dry-run for unknown user', () => {
    expect(getTradeMode(db, 'nonexistent')).toBe('dry-run');
  });
});

describe('processWhaleTrade with devnet mode', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('uses dry-run executor when mode is dry-run (default)', async () => {
    getOrCreateUser(db, '100', 'alice');
    createAndStoreWallet(db, '100');
    addWatchedWhale(db, '100', MOCK_WHALE);
    setCopyEnabled(db, '100', true);

    const results = await processWhaleTrade(db, makeTrade());
    expect(results.length).toBe(1);
    expect(results[0].dryRun).toBe(true);
  });

  it('uses real executor when mode is devnet and connection provided', async () => {
    getOrCreateUser(db, '200', 'bob');
    createAndStoreWallet(db, '200');
    addWatchedWhale(db, '200', MOCK_WHALE);
    setCopyEnabled(db, '200', true);
    setTradeMode(db, '200', 'devnet');

    const mockConnection: any = {};

    const results = await processWhaleTrade(db, makeTrade(), undefined, mockConnection);
    expect(results.length).toBe(1);
    expect(results[0].dryRun).toBe(false);
    expect(results[0].signature).toBe('devnet-mock-sig');
  });

  it('falls back to dry-run when devnet mode but no connection', async () => {
    getOrCreateUser(db, '300', 'carol');
    createAndStoreWallet(db, '300');
    addWatchedWhale(db, '300', MOCK_WHALE);
    setCopyEnabled(db, '300', true);
    setTradeMode(db, '300', 'devnet');

    // No connection passed
    const results = await processWhaleTrade(db, makeTrade());
    expect(results.length).toBe(1);
    expect(results[0].dryRun).toBe(true);
  });

  it('mixed modes: one user dry-run, one devnet', async () => {
    // User 1: dry-run
    getOrCreateUser(db, '400', 'user1');
    createAndStoreWallet(db, '400');
    addWatchedWhale(db, '400', MOCK_WHALE);
    setCopyEnabled(db, '400', true);

    // User 2: devnet
    getOrCreateUser(db, '500', 'user2');
    createAndStoreWallet(db, '500');
    addWatchedWhale(db, '500', MOCK_WHALE);
    setCopyEnabled(db, '500', true);
    setTradeMode(db, '500', 'devnet');

    const mockConnection: any = {};
    const results = await processWhaleTrade(db, makeTrade(), undefined, mockConnection);

    expect(results.length).toBe(2);
    const dryRunResult = results.find(r => r.dryRun);
    const realResult = results.find(r => !r.dryRun);
    expect(dryRunResult).toBeTruthy();
    expect(realResult).toBeTruthy();
  });
});
