import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Connection, Keypair, VersionedTransaction, TransactionMessage, SystemProgram } from '@solana/web3.js';
import Database from 'better-sqlite3';
import { createTestDb, getOrCreateUser, setTradeMode, getTradeMode } from '../src/db';
import { createAndStoreWallet, getKeypair } from '../src/wallet-manager';
import { assertDevnetConnection, getDevnetRpcUrl, _getInFlightTrades } from '../src/trade-executor';

describe('Mainnet safety guards', () => {
  it('rejects mainnet-beta RPC URL', () => {
    const conn = new Connection('https://api.mainnet-beta.solana.com');
    expect(() => assertDevnetConnection(conn)).toThrow('SAFETY');
    expect(() => assertDevnetConnection(conn)).toThrow('mainnet');
  });

  it('rejects Helius mainnet URL', () => {
    const conn = new Connection('https://mainnet.helius-rpc.com/?api-key=abc');
    expect(() => assertDevnetConnection(conn)).toThrow('SAFETY');
  });

  it('rejects solana-mainnet pattern', () => {
    const conn = new Connection('https://solana-mainnet.g.alchemy.com/v2/key');
    expect(() => assertDevnetConnection(conn)).toThrow('SAFETY');
  });

  it('rejects mainnet rpcpool', () => {
    const conn = new Connection('https://mainnet.rpcpool.com/abc');
    expect(() => assertDevnetConnection(conn)).toThrow('SAFETY');
  });

  it('allows devnet RPC URL', () => {
    const conn = new Connection('https://api.devnet.solana.com');
    expect(() => assertDevnetConnection(conn)).not.toThrow();
  });

  it('allows Helius devnet URL', () => {
    const conn = new Connection('https://devnet.helius-rpc.com/?api-key=abc');
    expect(() => assertDevnetConnection(conn)).not.toThrow();
  });

  it('allows localhost RPC', () => {
    const conn = new Connection('http://localhost:8899');
    expect(() => assertDevnetConnection(conn)).not.toThrow();
  });
});

describe('getDevnetRpcUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns DEVNET_RPC when set', () => {
    process.env.DEVNET_RPC = 'https://api.devnet.solana.com';
    process.env.SOLANA_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=abc';
    expect(getDevnetRpcUrl()).toBe('https://api.devnet.solana.com');
  });

  it('falls back to SOLANA_RPC_URL when DEVNET_RPC not set', () => {
    delete process.env.DEVNET_RPC;
    process.env.SOLANA_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=test';
    expect(getDevnetRpcUrl()).toBe('https://devnet.helius-rpc.com/?api-key=test');
  });

  it('defaults to public devnet when neither env var set', () => {
    delete process.env.DEVNET_RPC;
    delete process.env.SOLANA_RPC_URL;
    expect(getDevnetRpcUrl()).toBe('https://api.devnet.solana.com');
  });

  it('throws if DEVNET_RPC points to mainnet', () => {
    process.env.DEVNET_RPC = 'https://api.mainnet-beta.solana.com';
    expect(() => getDevnetRpcUrl()).toThrow('SAFETY');
  });

  it('throws if SOLANA_RPC_URL points to mainnet and DEVNET_RPC not set', () => {
    delete process.env.DEVNET_RPC;
    process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
    expect(() => getDevnetRpcUrl()).toThrow('SAFETY');
  });
});

describe('executeRealTrade mainnet rejection', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '100', 'alice');
    createAndStoreWallet(db, '100');
    _getInFlightTrades().clear();
  });

  it('rejects trade when connection is mainnet', async () => {
    const { executeRealTrade } = await import('../src/trade-executor');
    const keypair = getKeypair(db, '100')!;
    const mainnetConn = new Connection('https://api.mainnet-beta.solana.com');

    await expect(
      executeRealTrade(db, mainnetConn, '100', 'WHALE', 'BUY', 'TOKEN', 0.01, 100, keypair)
    ).rejects.toThrow('SAFETY');
  });
});

describe('executeRealTrade signs transaction before sending', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '100', 'alice');
    createAndStoreWallet(db, '100');
    _getInFlightTrades().clear();
  });

  it('deserializes, signs, and sends the Jupiter swap transaction', async () => {
    const { executeRealTrade } = await import('../src/trade-executor');
    const keypair = getKeypair(db, '100')!;

    const msg = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: '11111111111111111111111111111111',
      instructions: [
        SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: keypair.publicKey, lamports: 0 }),
      ],
    }).compileToV0Message();
    const fakeTx = new VersionedTransaction(msg);
    const fakeTxBase64 = Buffer.from(fakeTx.serialize()).toString('base64');

    const mockQuote = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'TOKEN',
      inAmount: '1000',
      outAmount: '1',
      priceImpactPct: '0.1',
      routePlan: [{ some: 'route' }],
    };

    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/swap')) return { ok: true, json: async () => ({ swapTransaction: fakeTxBase64 }) } as any;
      if (urlStr.includes('/quote')) return { ok: true, json: async () => mockQuote } as any;
      return { ok: false, status: 500 } as any;
    }));

    let sentBytes: Uint8Array | null = null;
    const devnetConn: any = {
      rpcEndpoint: 'https://api.devnet.solana.com',
      sendRawTransaction: vi.fn(async (raw: Uint8Array) => {
        sentBytes = raw;
        return 'sig-abc123';
      }),
      confirmTransaction: vi.fn(async () => true),
    };

    const res = await executeRealTrade(db, devnetConn, '100', 'WHALE', 'BUY', 'TOKEN', 0.01, 100, keypair);
    expect(res.success).toBe(true);
    expect(res.dryRun).toBe(false);
    expect(sentBytes).not.toBeNull();

    const sentTx = VersionedTransaction.deserialize(sentBytes!);
    expect(sentTx.signatures.length).toBeGreaterThan(0);
    expect(sentTx.signatures[0].some((b: number) => b !== 0)).toBe(true);
  });
});

describe('Trade mode persistence', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('persists mode across getOrCreateUser calls', () => {
    getOrCreateUser(db, '100', 'alice');
    setTradeMode(db, '100', 'devnet');
    // Re-fetch user
    const user = getOrCreateUser(db, '100');
    expect(user.trade_mode).toBe('devnet');
  });

  it('defaults new users to dry-run', () => {
    const user = getOrCreateUser(db, '200', 'bob');
    expect(user.trade_mode).toBe('dry-run');
  });

  it('handles mode alias "mock" as dry-run in DB', () => {
    getOrCreateUser(db, '100', 'alice');
    // "mock" is handled at bot command level, DB only stores 'dry-run' or 'devnet'
    setTradeMode(db, '100', 'dry-run');
    expect(getTradeMode(db, '100')).toBe('dry-run');
  });
});
