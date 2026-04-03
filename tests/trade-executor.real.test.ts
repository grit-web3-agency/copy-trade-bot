import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, getOrCreateUser } from '../src/db';
import { createAndStoreWallet, getKeypair } from '../src/wallet-manager';
import { executeRealTrade, _getInFlightTrades } from '../src/trade-executor';

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

  it('posts to Jupiter swap and sends transaction via connection', async () => {
    const keypair = getKeypair(db, '200');
    expect(keypair).toBeTruthy();

    // Mock fetch for quote (first call) and swap (second call)
    const mockQuote = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'TOKEN',
      inAmount: '1000',
      outAmount: '1',
      priceImpactPct: '0.1',
      routePlan: [{ some: 'route' }],
    };

    const fakeSwapTx = Buffer.from('fake-tx-bytes').toString('base64');

    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/quote')) {
        return {
          ok: true,
          json: async () => mockQuote,
        } as any;
      }
      if (typeof url === 'string' && url.includes('/swap')) {
        return {
          ok: true,
          json: async () => ({ swapTransaction: fakeSwapTx }),
        } as any;
      }
      return { ok: false, status: 500 } as any;
    }));

    // Mock connection
    const sentSigs: string[] = [];
    const mockConnection: any = {
      sendRawTransaction: vi.fn(async (raw: Buffer) => {
        // check raw matches our fakeSwapTx bytes
        const expected = Buffer.from(fakeSwapTx, 'base64');
        expect(raw.equals(expected)).toBe(true);
        const sig = 'devnet-sig-' + Date.now();
        sentSigs.push(sig);
        return sig;
      }),
      confirmTransaction: vi.fn(async (sig: string, commitment?: any) => true),
    };

    const res = await executeRealTrade(db, mockConnection, '200', 'WHALExxx', 'BUY', 'TOKEN', 0.02, 100, keypair!);

    expect(res.success).toBe(true);
    expect(res.signature).toBeTruthy();

    const trades = db.prepare('SELECT * FROM trades WHERE telegram_id = ?').all('200');
    // Should have at least one trade recorded (pending + submitted)
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });
});
