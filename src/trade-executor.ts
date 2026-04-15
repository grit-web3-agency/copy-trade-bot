import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { recordTrade } from './db';
import { withRetry } from './retry';
import Database from 'better-sqlite3';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: any[];
}

export interface TradeResult {
  success: boolean;
  signature: string | null;
  quote: SwapQuote | null;
  error?: string;
  dryRun: boolean;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_URL = 'https://quote-api.jup.ag/v6/swap';

// Mainnet RPC patterns that must NEVER be used for real trades
const MAINNET_PATTERNS = [
  'mainnet-beta',
  'mainnet.helius',
  'api.mainnet-beta.solana.com',
  'solana-mainnet',
  'mainnet.rpcpool',
];

// Validate that a Connection is pointing at devnet, not mainnet
export function assertDevnetConnection(connection: Connection): void {
  const endpoint = connection.rpcEndpoint.toLowerCase();
  for (const pattern of MAINNET_PATTERNS) {
    if (endpoint.includes(pattern)) {
      throw new Error(
        `SAFETY: Refusing to trade on mainnet RPC (${connection.rpcEndpoint}). ` +
        `This bot is devnet-only. Set DEVNET_RPC to a devnet endpoint.`
      );
    }
  }
}

// Get the devnet RPC URL from environment with safety validation
export function getDevnetRpcUrl(): string {
  const devnetRpc = process.env.DEVNET_RPC || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const lower = devnetRpc.toLowerCase();
  for (const pattern of MAINNET_PATTERNS) {
    if (lower.includes(pattern)) {
      throw new Error(
        `SAFETY: DEVNET_RPC / SOLANA_RPC_URL points to mainnet (${devnetRpc}). ` +
        `This bot is devnet-only. Use a devnet endpoint.`
      );
    }
  }
  return devnetRpc;
}

// In-flight trades set to prevent double-spend (keyed by "telegramId:tokenMint:direction")
const inFlightTrades = new Set<string>();

function tradeKey(telegramId: string, tokenMint: string, direction: string): string {
  return `${telegramId}:${tokenMint}:${direction}`;
}

// Get a swap quote from Jupiter with retry
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number
): Promise<SwapQuote | null> {
  try {
    return await withRetry(
      async () => {
        const params = new URLSearchParams({
          inputMint,
          outputMint,
          amount: amountLamports.toString(),
          slippageBps: slippageBps.toString(),
        });

        const response = await fetch(`${JUPITER_QUOTE_URL}?${params}`);
        if (!response.ok) {
          const msg = `Jupiter quote failed: ${response.status}`;
          console.log(`[TradeExecutor] ${msg}`);
          throw new Error(msg);
        }
        return await response.json() as SwapQuote;
      },
      {
        maxRetries: 3,
        baseDelayMs: 500,
        onRetry: (attempt, err) => {
          console.warn(`[TradeExecutor] Jupiter quote retry ${attempt}: ${err}`);
        },
      }
    );
  } catch (err) {
    console.log(`[TradeExecutor] Jupiter quote error after retries: ${err}`);
    return null;
  }
}

// Execute a dry-run trade (get quote, sign but do NOT send)
export async function executeDryRunTrade(
  database: Database.Database,
  telegramId: string,
  whaleAddress: string,
  direction: 'BUY' | 'SELL',
  tokenMint: string,
  amountSol: number,
  slippageBps: number,
  keypair?: Keypair
): Promise<TradeResult> {
  const key = tradeKey(telegramId, tokenMint, direction);

  // Double-spend guard: reject if same trade is already in-flight
  if (inFlightTrades.has(key)) {
    console.warn(`[TradeExecutor] Duplicate trade blocked: ${key}`);
    return {
      success: false,
      signature: null,
      quote: null,
      dryRun: true,
      error: 'Duplicate trade already in-flight',
    };
  }

  inFlightTrades.add(key);
  try {
    const amountLamports = Math.floor(amountSol * 1e9);

    const inputMint = direction === 'BUY' ? SOL_MINT : tokenMint;
    const outputMint = direction === 'BUY' ? tokenMint : SOL_MINT;

    // Get Jupiter quote
    const quote = await getJupiterQuote(inputMint, outputMint, amountLamports, slippageBps);

    // Record trade in DB regardless of quote success
    const dryRunSig = `dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const trade = recordTrade(
      database,
      telegramId,
      whaleAddress,
      direction,
      tokenMint,
      amountSol,
      dryRunSig,
      quote ? 'dry-run-quoted' : 'dry-run-no-quote',
      true
    );

    if (!quote) {
      return {
        success: true,
        signature: dryRunSig,
        quote: null,
        dryRun: true,
        error: 'No Jupiter quote available (expected in devnet mode)',
      };
    }

    console.log(`[TradeExecutor] DRY-RUN ${direction} ${amountSol} SOL → ${tokenMint}`);
    console.log(`[TradeExecutor] Quote: in=${quote.inAmount} out=${quote.outAmount} impact=${quote.priceImpactPct}%`);

    return {
      success: true,
      signature: dryRunSig,
      quote,
      dryRun: true,
    };
  } catch (err: any) {
    console.error('[TradeExecutor] executeDryRunTrade error:', err?.message || err);
    const dryRunSig = `dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      recordTrade(database, telegramId, whaleAddress, direction, tokenMint, amountSol, dryRunSig, 'dry-run-error', true);
    } catch (e) {
      console.error('[TradeExecutor] Failed to record trade after error:', e);
    }
    return {
      success: false,
      signature: null,
      quote: null,
      dryRun: true,
      error: (err && err.message) || String(err),
    };
  } finally {
    inFlightTrades.delete(key);
  }
}

