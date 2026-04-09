import Database from 'better-sqlite3';
import { Connection } from '@solana/web3.js';
import { WhaleTradeEvent } from './whale-listener';
import { User, getUsersWatchingWhale, getTradeMode } from './db';
import { executeDryRunTrade, executeRealTrade, TradeResult } from './trade-executor';
import { getKeypair } from './wallet-manager';

export interface CopyPolicyConfig {
  maxTradeSizeSol: number;
  slippageBps: number;
  tokenWhitelist: string[] | null; // null = allow all tokens
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedAmountSol?: number;
}

// Check if a whale trade passes copy policy filters
export function checkCopyPolicy(
  trade: WhaleTradeEvent,
  config: CopyPolicyConfig
): PolicyCheckResult {
  // Filter 1: Token whitelist
  if (config.tokenWhitelist && config.tokenWhitelist.length > 0) {
    if (!config.tokenWhitelist.includes(trade.tokenMint)) {
      return { allowed: false, reason: `Token ${trade.tokenMint} not in whitelist` };
    }
  }

  // Filter 2: Max trade size
  let adjustedAmount = trade.amountSol;
  if (trade.amountSol > config.maxTradeSizeSol) {
    adjustedAmount = config.maxTradeSizeSol;
  }

  // Filter 3: Minimum trade size (avoid dust)
  if (adjustedAmount < 0.001) {
    return { allowed: false, reason: `Trade size ${adjustedAmount} SOL too small (min 0.001)` };
  }

  // Filter 4: Only BUY and SELL directions
  if (trade.direction !== 'BUY' && trade.direction !== 'SELL') {
    return { allowed: false, reason: `Unknown trade direction: ${trade.direction}` };
  }

  return {
    allowed: true,
    adjustedAmountSol: adjustedAmount,
  };
}

// Process a whale trade event: apply policy and execute for all subscribed users
export async function processWhaleTrade(
  database: Database.Database,
  trade: WhaleTradeEvent,
  notifyFn?: (telegramId: string, message: string) => void,
  connection?: Connection
): Promise<TradeResult[]> {
  const users = getUsersWatchingWhale(database, trade.whaleAddress);
  const results: TradeResult[] = [];

  for (const user of users) {
    const policyConfig: CopyPolicyConfig = {
      maxTradeSizeSol: user.max_trade_size_sol,
      slippageBps: user.slippage_bps,
      tokenWhitelist: null, // Allow all tokens for MVP
    };

    const check = checkCopyPolicy(trade, policyConfig);

    if (!check.allowed) {
      console.log(`[CopyPolicy] Blocked for user ${user.telegram_id}: ${check.reason}`);
      if (notifyFn) {
        notifyFn(user.telegram_id, `Whale trade blocked: ${check.reason}`);
      }
      continue;
    }

    const keypair = getKeypair(database, user.telegram_id);
    const mode = getTradeMode(database, user.telegram_id);

    let result: TradeResult;

    if (mode === 'devnet' && connection && keypair) {
      result = await executeRealTrade(
        database,
        connection,
        user.telegram_id,
        trade.whaleAddress,
        trade.direction,
        trade.tokenMint,
        check.adjustedAmountSol!,
        policyConfig.slippageBps,
        keypair
      );
    } else {
      result = await executeDryRunTrade(
        database,
        user.telegram_id,
        trade.whaleAddress,
        trade.direction,
        trade.tokenMint,
        check.adjustedAmountSol!,
        policyConfig.slippageBps,
        keypair || undefined
      );
    }

    results.push(result);

    if (notifyFn) {
      const modeLabel = result.dryRun ? 'dry-run' : 'devnet';
      const status = result.success ? `executed (${modeLabel})` : `failed: ${result.error}`;
      notifyFn(
        user.telegram_id,
        `Copy trade ${trade.direction} ${check.adjustedAmountSol} SOL → ${trade.tokenMint}\nMode: ${modeLabel}\nStatus: ${status}\nSig: ${result.signature}`
      );
    }
  }

  return results;
}
