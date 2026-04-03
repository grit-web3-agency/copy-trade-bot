import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { recordTrade } from './db';
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

// Get a swap quote from Jupiter (works on mainnet API, dry-run only)
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number
): Promise<SwapQuote | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountLamports.toString(),
      slippageBps: slippageBps.toString(),
    });

    const response = await fetch(`${JUPITER_QUOTE_URL}?${params}`);
    if (!response.ok) {
      console.log(`[TradeExecutor] Jupiter quote failed: ${response.status}`);
      return null;
    }
    return await response.json() as SwapQuote;
  } catch (err) {
    console.log(`[TradeExecutor] Jupiter quote error: ${err}`);
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

    // In production: build swap transaction, sign with keypair, and submit
    // For MVP dry-run: we just record the quote
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
  }
}
