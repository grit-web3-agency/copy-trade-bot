import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkCopyPolicy, CopyPolicyConfig, processWhaleTrade } from '../src/copy-policy';
import { WhaleTradeEvent } from '../src/whale-listener';
import { createTestDb, getOrCreateUser, addWatchedWhale, setCopyEnabled } from '../src/db';
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

const MOCK_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint
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

describe('checkCopyPolicy', () => {
  const defaultConfig: CopyPolicyConfig = {
    maxTradeSizeSol: 0.1,
    slippageBps: 100,
    tokenWhitelist: null,
  };

  it('allows a valid BUY trade with no whitelist', () => {
    const result = checkCopyPolicy(makeTrade(), defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(0.05);
  });

  it('allows a valid SELL trade', () => {
    const result = checkCopyPolicy(makeTrade({ direction: 'SELL' }), defaultConfig);
    expect(result.allowed).toBe(true);
  });

  it('caps trade size to maxTradeSizeSol', () => {
    const result = checkCopyPolicy(makeTrade({ amountSol: 5.0 }), defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(0.1);
  });

  it('rejects tokens not in whitelist', () => {
    const config: CopyPolicyConfig = {
      ...defaultConfig,
      tokenWhitelist: ['SomeOtherMint111111111111111111111111111111'],
    };
    const result = checkCopyPolicy(makeTrade(), config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in whitelist');
  });

  it('allows tokens in whitelist', () => {
    const config: CopyPolicyConfig = {
      ...defaultConfig,
      tokenWhitelist: [MOCK_TOKEN],
    };
    const result = checkCopyPolicy(makeTrade(), config);
    expect(result.allowed).toBe(true);
  });

  it('rejects dust trades (< 0.001 SOL)', () => {
    const result = checkCopyPolicy(makeTrade({ amountSol: 0.0001 }), defaultConfig);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('too small');
  });

  it('rejects unknown trade directions', () => {
    const result = checkCopyPolicy(makeTrade({ direction: 'UNKNOWN' as any }), defaultConfig);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unknown trade direction');
  });
});

describe('processWhaleTrade', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('executes dry-run trade for users watching the whale', async () => {
    const user = getOrCreateUser(db, '12345', 'testuser');
    createAndStoreWallet(db, '12345');
    addWatchedWhale(db, '12345', MOCK_WHALE);
    setCopyEnabled(db, '12345', true);

    const notifications: { telegramId: string; message: string }[] = [];
    const results = await processWhaleTrade(db, makeTrade(), (tid, msg) => {
      notifications.push({ telegramId: tid, message: msg });
    });

    expect(results.length).toBe(1);
    expect(results[0].dryRun).toBe(true);
    expect(results[0].success).toBe(true);
    expect(notifications.length).toBe(1);
    expect(notifications[0].telegramId).toBe('12345');
  });

  it('skips users with copy_enabled=false', async () => {
    getOrCreateUser(db, '12345', 'testuser');
    createAndStoreWallet(db, '12345');
    addWatchedWhale(db, '12345', MOCK_WHALE);
    // copy_enabled defaults to false

    const results = await processWhaleTrade(db, makeTrade());
    expect(results.length).toBe(0);
  });

  it('skips users not watching the whale', async () => {
    getOrCreateUser(db, '12345', 'testuser');
    createAndStoreWallet(db, '12345');
    setCopyEnabled(db, '12345', true);
    // Not watching any whale

    const results = await processWhaleTrade(db, makeTrade());
    expect(results.length).toBe(0);
  });

  it('handles multiple users watching same whale', async () => {
    // User 1
    getOrCreateUser(db, '111', 'user1');
    createAndStoreWallet(db, '111');
    addWatchedWhale(db, '111', MOCK_WHALE);
    setCopyEnabled(db, '111', true);

    // User 2
    getOrCreateUser(db, '222', 'user2');
    createAndStoreWallet(db, '222');
    addWatchedWhale(db, '222', MOCK_WHALE);
    setCopyEnabled(db, '222', true);

    const results = await processWhaleTrade(db, makeTrade());
    expect(results.length).toBe(2);
  });
});
