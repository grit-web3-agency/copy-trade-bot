import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, getOrCreateUser, getWallet, recordTrade } from '../src/db';
import { createAndStoreWallet, getKeypair, getBalance } from '../src/wallet-manager';
import { WhaleListener, WhaleTradeEvent } from '../src/whale-listener';
import { executeDryRunTrade } from '../src/trade-executor';

describe('wallet + listener integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('full flow: create user → create wallet → listener detects trade → dry-run executes', async () => {
    // 1. Create user and wallet
    const user = getOrCreateUser(db, 'integ1', 'integUser');
    const pubkey = createAndStoreWallet(db, 'integ1');
    expect(pubkey).toBeTruthy();

    // Verify wallet is stored and keypair can be recovered
    const kp = getKeypair(db, 'integ1');
    expect(kp).not.toBeNull();
    expect(kp!.publicKey.toBase58()).toBe(pubkey);

    // 2. Set up listener and watch a whale
    const listener = new WhaleListener();
    const whaleAddr = 'WhaleAddr111111111111111111111111111111111';
    listener.addAddress(whaleAddr);

    // 3. Capture trade event from listener
    const tradePromise = new Promise<WhaleTradeEvent>((resolve) => {
      listener.on('trade', resolve);
    });

    const tradeEvent: WhaleTradeEvent = {
      whaleAddress: whaleAddr,
      direction: 'BUY',
      tokenMint: 'TokenMint11111111111111111111111111111111',
      amountSol: 0.05,
      signature: 'sig-integration-test',
      timestamp: Date.now(),
    };

    listener.simulateTrade(tradeEvent);
    const received = await tradePromise;
    expect(received.whaleAddress).toBe(whaleAddr);
    expect(received.direction).toBe('BUY');

    // 4. Execute dry-run trade using the wallet keypair
    const result = await executeDryRunTrade(
      db,
      'integ1',
      whaleAddr,
      received.direction,
      received.tokenMint,
      received.amountSol,
      100, // slippage bps
      kp!,
    );

    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.signature).toContain('dry-run-');
  });

  it('wallet balance retrieval with mocked connection', async () => {
    getOrCreateUser(db, 'integ2', 'balanceUser');
    const pubkey = createAndStoreWallet(db, 'integ2');
    const mockConnection = {
      getBalance: vi.fn().mockResolvedValue(1_000_000_000), // 1 SOL
    } as any;

    const balance = await getBalance(mockConnection, pubkey);
    expect(balance).toBeCloseTo(1.0);
  });

  it('listener ignores trades for unwatched addresses', () => {
    const listener = new WhaleListener();
    listener.addAddress('WatchedAddr11111111111111111111111111111111');

    const handler = vi.fn();
    listener.on('trade', handler);

    listener.simulateTrade({
      whaleAddress: 'UnwatchedAddr1111111111111111111111111111',
      direction: 'SELL',
      tokenMint: 'Mint111111111111111111111111111111111111111',
      amountSol: 1.0,
      signature: 'sig-unwatched',
      timestamp: Date.now(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple users watching same whale each get their own wallet', () => {
    getOrCreateUser(db, 'user-a', 'alice');
    getOrCreateUser(db, 'user-b', 'bob');

    const pkA = createAndStoreWallet(db, 'user-a');
    const pkB = createAndStoreWallet(db, 'user-b');

    expect(pkA).not.toBe(pkB);

    const kpA = getKeypair(db, 'user-a');
    const kpB = getKeypair(db, 'user-b');
    expect(kpA!.publicKey.toBase58()).toBe(pkA);
    expect(kpB!.publicKey.toBase58()).toBe(pkB);
  });
});
