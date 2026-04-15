import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestDb, getOrCreateUser, setCopyEnabled, addWatchedWhale, getTradesForUser } from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';
import { processWhaleTrade } from '../src/copy-policy';
import { WhaleTradeEvent } from '../src/whale-listener';
import Database from 'better-sqlite3';

describe('devnet trade flow (dry-run)', () => {
  let db: Database.Database;
  const telegramId = 'flow-user-1';
  const whaleAddr = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
  const tokenMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, telegramId, 'testuser');
    createAndStoreWallet(db, telegramId);
    setCopyEnabled(db, telegramId, true);
    addWatchedWhale(db, telegramId, whaleAddr);
  });

  it('executes dry-run trade when live trading is disabled', async () => {
    const trade: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'BUY',
      tokenMint,
      amountSol: 0.05,
      signature: 'whale-tx-123',
    };

    const results = await processWhaleTrade(db, trade, undefined, {
      enableLiveTrading: false,
    });

    expect(results).toHaveLength(1);
    expect(results[0].dryRun).toBe(true);
    expect(results[0].success).toBe(true);

    const trades = getTradesForUser(db, telegramId);
    expect(trades.length).toBeGreaterThanOrEqual(1);
    expect(trades[0].dry_run).toBe(1);
  });

  it('executes dry-run by default when no options provided', async () => {
    const trade: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'SELL',
      tokenMint,
      amountSol: 0.02,
      signature: 'whale-tx-456',
    };

    const results = await processWhaleTrade(db, trade);

    expect(results).toHaveLength(1);
    expect(results[0].dryRun).toBe(true);
  });

  it('caps trade to user max_trade_size_sol', async () => {
    const trade: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'BUY',
      tokenMint,
      amountSol: 999,
      signature: 'whale-tx-big',
    };

    const notifications: string[] = [];
    const results = await processWhaleTrade(db, trade, (id, msg) => {
      notifications.push(msg);
    });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const trades = getTradesForUser(db, telegramId);
    expect(trades[0].amount_sol).toBeLessThanOrEqual(0.1);
  });

  it('blocks dust trades below minimum', async () => {
    const trade: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'BUY',
      tokenMint,
      amountSol: 0.0001,
      signature: 'whale-tx-dust',
    };

    const notifications: string[] = [];
    const results = await processWhaleTrade(db, trade, (id, msg) => {
      notifications.push(msg);
    });

    expect(results).toHaveLength(0);
    expect(notifications[0]).toContain('blocked');
  });

  it('notifies user with trade status', async () => {
    const trade: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'BUY',
      tokenMint,
      amountSol: 0.05,
      signature: 'whale-tx-notify',
    };

    const notifications: { id: string; msg: string }[] = [];
    await processWhaleTrade(db, trade, (id, msg) => {
      notifications.push({ id, msg });
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe(telegramId);
    expect(notifications[0].msg).toContain('dry-run');
  });

  it('skips users who have copy disabled', async () => {
    setCopyEnabled(db, telegramId, false);

    const trade: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'BUY',
      tokenMint,
      amountSol: 0.05,
      signature: 'whale-tx-disabled',
    };

    const results = await processWhaleTrade(db, trade);
    expect(results).toHaveLength(0);
  });
});
