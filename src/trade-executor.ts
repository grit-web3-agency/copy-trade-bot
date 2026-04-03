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
