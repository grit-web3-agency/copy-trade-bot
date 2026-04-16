import Database from 'better-sqlite3';
import { getTradesForUser, getTradesSummaryByToken, TradeWithQuote } from './db';

export interface TokenPnL {
  tokenMint: string;
  buyCount: number;
  sellCount: number;
  totalBuySol: number;
  totalSellSol: number;
  netSol: number; // positive = profit, negative = loss (sell - buy)
  openPosition: boolean; // true if buys > sells
}

export interface PnLSummary {
  totalTrades: number;
  totalBuySol: number;
  totalSellSol: number;
  netPnlSol: number;
  tokens: TokenPnL[];
  lastTradeAt: string | null;
}

export function calculatePnL(database: Database.Database, telegramId: string): PnLSummary {
  const tokenSummaries = getTradesSummaryByToken(database, telegramId);
  const allTrades = getTradesForUser(database, telegramId);

  const tokens: TokenPnL[] = tokenSummaries.map(t => {
    const netSol = t.total_sell_sol - t.total_buy_sol;
    return {
      tokenMint: t.token_mint,
      buyCount: t.buy_count,
      sellCount: t.sell_count,
      totalBuySol: t.total_buy_sol,
      totalSellSol: t.total_sell_sol,
      netSol,
      openPosition: t.buy_count > t.sell_count,
    };
  });

  const totalBuySol = tokens.reduce((sum, t) => sum + t.totalBuySol, 0);
  const totalSellSol = tokens.reduce((sum, t) => sum + t.totalSellSol, 0);

  return {
    totalTrades: allTrades.length,
    totalBuySol,
    totalSellSol,
    netPnlSol: totalSellSol - totalBuySol,
    tokens,
    lastTradeAt: allTrades.length > 0 ? allTrades[0].created_at : null,
  };
}

export function formatPnLMessage(summary: PnLSummary): string {
  if (summary.totalTrades === 0) {
    return 'No trades recorded yet. Start copy trading with /copy on';
  }

  const sign = summary.netPnlSol >= 0 ? '+' : '';
  let msg = `PnL Summary\n` +
    `${'─'.repeat(20)}\n` +
    `Total trades: ${summary.totalTrades}\n` +
    `Total bought: ${summary.totalBuySol.toFixed(4)} SOL\n` +
    `Total sold: ${summary.totalSellSol.toFixed(4)} SOL\n` +
    `Net PnL: ${sign}${summary.netPnlSol.toFixed(4)} SOL\n`;

  if (summary.tokens.length > 0) {
    msg += `\nPer token:\n`;
    for (const t of summary.tokens) {
      const tSign = t.netSol >= 0 ? '+' : '';
      const status = t.openPosition ? ' (open)' : '';
      const shortMint = t.tokenMint.length > 8
        ? `${t.tokenMint.slice(0, 4)}...${t.tokenMint.slice(-4)}`
        : t.tokenMint;
      msg += `  ${shortMint}: ${t.buyCount}B/${t.sellCount}S ${tSign}${t.netSol.toFixed(4)} SOL${status}\n`;
    }
  }

  if (summary.lastTradeAt) {
    msg += `\nLast trade: ${summary.lastTradeAt}`;
  }

  return msg;
}
