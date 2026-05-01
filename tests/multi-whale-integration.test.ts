import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb,
  getOrCreateUser,
  addWatchedWhale,
  removeWatchedWhale,
  getWatchedWhales,
  setCopyEnabled,
  getUsersWatchingWhale,
  isWhaleWatchedByAnyone,
  getAllWatchedAddresses,
} from '../src/db';
import { WhaleListener, WhaleTradeEvent } from '../src/whale-listener';
import { processWhaleTrade } from '../src/copy-policy';

const WHALE_1 = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const WHALE_2 = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const WHALE_3 = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const TOKEN_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_B = 'So11111111111111111111111111111111111111112';

describe('Multi-whale integration: mocked websocket events', () => {
  let db: Database.Database;
  let listener: WhaleListener;

  beforeEach(() => {
    db = createTestDb();
    listener = new WhaleListener();

    // Setup users
    getOrCreateUser(db, '100', 'alice');
    getOrCreateUser(db, '200', 'bob');
    getOrCreateUser(db, '300', 'carol');
    setCopyEnabled(db, '100', true);
    setCopyEnabled(db, '200', true);
    setCopyEnabled(db, '300', true);
  });

  it('full flow: multiple users watch multiple whales, receive trade events', async () => {
    // Alice watches whale 1 and 2
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '100', WHALE_2);

    // Bob watches whale 1 only
    addWatchedWhale(db, '200', WHALE_1);

    // Carol watches whale 2 and 3
    addWatchedWhale(db, '300', WHALE_2);
    addWatchedWhale(db, '300', WHALE_3);

    // Load all addresses into listener (like index.ts does)
    const addresses = getAllWatchedAddresses(db);
    listener.batchSubscribe(addresses);

    expect(listener.getWatchedAddresses().length).toBe(3);

    // Collect trade events
    const events: WhaleTradeEvent[] = [];
    listener.on('trade', (event: WhaleTradeEvent) => {
      events.push(event);
    });

    // Simulate whale 1 buys token A
    listener.simulateTrade({
      whaleAddress: WHALE_1,
      direction: 'BUY',
      tokenMint: TOKEN_A,
      amountSol: 5.0,
      signature: 'ws_sig_1',
      timestamp: Date.now(),
    });

    // Simulate whale 2 sells token A
    listener.simulateTrade({
      whaleAddress: WHALE_2,
      direction: 'SELL',
      tokenMint: TOKEN_A,
      amountSol: 3.0,
      signature: 'ws_sig_2',
      timestamp: Date.now(),
    });

    // Simulate whale 3 buys token A
    listener.simulateTrade({
      whaleAddress: WHALE_3,
      direction: 'BUY',
      tokenMint: TOKEN_A,
      amountSol: 1.5,
      signature: 'ws_sig_3',
      timestamp: Date.now(),
    });

    expect(events.length).toBe(3);

    // Verify whale 1 trade => watched by alice + bob
    const usersForWhale1 = getUsersWatchingWhale(db, WHALE_1);
    expect(usersForWhale1.length).toBe(2);
    expect(usersForWhale1.map(u => u.telegram_id).sort()).toEqual(['100', '200']);

    // Verify whale 2 trade => watched by alice + carol
    const usersForWhale2 = getUsersWatchingWhale(db, WHALE_2);
    expect(usersForWhale2.length).toBe(2);
    expect(usersForWhale2.map(u => u.telegram_id).sort()).toEqual(['100', '300']);

    // Verify whale 3 trade => watched by carol only
    const usersForWhale3 = getUsersWatchingWhale(db, WHALE_3);
    expect(usersForWhale3.length).toBe(1);
    expect(usersForWhale3[0].telegram_id).toBe('300');
  });

  it('unwatch removes user from trade dispatch without affecting others', () => {
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '200', WHALE_1);
    listener.batchSubscribe([WHALE_1]);

    // Alice unwatches
    removeWatchedWhale(db, '100', WHALE_1);

    // Whale is still watched by bob
    expect(isWhaleWatchedByAnyone(db, WHALE_1)).toBe(true);

    const users = getUsersWatchingWhale(db, WHALE_1);
    expect(users.length).toBe(1);
    expect(users[0].telegram_id).toBe('200');

    // Listener still has the address (bob still watches)
    expect(listener.isWatching(WHALE_1)).toBe(true);
  });

  it('unwatch by last user removes address from listener', () => {
    addWatchedWhale(db, '100', WHALE_1);
    listener.batchSubscribe([WHALE_1]);

    removeWatchedWhale(db, '100', WHALE_1);

    // No one watches anymore
    expect(isWhaleWatchedByAnyone(db, WHALE_1)).toBe(false);

    // Simulate what bot.ts /unwatch does
    if (!isWhaleWatchedByAnyone(db, WHALE_1)) {
      listener.removeAddress(WHALE_1);
    }

    expect(listener.isWatching(WHALE_1)).toBe(false);

    // Events from this whale should not emit
    const handler = vi.fn();
    listener.on('trade', handler);
    listener.simulateTrade({
      whaleAddress: WHALE_1,
      direction: 'BUY',
      tokenMint: TOKEN_A,
      amountSol: 1.0,
      signature: 'no_emit',
      timestamp: Date.now(),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('mocked Helius WS messages: multi-whale tx parsing', () => {
    listener.batchSubscribe([WHALE_1, WHALE_2]);

    const events: WhaleTradeEvent[] = [];
    listener.on('trade', (e: WhaleTradeEvent) => events.push(e));

    // Simulate Helius-format WS message for whale 1
    const tx1 = {
      signature: 'helius_sig_1',
      feePayer: WHALE_1,
      nativeTransfers: [
        { fromUserAccount: WHALE_1, toUserAccount: 'raydium_pool', amount: 2_000_000_000 },
      ],
      tokenTransfers: [
        { fromUserAccount: 'raydium_pool', toUserAccount: WHALE_1, mint: TOKEN_A, tokenAmount: 5000 },
      ],
    };
    const parsed1 = listener.parseTransaction(tx1);
    expect(parsed1).not.toBeNull();
    expect(parsed1!.direction).toBe('BUY');
    expect(parsed1!.whaleAddress).toBe(WHALE_1);
    expect(parsed1!.amountSol).toBe(2.0);

    // Emit it
    listener.simulateTrade(parsed1!);

    // Simulate Helius-format WS message for whale 2
    const tx2 = {
      signature: 'helius_sig_2',
      feePayer: WHALE_2,
      nativeTransfers: [
        { fromUserAccount: 'raydium_pool', toUserAccount: WHALE_2, amount: 3_000_000_000 },
      ],
      tokenTransfers: [
        { fromUserAccount: WHALE_2, toUserAccount: 'raydium_pool', mint: TOKEN_A, tokenAmount: 8000 },
      ],
    };
    const parsed2 = listener.parseTransaction(tx2);
    expect(parsed2).not.toBeNull();
    expect(parsed2!.direction).toBe('SELL');
    expect(parsed2!.whaleAddress).toBe(WHALE_2);
    expect(parsed2!.amountSol).toBe(3.0);

    listener.simulateTrade(parsed2!);

    expect(events.length).toBe(2);
    expect(events[0].direction).toBe('BUY');
    expect(events[1].direction).toBe('SELL');
  });

  it('processWhaleTrade dispatches to correct users per whale', async () => {
    // Alice and Bob watch whale 1
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '200', WHALE_1);
    // Carol watches whale 2
    addWatchedWhale(db, '300', WHALE_2);

    const notifications: { telegramId: string; message: string }[] = [];
    const notifyFn = (telegramId: string, message: string) => {
      notifications.push({ telegramId, message });
    };

    // Whale 1 trade — should notify alice + bob
    const trade1: WhaleTradeEvent = {
      whaleAddress: WHALE_1,
      direction: 'BUY',
      tokenMint: TOKEN_A,
      amountSol: 1.0,
      signature: 'process_sig_1',
      timestamp: Date.now(),
    };
    await processWhaleTrade(db, trade1, notifyFn);

    // Both alice and bob should get notified
    const whale1Notifs = notifications.filter(n =>
      n.telegramId === '100' || n.telegramId === '200'
    );
    expect(whale1Notifs.length).toBe(2);

    notifications.length = 0; // reset

    // Whale 2 trade — should notify carol only
    const trade2: WhaleTradeEvent = {
      whaleAddress: WHALE_2,
      direction: 'SELL',
      tokenMint: TOKEN_A,
      amountSol: 0.5,
      signature: 'process_sig_2',
      timestamp: Date.now(),
    };
    await processWhaleTrade(db, trade2, notifyFn);

    expect(notifications.length).toBe(1);
    expect(notifications[0].telegramId).toBe('300');
  });

  it('watch command flow: dynamic add propagates to listener', () => {
    // Simulate what /watch command does
    addWatchedWhale(db, '100', WHALE_1);
    listener.addAddress(WHALE_1);

    addWatchedWhale(db, '100', WHALE_2);
    listener.addAddress(WHALE_2);

    expect(listener.getWatchedAddresses().length).toBe(2);

    // Later, add a third whale
    addWatchedWhale(db, '100', WHALE_3);
    listener.addAddress(WHALE_3);

    expect(listener.getWatchedAddresses().length).toBe(3);

    const handler = vi.fn();
    listener.on('trade', handler);

    // All three should emit
    for (const [i, whale] of [WHALE_1, WHALE_2, WHALE_3].entries()) {
      listener.simulateTrade({
        whaleAddress: whale,
        direction: 'BUY',
        tokenMint: TOKEN_A,
        amountSol: 1.0,
        signature: `dynamic_sig_${i}`,
        timestamp: Date.now(),
      });
    }

    expect(handler).toHaveBeenCalledTimes(3);
  });
});
