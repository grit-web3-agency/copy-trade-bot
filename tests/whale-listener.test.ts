import { describe, it, expect, vi } from 'vitest';
import { WhaleListener, WhaleTradeEvent } from '../src/whale-listener';

const WHALE_ADDR = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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
