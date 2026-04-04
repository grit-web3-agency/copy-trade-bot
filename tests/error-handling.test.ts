import { describe, it, expect, vi } from 'vitest';
import { WhaleListener } from '../src/whale-listener';

const WHALE_ADDR = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('WhaleListener error handling', () => {
  it('parseTransaction returns null for null input', () => {
    const listener = new WhaleListener();
    expect(listener.parseTransaction(null)).toBeNull();
  });

  it('parseTransaction returns null for missing signature', () => {
    const listener = new WhaleListener();
    expect(listener.parseTransaction({ foo: 'bar' })).toBeNull();
  });

  it('parseTransaction returns null for unwatched signer', () => {
    const listener = new WhaleListener();
    listener.addAddress('SomeOtherAddress');
    const result = listener.parseTransaction({
      signature: 'sig1',
      feePayer: WHALE_ADDR,
    });
    expect(result).toBeNull();
  });

  it('parseTransaction returns event for watched signer with parsedTrade', () => {
    const listener = new WhaleListener();
    listener.addAddress(WHALE_ADDR);
    const result = listener.parseTransaction({
      signature: 'sig1',
      feePayer: WHALE_ADDR,
      parsedTrade: {
        direction: 'BUY',
        tokenMint: TOKEN_MINT,
        amountSol: 1.0,
      },
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('BUY');
    expect(result!.tokenMint).toBe(TOKEN_MINT);
  });

  it('parseTransaction returns null when parsedTrade is absent', () => {
    const listener = new WhaleListener();
    listener.addAddress(WHALE_ADDR);
    const result = listener.parseTransaction({
      signature: 'sig1',
      feePayer: WHALE_ADDR,
    });
    expect(result).toBeNull();
  });

  it('simulateTrade does not throw for unwatched address', () => {
    const listener = new WhaleListener();
    const handler = vi.fn();
    listener.on('trade', handler);

    expect(() =>
      listener.simulateTrade({
        whaleAddress: 'unknown',
        direction: 'BUY',
        tokenMint: TOKEN_MINT,
        amountSol: 1.0,
        signature: 'sig1',
        timestamp: Date.now(),
      })
    ).not.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });

  it('start is idempotent (second call is no-op)', async () => {
    const listener = new WhaleListener();
    await listener.start();
    await listener.start(); // should not throw
    expect(listener.isRunning()).toBe(true);
    listener.stop();
  });
});
