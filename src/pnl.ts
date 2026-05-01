import Database from 'better-sqlite3';
import {
  Trade,
  PnlSnapshot,
  getPnlSnapshots,
  getRecentTrades,
  upsertPnlSnapshot,
} from './db';

// --- Price feed (mocked for devnet) ---

export interface TokenPrice {
  mint: string;
  priceUsd: number;
}

// Jupiter Price API v2 (free, no key needed)
const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v2';

export async function fetchTokenPrice(mint: string): Promise<number | null> {
  try {
    const resp = await fetch(`${JUPITER_PRICE_URL}?ids=${mint}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { data?: Record<string, { price?: string }> };
    const price = data?.data?.[mint]?.price;
    return price ? parseFloat(price) : null;
  } catch {
    return null;
  }
}

export async function fetchTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (mints.length === 0) return prices;

  try {
    const ids = mints.join(',');
    const resp = await fetch(`${JUPITER_PRICE_URL}?ids=${ids}`);
    if (!resp.ok) return prices;
    const data = (await resp.json()) as { data?: Record<string, { price?: string }> };
    if (data?.data) {
      for (const [mint, info] of Object.entries(data.data)) {
        if (info?.price) {
          prices.set(mint, parseFloat(info.price));
        }
      }
    }
  } catch {
    // Return whatever we have
  }
  return prices;
}

// --- PnL computation ---

export interface PositionSummary {
  tokenMint: string;
  quantityHeld: number;
  avgEntryPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  currentPrice: number | null;
}

export interface PnlSummary {
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  positions: PositionSummary[];
}

/**
 * Recompute PnL snapshots for a user from their trade history.
 * Uses average cost basis method:
 * - BUY: increases position, adjusts avg entry price
 * - SELL: decreases position, realizes PnL based on difference between sell price and avg entry
 */
export function recomputePnlFromTrades(
  database: Database.Database,
  telegramId: string
): Map<string, { realizedPnl: number; avgEntryPrice: number; quantityHeld: number }> {
  const trades = database.prepare(
    `SELECT * FROM trades WHERE telegram_id = ? AND executed_price IS NOT NULL AND quantity IS NOT NULL ORDER BY id ASC`
  ).all(telegramId) as Trade[];

  // Group by token
  const positions = new Map<string, { realizedPnl: number; avgEntryPrice: number; quantityHeld: number; totalCost: number }>();

  for (const trade of trades) {
    const price = trade.executed_price!;
    const qty = trade.quantity!;
    const fees = trade.fees ?? 0;

    let pos = positions.get(trade.token_mint);
    if (!pos) {
      pos = { realizedPnl: 0, avgEntryPrice: 0, quantityHeld: 0, totalCost: 0 };
      positions.set(trade.token_mint, pos);
    }

    if (trade.direction === 'BUY') {
      // Add to position with cost basis tracking
      const newTotalCost = pos.totalCost + (price * qty) + fees;
      const newQty = pos.quantityHeld + qty;
      pos.avgEntryPrice = newQty > 0 ? newTotalCost / newQty : 0;
      pos.quantityHeld = newQty;
      pos.totalCost = newTotalCost;
    } else if (trade.direction === 'SELL') {
      // Realize PnL on sold quantity
      const sellQty = Math.min(qty, pos.quantityHeld);
      if (sellQty > 0) {
        const sellRevenue = price * sellQty - fees;
        const costBasis = pos.avgEntryPrice * sellQty;
        pos.realizedPnl += sellRevenue - costBasis;
        pos.quantityHeld -= sellQty;
        pos.totalCost = pos.avgEntryPrice * pos.quantityHeld;
      }
    }
  }

  // Persist snapshots
  for (const [mint, pos] of positions) {
    upsertPnlSnapshot(database, telegramId, mint, pos.realizedPnl, pos.avgEntryPrice, pos.quantityHeld);
  }

  // Return without totalCost (internal detail)
  const result = new Map<string, { realizedPnl: number; avgEntryPrice: number; quantityHeld: number }>();
  for (const [mint, pos] of positions) {
    result.set(mint, { realizedPnl: pos.realizedPnl, avgEntryPrice: pos.avgEntryPrice, quantityHeld: pos.quantityHeld });
  }
  return result;
}

/**
 * Get full PnL summary for a user, including unrealized PnL from current prices.
 * Uses a price fetcher function (injectable for testing).
 */
export async function getPnlSummary(
  database: Database.Database,
  telegramId: string,
  priceFetcher: (mints: string[]) => Promise<Map<string, number>> = fetchTokenPrices
): Promise<PnlSummary> {
  // Recompute from trades
  const computed = recomputePnlFromTrades(database, telegramId);

  // Get current prices for held tokens
  const heldMints = Array.from(computed.entries())
    .filter(([, pos]) => pos.quantityHeld > 0)
    .map(([mint]) => mint);

  const currentPrices = await priceFetcher(heldMints);

  const positions: PositionSummary[] = [];
  let totalRealized = 0;
  let totalUnrealized = 0;

  for (const [mint, pos] of computed) {
    const currentPrice = currentPrices.get(mint) ?? null;
    let unrealizedPnl = 0;

    if (pos.quantityHeld > 0 && currentPrice !== null) {
      const currentValue = currentPrice * pos.quantityHeld;
      const costBasis = pos.avgEntryPrice * pos.quantityHeld;
      unrealizedPnl = currentValue - costBasis;
    }

    totalRealized += pos.realizedPnl;
    totalUnrealized += unrealizedPnl;

    positions.push({
      tokenMint: mint,
      quantityHeld: pos.quantityHeld,
      avgEntryPrice: pos.avgEntryPrice,
      realizedPnl: pos.realizedPnl,
      unrealizedPnl,
      currentPrice,
    });
  }

  return {
    totalRealizedPnl: totalRealized,
    totalUnrealizedPnl: totalUnrealized,
    totalPnl: totalRealized + totalUnrealized,
    positions,
  };
}

/**
 * Format PnL summary for Telegram display.
 */
export function formatPnlMessage(summary: PnlSummary, recentTrades: Trade[]): string {
  const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(4);

  let msg = `📊 *PnL Summary*\n\n`;
  msg += `Realized: \`${sign(summary.totalRealizedPnl)} SOL\`\n`;
  msg += `Unrealized: \`${sign(summary.totalUnrealizedPnl)} SOL\`\n`;
  msg += `Total: \`${sign(summary.totalPnl)} SOL\`\n`;

  if (summary.positions.length > 0) {
    msg += `\n*Positions:*\n`;
    for (const pos of summary.positions) {
      const mintShort = pos.tokenMint.slice(0, 6) + '...' + pos.tokenMint.slice(-4);
      if (pos.quantityHeld > 0) {
        const priceStr = pos.currentPrice !== null ? pos.currentPrice.toFixed(6) : 'N/A';
        msg += `• \`${mintShort}\`: ${pos.quantityHeld.toFixed(4)} qty @ avg ${pos.avgEntryPrice.toFixed(6)} | now ${priceStr} | PnL: ${sign(pos.realizedPnl + pos.unrealizedPnl)}\n`;
      } else if (pos.realizedPnl !== 0) {
        msg += `• \`${mintShort}\`: closed | realized: ${sign(pos.realizedPnl)}\n`;
      }
    }
  }

  if (recentTrades.length > 0) {
    msg += `\n*Last ${recentTrades.length} trades:*\n`;
    for (const t of recentTrades) {
      const mintShort = t.token_mint.slice(0, 6) + '...' + t.token_mint.slice(-4);
      const priceStr = t.executed_price !== null ? `@ ${t.executed_price.toFixed(6)}` : '';
      const mode = t.dry_run ? 'dry' : 'live';
      msg += `• ${t.direction} \`${mintShort}\` ${t.amount_sol ?? 0} SOL ${priceStr} [${mode}]\n`;
    }
  }

  if (summary.positions.length === 0 && recentTrades.length === 0) {
    msg += `\nNo trades recorded yet. Start copy trading to see your PnL!`;
  }

  return msg;
}