// Exposed for testing
export function _getInFlightTrades(): Set<string> {
  return inFlightTrades;
}

// Execute a real trade on devnet using Jupiter swap endpoint.
export async function executeRealTrade(
  database: Database.Database,
  connection: Connection,
  telegramId: string,
  whaleAddress: string,
  direction: 'BUY' | 'SELL',
  tokenMint: string,
  amountSol: number,
  slippageBps: number,
  keypair: Keypair
): Promise<TradeResult> {
  // SAFETY: reject mainnet connections before doing anything
  assertDevnetConnection(connection);

  const key = tradeKey(telegramId, tokenMint, direction);

  if (inFlightTrades.has(key)) {
    console.warn(`[TradeExecutor] Duplicate trade blocked: ${key}`);
    return {
      success: false,
      signature: null,
      quote: null,
      dryRun: false,
      error: 'Duplicate trade already in-flight',
    };
  }

  inFlightTrades.add(key);
  try {
    const amountLamports = Math.floor(amountSol * 1e9);

    const inputMint = direction === 'BUY' ? SOL_MINT : tokenMint;
    const outputMint = direction === 'BUY' ? tokenMint : SOL_MINT;

    const quote = await getJupiterQuote(inputMint, outputMint, amountLamports, slippageBps);


    // Record pending trade
    recordTrade(database, telegramId, whaleAddress, direction, tokenMint, amountSol, null, 'pending', false);

    if (!quote || !quote.routePlan || quote.routePlan.length === 0) {
      // No route available
      // Update trade as failed
      recordTrade(database, telegramId, whaleAddress, direction, tokenMint, amountSol, null, 'no-quote', false);
      return {
        success: false,
        signature: null,
        quote: null,
        dryRun: false,
        error: 'No Jupiter quote / route available',
      };
    }

    // Call Jupiter swap endpoint with full quoteResponse (V6 API requirement)
    const swapBody = {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    };

    const swapResp = await withRetry(async () => {
      const resp = await fetch(JUPITER_SWAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Jupiter swap failed: ${resp.status} ${body}`);
      }
      return (await resp.json()) as Record<string, unknown>;
    }, { maxRetries: 3, baseDelayMs: 500 });

    // Jupiter returns a base64 serialized VersionedTransaction
    const swapTxBase64 = (swapResp?.swapTransaction || swapResp?.serializedTransaction) as string | undefined;
    if (!swapTxBase64) {
      return {
        success: false,
        signature: null,
        quote,
        dryRun: false,
        error: 'Jupiter swap response missing transaction',
      };
    }

    // Deserialize as VersionedTransaction, sign with user keypair, then send
    const txBuf = Buffer.from(swapTxBase64, 'base64');
    const versionedTx = VersionedTransaction.deserialize(txBuf);
    versionedTx.sign([keypair]);

    const raw = versionedTx.serialize();

    const sig = await withRetry(async () => {
      return await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 2,
      });
    }, { maxRetries: 3, baseDelayMs: 500 });

    // Optionally confirm
    try {
      await connection.confirmTransaction(sig, 'finalized');
    } catch (e) {
      console.warn('[TradeExecutor] confirmTransaction failed:', e);
    }

    // Update DB with signature
    recordTrade(database, telegramId, whaleAddress, direction, tokenMint, amountSol, sig, 'submitted', false);

    return {
      success: true,
      signature: sig,
      quote,
      dryRun: false,
    };
  } catch (err: any) {
    console.error('[TradeExecutor] executeRealTrade error:', err?.message || err);
    recordTrade(database, telegramId, whaleAddress, direction, tokenMint, amountSol, null, 'error', false);
    return {
      success: false,
      signature: null,
      quote: null,
      dryRun: false,
      error: (err && err.message) || String(err),
    };
  } finally {
    inFlightTrades.delete(key);
  }
}
