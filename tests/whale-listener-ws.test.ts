import { describe, it, expect, beforeEach } from 'vitest';
import { WhaleListener, WhaleTradeEvent } from '../src/whale-listener';

describe('WhaleListener websocket parsing', () => {
  let listener: WhaleListener;
  const WHALE = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  beforeEach(() => {
    listener = new WhaleListener();
    listener.addAddress(WHALE);
  });

  describe('parseHeliusTx (via parseTransaction)', () => {
    it('detects a BUY from Helius enhanced format', () => {
      const tx = {
        signature: 'sig123',
        feePayer: WHALE,
        nativeTransfers: [
          { fromUserAccount: WHALE, toUserAccount: 'pool1', amount: 500_000_000 },
        ],
        tokenTransfers: [
          { fromUserAccount: 'pool1', toUserAccount: WHALE, mint: TOKEN, tokenAmount: 100 },
        ],
      };

      const result = listener.parseTransaction(tx);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('BUY');
      expect(result!.tokenMint).toBe(TOKEN);
      expect(result!.whaleAddress).toBe(WHALE);
      expect(result!.amountSol).toBe(0.5);
      expect(result!.signature).toBe('sig123');
    });

    it('detects a SELL from Helius enhanced format', () => {
      const tx = {
        signature: 'sig456',
        feePayer: WHALE,
        nativeTransfers: [
          { fromUserAccount: 'pool1', toUserAccount: WHALE, amount: 1_000_000_000 },
        ],
        tokenTransfers: [
          { fromUserAccount: WHALE, toUserAccount: 'pool1', mint: TOKEN, tokenAmount: 50 },
        ],
      };

      const result = listener.parseTransaction(tx);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('SELL');
      expect(result!.amountSol).toBe(1.0);
    });

    it('returns null for dust amounts', () => {
      const tx = {
        signature: 'sig789',
        feePayer: WHALE,
        nativeTransfers: [
          { fromUserAccount: WHALE, toUserAccount: 'pool1', amount: 100 }, // 0.0000001 SOL
        ],
        tokenTransfers: [
          { fromUserAccount: 'pool1', toUserAccount: WHALE, mint: TOKEN, tokenAmount: 1 },
        ],
      };

      expect(listener.parseTransaction(tx)).toBeNull();
    });

    it('returns null when no token transfers', () => {
      const tx = {
        signature: 'sig000',
        feePayer: WHALE,
        nativeTransfers: [
          { fromUserAccount: WHALE, toUserAccount: 'someone', amount: 1_000_000_000 },
        ],
        tokenTransfers: [],
      };

      expect(listener.parseTransaction(tx)).toBeNull();
    });

    it('returns null for SOL-to-SOL transfer (no token mint)', () => {
      const tx = {
        signature: 'sigSOL',
        feePayer: WHALE,
        nativeTransfers: [
          { fromUserAccount: WHALE, toUserAccount: 'someone', amount: 1_000_000_000 },
        ],
        tokenTransfers: [
          {
            fromUserAccount: 'pool',
            toUserAccount: WHALE,
            mint: 'So11111111111111111111111111111111111111112',
            tokenAmount: 1,
          },
        ],
      };

      expect(listener.parseTransaction(tx)).toBeNull();
    });
  });

  describe('parseStandardTx (via parseTransaction)', () => {
    it('detects a BUY from standard Solana tx format', () => {
      const tx = {
        signature: 'stdBuy1',
        feePayer: WHALE,
        transaction: {
          message: {
            accountKeys: [WHALE, 'pool1', 'program1'],
          },
        },
        meta: {
          preBalances: [2_000_000_000, 5_000_000_000, 0],
          postBalances: [1_500_000_000, 5_500_000_000, 0],
          preTokenBalances: [],
          postTokenBalances: [
            {
              owner: WHALE,
              mint: TOKEN,
              uiTokenAmount: { uiAmount: 100 },
            },
          ],
        },
      };

      const result = listener.parseTransaction(tx);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('BUY');
      expect(result!.tokenMint).toBe(TOKEN);
      expect(result!.amountSol).toBe(0.5);
    });

    it('detects a SELL from standard Solana tx format', () => {
      const tx = {
        signature: 'stdSell1',
        feePayer: WHALE,
        transaction: {
          message: {
            accountKeys: [WHALE, 'pool1'],
          },
        },
        meta: {
          preBalances: [1_000_000_000, 5_000_000_000],
          postBalances: [2_000_000_000, 4_000_000_000],
          preTokenBalances: [
            {
              owner: WHALE,
              mint: TOKEN,
              uiTokenAmount: { uiAmount: 200 },
            },
          ],
          postTokenBalances: [
            {
              owner: WHALE,
              mint: TOKEN,
              uiTokenAmount: { uiAmount: 100 },
            },
          ],
        },
      };

      const result = listener.parseTransaction(tx);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('SELL');
      expect(result!.amountSol).toBe(1.0);
    });

    it('returns null if meta has error', () => {
      const tx = {
        signature: 'errTx',
        feePayer: WHALE,
        transaction: { message: { accountKeys: [WHALE] } },
        meta: { err: { InstructionError: [0, 'Custom'] }, preBalances: [0], postBalances: [0] },
      };

      expect(listener.parseTransaction(tx)).toBeNull();
    });

    it('returns null if signer not in accountKeys', () => {
      const tx = {
        signature: 'noSigner',
        feePayer: WHALE,
        transaction: { message: { accountKeys: ['otherAccount'] } },
        meta: { preBalances: [0], postBalances: [0] },
      };

      expect(listener.parseTransaction(tx)).toBeNull();
    });
  });

  describe('address management with ws', () => {
    it('addAddress after start still tracks correctly', async () => {
      const newAddr = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
      await listener.start(); // no wsUrl, stub mode
      listener.addAddress(newAddr);
      expect(listener.isWatching(newAddr)).toBe(true);
      expect(listener.getWatchedAddresses()).toContain(newAddr);
      listener.stop();
    });

    it('removeAddress cleans up', () => {
      listener.removeAddress(WHALE);
      expect(listener.isWatching(WHALE)).toBe(false);
    });
  });
});
