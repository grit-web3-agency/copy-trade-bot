import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair, VersionedTransaction, TransactionMessage, SystemProgram, PublicKey } from '@solana/web3.js';
import Database from 'better-sqlite3';
import { createTestDb, getOrCreateUser } from '../src/db';
import { createAndStoreWallet, getKeypair } from '../src/wallet-manager';
import { executeRealTrade, _getInFlightTrades } from '../src/trade-executor';

/**
 * Helper: build a real VersionedTransaction, serialize to base64.
 * This mimics what Jupiter's /v6/swap endpoint returns.
 */
function buildFakeVersionedTx(feePayer: PublicKey): string {
  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [
      SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: feePayer, // self-transfer for test
        lamports: 1000,
      }),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  return Buffer.from(tx.serialize()).toString('base64');
}

describe('executeRealTrade with VersionedTransaction', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '200', 'bob');
    createAndStoreWallet(db, '200');
    _getInFlightTrades().clear();
  });

  it('deserializes VersionedTransaction, signs with keypair, and sends', async () => {
    const keypair = getKeypair(db, '200')!;
    expect(keypair).toBeTruthy();

    const fakeSwapTxBase64 = buildFakeVersionedTx(keypair.publicKey);

    const mockQuote = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'TOKEN',
      inAmount: '50000000',
      outAmount: '1000',
      priceImpactPct: '0.1',
      routePlan: [{ some: 'route' }],
    };

    // Mock fetch: quote endpoint + swap endpoint
    const fetchMock = vi.fn(async (url: string | URL | Request, opts?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/v6/swap')) {
        // Verify the swap body uses quoteResponse (not route)
        if (opts?.body) {
          const body = JSON.parse(opts.body);
          expect(body.quoteResponse).toBeDefined();
          expect(body.quoteResponse.inputMint).toBe(mockQuote.inputMint);
          expect(body.userPublicKey).toBe(keypair.publicKey.toBase58());
          expect(body.wrapAndUnwrapSol).toBe(true);
          // Ensure old incorrect fields are NOT sent
          expect(body.route).toBeUndefined();
          expect(body.wrapUnwrapSOL).toBeUndefined();
        }
        return {
          ok: true,
          json: async () => ({ swapTransaction: fakeSwapTxBase64 }),
        } as any;
      }
      if (urlStr.includes('/v6/quote')) {
        return { ok: true, json: async () => mockQuote } as any;
      }
      return { ok: false, status: 500 } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    // Mock connection — verify we receive a signed transaction
    const mockConnection: any = {
      rpcEndpoint: 'https://api.devnet.solana.com',
      sendRawTransaction: vi.fn(async (raw: Uint8Array, opts?: any) => {
        // Deserialize and verify it was signed
        const tx = VersionedTransaction.deserialize(raw);
        // The tx should have at least one signature that is not all zeros
        const sig = tx.signatures[0];
        const isZero = sig.every((b: number) => b === 0);
        expect(isZero).toBe(false); // Keypair actually signed it
        return 'devnet-sig-' + Date.now();
      }),
      confirmTransaction: vi.fn(async () => true),
    };

    const res = await executeRealTrade(
      db, mockConnection, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.05, 100, keypair
    );

    if (!res.success) {
      console.error('executeRealTrade failed:', res.error);
    }
    expect(res.success).toBe(true);
    expect(res.dryRun).toBe(false);
    expect(res.signature).toBeTruthy();
    expect(res.signature).toContain('devnet-sig-');
    expect(mockConnection.sendRawTransaction).toHaveBeenCalledOnce();
    expect(mockConnection.confirmTransaction).toHaveBeenCalledOnce();

    // Verify DB records
    const trades = db.prepare('SELECT * FROM trades WHERE telegram_id = ?').all('200') as any[];
    expect(trades.length).toBeGreaterThanOrEqual(1);
    const submitted = trades.find((t: any) => t.status === 'submitted');
    expect(submitted).toBeTruthy();
    expect(submitted.dry_run).toBe(0);
  });

  it('returns error when Jupiter swap response has no transaction', async () => {
    const keypair = getKeypair(db, '200')!;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/v6/swap')) {
        return { ok: true, json: async () => ({}) } as any; // No swapTransaction
      }
      if (urlStr.includes('/v6/quote')) {
        return {
          ok: true,
          json: async () => ({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: 'TOKEN',
            inAmount: '1000',
            outAmount: '1',
            priceImpactPct: '0.1',
            routePlan: [{ some: 'route' }],
          }),
        } as any;
      }
      return { ok: false, status: 500 } as any;
    }));

    const mockConnection: any = {
      rpcEndpoint: 'https://api.devnet.solana.com',
      sendRawTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
    };

    const res = await executeRealTrade(
      db, mockConnection, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.01, 100, keypair
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('missing transaction');
    expect(mockConnection.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('returns error when no Jupiter quote available', async () => {
    const keypair = getKeypair(db, '200')!;

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
    } as any)));

    const mockConnection: any = {
      rpcEndpoint: 'https://api.devnet.solana.com',
      sendRawTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
    };

    const res = await executeRealTrade(
      db, mockConnection, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.01, 100, keypair
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('No Jupiter quote');
  });

  it('blocks duplicate in-flight real trades', async () => {
    const keypair = getKeypair(db, '200')!;

    _getInFlightTrades().add('200:TOKEN:BUY');

    const mockConnection: any = {
      rpcEndpoint: 'https://api.devnet.solana.com',
    };

    const res = await executeRealTrade(
      db, mockConnection, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.01, 100, keypair
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('Duplicate trade');
  });

  it('rejects mainnet connection', async () => {
    const keypair = getKeypair(db, '200')!;

    const mainnetConn: any = {
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    };

    // assertDevnetConnection throws before the try/catch wraps it,
    // so it surfaces as a thrown error
    await expect(
      executeRealTrade(db, mainnetConn, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.01, 100, keypair)
    ).rejects.toThrow('SAFETY');
  });
});
