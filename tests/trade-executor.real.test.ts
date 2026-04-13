import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, getOrCreateUser } from '../src/db';
import { createAndStoreWallet, getKeypair } from '../src/wallet-manager';
import { executeRealTrade, _getInFlightTrades } from '../src/trade-executor';
import { Keypair, VersionedTransaction, TransactionMessage, SystemProgram, PublicKey } from '@solana/web3.js';

function buildFakeSwapTxBase64(feePayer: PublicKey): string {
  const msg = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [
      SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: feePayer,
        lamports: 0,
      }),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  return Buffer.from(tx.serialize()).toString('base64');
}

const runReal = process.env.RUN_REAL_NETWORK === '1';
const realDescribe = runReal ? describe : describe.skip;
realDescribe('TradeExecutor Real (devnet) flow', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '200', 'bob');
    createAndStoreWallet(db, '200');
    _getInFlightTrades().clear();
  });

  it('posts to Jupiter swap, signs transaction, and sends via connection', async () => {
    const keypair = getKeypair(db, '200');
    expect(keypair).toBeTruthy();

    const fakeSwapTx = buildFakeSwapTxBase64(keypair!.publicKey);

    const mockQuote = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'TOKEN',
      inAmount: '1000',
      outAmount: '1',
      priceImpactPct: '0.1',
      routePlan: [{ some: 'route' }],
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/swap')) {
        return { ok: true, json: async () => ({ swapTransaction: fakeSwapTx }) } as any;
      }
      if (typeof url === 'string' && url.includes('/quote')) {
        return { ok: true, json: async () => mockQuote } as any;
      }
      return { ok: false, status: 500 } as any;
    }));

    const mockConnection: any = {
      sendRawTransaction: vi.fn(async (raw: Uint8Array) => {
        const tx = VersionedTransaction.deserialize(raw);
        expect(tx.signatures.length).toBeGreaterThan(0);
        return 'devnet-sig-' + Date.now();
      }),
      confirmTransaction: vi.fn(async () => true),
    };

    const res = await executeRealTrade(db, mockConnection, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.02, 100, keypair!);

    expect(res.success).toBe(true);
    expect(res.signature).toBeTruthy();
    expect(res.dryRun).toBe(false);

    const trades = db.prepare('SELECT * FROM trades WHERE telegram_id = ?').all('200');
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });
});
