import Database from 'better-sqlite3';
<<<<<<< HEAD
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getActiveSubscription,
  createSubscription,
  deactivateSubscriptions,
  getWallet,
  recordPaymentEvent,
} from './db';
import type { Subscription } from './db';
import { getPaymentAdapter, isPaymentsEnabled, getPaymentProviderName } from './payments';

export type PaymentMode = 'mock' | 'live';

export function getPaymentMode(): PaymentMode {
  // Backwards-compatible: map PAYMENT_PROVIDER to a simple mode
  const provider = process.env.PAYMENT_PROVIDER || 'mock';
  return provider === 'live' ? 'live' : 'mock';
}

export function paymentsEnabled(): boolean {
  return isPaymentsEnabled();
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
=======
import { PaymentAdapter, PaymentMode } from './payments/adapter';
import StripeMock from './payments/stripeMock';
import * as service from './payments/service';

// Determine adapter based on environment vars. Default: mock (no real money)
function selectAdapter(): PaymentAdapter {
  const mode = (process.env.PAYMENT_MODE || 'mock') as PaymentMode;
  if (mode === 'stripe') {
    // For now, only StripeMock exists — in future, replace with real Stripe adapter.
    return StripeMock;
>>>>>>> origin/dev/claude-fix-payment-tests
  }
  return StripeMock;
}

const adapter = selectAdapter();

export const PLANS = service.PLANS;
export type Subscription = service.Subscription;

export const initPaymentSchema = service.initPaymentSchema;
export const getActiveSubscription = service.getActiveSubscription;
export const getUserPlan = service.getUserPlan;
export const createSubscription = service.createSubscription;
export const formatPlansMessage = service.formatPlansMessage;

export async function verifyPayment(txSignature: string, expectedAmountSol: number, treasuryWallet: string): Promise<boolean> {
  if (adapter.verifyPayment) {
    return adapter.verifyPayment(txSignature, expectedAmountSol, treasuryWallet);
  }
<<<<<<< HEAD

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

  const providerName = getPaymentProviderName();
  const enabled = isPaymentsEnabled();

  if (!enabled) {
    // Payments feature disabled by config
    return { success: false, error: 'Payments are disabled (ENABLE_PAYMENTS not set)' };
  }

  const adapter = getPaymentAdapter();
  if (adapter && adapter.verifyPayment) {
    const verification = await adapter.verifyPayment(connection, txSignature, plan.priceSol, wallet.public_key);
    if (!verification.valid) {
      recordPaymentEvent(db, telegramId, 'payment_failed', planId, plan.priceSol, txSignature, 'failed', { reason: verification.reason, provider: providerName });
      return { success: false, error: verification.reason };
    }
  }

  deactivateSubscriptions(db, telegramId);
  const sub = createSubscription(db, telegramId, planId, txSignature, plan.priceSol, plan.durationDays);
  recordPaymentEvent(db, telegramId, 'subscription_activated', planId, plan.priceSol, txSignature, 'completed', { provider: providerName });
  console.log(`[Payment] Subscription activated: user=${telegramId} plan=${planId} provider=${providerName}`);
  return { success: true, subscription: sub };
=======
  // Default to true in mock mode
  return true;
>>>>>>> origin/dev/claude-fix-payment-tests
}

export async function activateSubscription(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<boolean> {
  // If payments are disabled, still allow mock activation
  return adapter.activateSubscription(database, telegramId, planId, txSignature);
}

// Expose adapter utilities for tests
export const _adapter = adapter;

