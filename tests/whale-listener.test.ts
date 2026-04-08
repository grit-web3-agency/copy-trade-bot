import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhaleListener, WhaleTradeEvent, WebSocketProvider } from '../src/whale-listener';

const WHALE_ADDR = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

describe('WhaleListener', () => {
  it('adds and removes watched addresses', () => {
    const listener = new WhaleListener();
    listener.addAddress(WHALE_ADDR);
    expect(listener.isWatching(WHALE_ADDR)).toBe(true);

    listener.removeAddress(WHALE_ADDR);
    expect(listener.isWatching(WHALE_ADDR)).toBe(false);
  });

  it('emits trade events for watched addresses', () => {
    const listener = new WhaleListener();
    listener.addAddress(WHALE_ADDR);

    const handler = vi.fn();
    listener.on('trade', handler);

    const event: WhaleTradeEvent = {
      whaleAddress: WHALE_ADDR,
      direction: 'BUY',
      tokenMint: TOKEN_MINT,
      amountSol: 1.5,
      signature: 'sig123',
      timestamp: Date.now(),
    };

    listener.simulateTrade(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not emit events for unwatched addresses', () => {
    const listener = new WhaleListener();
    // Not adding the address

    const handler = vi.fn();
    listener.on('trade', handler);

    listener.simulateTrade({
      whaleAddress: WHALE_ADDR,
      direction: 'BUY',
      tokenMint: TOKEN_MINT,
      amountSol: 1.5,
      signature: 'sig123',
      timestamp: Date.now(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('starts and stops correctly', async () => {
    const listener = new WhaleListener();
    expect(listener.isRunning()).toBe(false);
    await listener.start();
    expect(listener.isRunning()).toBe(true);
    listener.stop();
    expect(listener.isRunning()).toBe(false);
  });
});

describe('WhaleListener parseTransaction', () => {
  let listener: WhaleListener;

  beforeEach(() => {
    listener = new WhaleListener();
    listener.addAddress(WHALE_ADDR);
  });

  it('returns null for missing signature', () => {
    expect(listener.parseTransaction({})).toBeNull();
    expect(listener.parseTransaction(null)).toBeNull();
    expect(listener.parseTransaction(undefined)).toBeNull();
  });

  it('returns null for unwatched signer', () => {
    const result = listener.parseTransaction({
      signature: 'abc123',
      feePayer: 'SomeOtherAddress',
    });
    expect(result).toBeNull();
  });

  it('parses pre-parsed trade events (BUY)', () => {
    const result = listener.parseTransaction({
      signature: 'txSig1',
      feePayer: WHALE_ADDR,
      parsedTrade: {
        direction: 'BUY',
        tokenMint: TOKEN_MINT,
        amountSol: 2.5,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.whaleAddress).toBe(WHALE_ADDR);
    expect(result!.direction).toBe('BUY');
    expect(result!.tokenMint).toBe(TOKEN_MINT);
    expect(result!.amountSol).toBe(2.5);
    expect(result!.signature).toBe('txSig1');
  });

  it('parses pre-parsed trade events (SELL)', () => {
    const result = listener.parseTransaction({
      signature: 'txSig2',
      signer: WHALE_ADDR,
      parsedTrade: {
        direction: 'SELL',
        tokenMint: TOKEN_MINT,
        amountSol: 0.5,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('SELL');
    expect(result!.amountSol).toBe(0.5);
  });

  it('parses Helius enhanced tx format (BUY — SOL decreases)', () => {
    const result = listener.parseTransaction({
      signature: 'heliusTx1',
      feePayer: WHALE_ADDR,
      transaction: {
        message: {
          instructions: [{ programId: JUPITER_PROGRAM }],
        },
      },
      meta: {
        preBalances: [5_000_000_000], // 5 SOL
        postBalances: [3_000_000_000], // 3 SOL (spent 2 SOL)
        postTokenBalances: [
          { owner: WHALE_ADDR, mint: TOKEN_MINT, uiTokenAmount: { uiAmountString: '100' } },
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('BUY');
    expect(result!.amountSol).toBe(2);
    expect(result!.tokenMint).toBe(TOKEN_MINT);
  });

  it('parses Helius enhanced tx format (SELL — SOL increases)', () => {
    const result = listener.parseTransaction({
      signature: 'heliusTx2',
      feePayer: WHALE_ADDR,
      transaction: {
        message: {
          instructions: [{ programId: JUPITER_PROGRAM }],
        },
      },
      meta: {
        preBalances: [3_000_000_000],
        postBalances: [5_000_000_000], // gained 2 SOL
        postTokenBalances: [
          { owner: WHALE_ADDR, mint: TOKEN_MINT, uiTokenAmount: { uiAmountString: '0' } },
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('SELL');
    expect(result!.amountSol).toBe(2);
  });

  it('returns null for non-DEX transaction', () => {
    const result = listener.parseTransaction({
      signature: 'nonDex',
      feePayer: WHALE_ADDR,
      transaction: {
        message: {
          instructions: [{ programId: 'SomeRandomProgram' }],
        },
      },
      meta: {
        preBalances: [5_000_000_000],
        postBalances: [3_000_000_000],
        postTokenBalances: [
          { owner: WHALE_ADDR, mint: TOKEN_MINT, uiTokenAmount: { uiAmountString: '100' } },
        ],
      },
    });

    expect(result).toBeNull();
  });

  it('returns null for dust-level SOL change', () => {
    const result = listener.parseTransaction({
      signature: 'dustTx',
      feePayer: WHALE_ADDR,
      transaction: {
        message: {
          instructions: [{ programId: JUPITER_PROGRAM }],
        },
      },
      meta: {
        preBalances: [5_000_000_000],
        postBalances: [4_999_999_000], // ~0.000001 SOL change (dust)
        postTokenBalances: [
          { owner: WHALE_ADDR, mint: TOKEN_MINT, uiTokenAmount: { uiAmountString: '100' } },
        ],
      },
    });

    expect(result).toBeNull();
  });

  it('parses token balance changes (fallback heuristic)', () => {
    const result = listener.parseTransaction({
      signature: 'balChangeTx',
      feePayer: WHALE_ADDR,
      meta: {
        preBalances: [5_000_000_000],
        postBalances: [3_500_000_000],
        preTokenBalances: [
          { owner: WHALE_ADDR, mint: TOKEN_MINT, uiTokenAmount: { uiAmountString: '0' } },
        ],
        postTokenBalances: [
          { owner: WHALE_ADDR, mint: TOKEN_MINT, uiTokenAmount: { uiAmountString: '500' } },
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('BUY');
    expect(result!.amountSol).toBe(1.5);
  });
});

describe('WhaleListener websocket integration', () => {
  it('connects via injectable WebSocketProvider and processes messages', async () => {
    const handlers: Record<string, Function> = {};
    const mockProvider: WebSocketProvider = {
      connect: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
    };

    const listener = new WhaleListener(() => mockProvider);
    listener.addAddress(WHALE_ADDR);

    const tradeHandler = vi.fn();
    listener.on('trade', tradeHandler);

    await listener.start('wss://fake-helius.example.com');
    expect(mockProvider.connect).toHaveBeenCalledWith('wss://fake-helius.example.com');

    // Simulate 'open' event → should send subscription
    handlers['open']!();
    expect(mockProvider.send).toHaveBeenCalled();
    const sentMsg = JSON.parse((mockProvider.send as any).mock.calls[0][0]);
    expect(sentMsg.method).toBe('transactionSubscribe');
    expect(sentMsg.params[0].accountInclude).toContain(WHALE_ADDR);

    // Simulate incoming websocket message with a pre-parsed trade
    const wsMessage = JSON.stringify({
      params: {
        result: {
          signature: 'wsTx1',
          feePayer: WHALE_ADDR,
          parsedTrade: {
            direction: 'BUY',
            tokenMint: TOKEN_MINT,
            amountSol: 3.0,
          },
        },
      },
    });

    handlers['message']!(wsMessage);
    expect(tradeHandler).toHaveBeenCalledTimes(1);
    expect(tradeHandler.mock.calls[0][0].direction).toBe('BUY');
    expect(tradeHandler.mock.calls[0][0].amountSol).toBe(3.0);

    listener.stop();
    expect(mockProvider.close).toHaveBeenCalled();
    expect(listener.isRunning()).toBe(false);
  });

  it('handles malformed websocket messages gracefully', async () => {
    const handlers: Record<string, Function> = {};
    const mockProvider: WebSocketProvider = {
      connect: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
    };

    const listener = new WhaleListener(() => mockProvider);
    listener.addAddress(WHALE_ADDR);

    const tradeHandler = vi.fn();
    listener.on('trade', tradeHandler);

    await listener.start('wss://fake.example.com');
    handlers['open']!();

    // Send malformed JSON
    handlers['message']!('not valid json {{{');
    expect(tradeHandler).not.toHaveBeenCalled();

    // Send valid JSON but no params.result
    handlers['message']!(JSON.stringify({ id: 1, result: 'ok' }));
    expect(tradeHandler).not.toHaveBeenCalled();

    listener.stop();
  });
});
