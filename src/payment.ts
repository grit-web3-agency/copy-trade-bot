import Database from 'better-sqlite3';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getActiveSubscription,
  createSubscription,
  deactivateSubscriptions,
  getWallet,
  recordPaymentEvent,
} from './db';
import type { Subscription } from './db';

export type PaymentMode = 'mock' | 'live';

export function getPaymentMode(): PaymentMode {
  const mode = process.env.PAYMENT_MODE || 'mock';
  return mode === 'live' ? 'live' : 'mock';
}

export interface Plan {
  id: string;
  name: string;
  priceSol: number;
  durationDays: number;
  maxWhales: number;
  maxTradesPerDay: number;
  description: string;
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceSol: 0,
    durationDays: 0,
    maxWhales: 1,
    maxTradesPerDay: 5,
    description: 'Watch 1 whale, 5 copy-trades/day',
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    priceSol: 0.1,
    durationDays: 30,
    maxWhales: 5,
    maxTradesPerDay: 50,
    description: 'Watch 5 whales, 50 copy-trades/day',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceSol: 0.5,
    durationDays: 30,
    maxWhales: 20,
    maxTradesPerDay: -1,
    description: 'Watch 20 whales, unlimited copy-trades/day',
  },
};

const TREASURY_PUBKEY = process.env.TREASURY_WALLET || 'CopyTradeTreasury111111111111111111111111111';

export function getTreasuryAddress(): string {
  return TREASURY_PUBKEY;
}

export function getUserPlan(db: Database.Database, telegramId: string): Plan {
  const sub = getActiveSubscription(db, telegramId);
  if (!sub || !PLANS[sub.plan]) return PLANS.free;
  return PLANS[sub.plan];
}

export function checkWhaleLimit(db: Database.Database, telegramId: string, currentWhaleCount: number): { allowed: boolean; limit: number } {
  const plan = getUserPlan(db, telegramId);
  return {
    allowed: currentWhaleCount < plan.maxWhales,
    limit: plan.maxWhales,
  };
}

export function checkDailyTradeLimit(db: Database.Database, telegramId: string): { allowed: boolean; limit: number; used: number } {
  const plan = getUserPlan(db, telegramId);
  if (plan.maxTradesPerDay === -1) return { allowed: true, limit: -1, used: 0 };

  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM trades
    WHERE telegram_id = ? AND created_at > datetime('now', '-1 day')
  `).get(telegramId) as { cnt: number };

  return {
    allowed: row.cnt < plan.maxTradesPerDay,
    limit: plan.maxTradesPerDay,
    used: row.cnt,
  };
}

export interface PaymentVerification {
  valid: boolean;
  reason?: string;
}

export async function verifyPayment(
  connection: Connection,
  txSignature: string,
  expectedSol: number,
  payerPubkey: string,
): Promise<PaymentVerification> {
  try {
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, reason: 'Transaction not found. It may not be confirmed yet.' };
    }

    if (tx.meta?.err) {
      return { valid: false, reason: 'Transaction failed on-chain.' };
    }

    const instructions = tx.transaction.message.instructions;
    let transferFound = false;
    const treasuryAddr = getTreasuryAddress();

    for (const ix of instructions) {
      if ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (
          info.destination === treasuryAddr &&
          info.source === payerPubkey &&
          info.lamports >= Math.floor(expectedSol * LAMPORTS_PER_SOL)
        ) {
          transferFound = true;
          break;
        }
      }
    }

    if (!transferFound) {
      return { valid: false, reason: 'No matching SOL transfer to treasury found in transaction.' };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `Verification error: ${err?.message || err}` };
  }
}

export async function activateSubscription(
  db: Database.Database,
  telegramId: string,
  planId: string,
  txSignature: string | null,
  connection?: Connection,
): Promise<{ success: boolean; subscription?: Subscription; error?: string }> {
  const plan = PLANS[planId];
  if (!plan) {
    return { success: false, error: `Unknown plan: ${planId}` };
  }

  if (planId === 'free') {
    deactivateSubscriptions(db, telegramId);
    const sub = createSubscription(db, telegramId, 'free', null, 0, 365 * 100);
    recordPaymentEvent(db, telegramId, 'subscription_activated', 'free', 0, null, 'completed');
    return { success: true, subscription: sub };
  }

  if (!txSignature) {
    return { success: false, error: 'Transaction signature required for paid plans.' };
  }

  const wallet = getWallet(db, telegramId);
  if (!wallet) {
    return { success: false, error: 'No wallet found. Use /start first.' };
  }

  const mode = getPaymentMode();

  if (mode === 'live' && connection) {
    const verification = await verifyPayment(connection, txSignature, plan.priceSol, wallet.public_key);
    if (!verification.valid) {
      recordPaymentEvent(db, telegramId, 'payment_failed', planId, plan.priceSol, txSignature, 'failed', { reason: verification.reason });
      return { success: false, error: verification.reason };
    }
  }

  deactivateSubscriptions(db, telegramId);
  const sub = createSubscription(db, telegramId, planId, txSignature, plan.priceSol, plan.durationDays);
  recordPaymentEvent(db, telegramId, 'subscription_activated', planId, plan.priceSol, txSignature, 'completed', { mode });
  console.log(`[Payment] Subscription activated: user=${telegramId} plan=${planId} mode=${mode}`);
  return { success: true, subscription: sub };
}

export function formatPlans(): string {
  const lines = Object.values(PLANS).map(p => {
    const price = p.priceSol === 0 ? 'Free' : `${p.priceSol} SOL/month`;
    return `*${p.name}* — ${price}\n  ${p.description}`;
  });
  return lines.join('\n\n');
}

export function formatSubscriptionStatus(db: Database.Database, telegramId: string): string {
  const sub = getActiveSubscription(db, telegramId);
  const plan = getUserPlan(db, telegramId);

  if (!sub || sub.plan === 'free') {
    return `Plan: *Free*\nLimits: ${plan.maxWhales} whale, ${plan.maxTradesPerDay} trades/day`;
  }

  const expires = sub.expires_at ? sub.expires_at.split('T')[0] : 'never';
  const trades = plan.maxTradesPerDay === -1 ? 'unlimited' : `${plan.maxTradesPerDay}`;
  return (
    `Plan: *${plan.name}*\n` +
    `Expires: ${expires}\n` +
    `Limits: ${plan.maxWhales} whales, ${trades} trades/day`
  );
}
