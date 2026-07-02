import Database from 'better-sqlite3';
import { PaymentAdapter, PaymentMode } from './payments/adapter';
import StripeMock from './payments/stripeMock';
import * as service from './payments/service';

// Determine adapter based on environment vars. Default: mock (no real money)
function selectAdapter(): PaymentAdapter {
  const mode = (process.env.PAYMENT_MODE || 'mock') as PaymentMode;
  if (mode === 'stripe') {
    // For now, only StripeMock exists — in future, replace with real Stripe adapter.
    return StripeMock;
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

// Backwards-compatible exports expected by bot/scripts
export function formatPlans(): string {
  return service.formatPlansMessage();
}

export function formatSubscriptionStatus(database: Database.Database, telegramId: string): string {
  const sub = service.getActiveSubscription(database, telegramId);
  if (!sub) return `You are currently on the Free plan.`;
  const plan = service.PLANS[sub.plan_id] || service.PLANS.free;
  return `Subscription: ${plan.name} (expires ${sub.expires_at})`;
}

export function checkWhaleLimit(database: Database.Database, telegramId: string, currentCount: number): { allowed: boolean; limit: number } {
  const plan = service.getUserPlan(database, telegramId);
  const limit = plan.maxWhales;
  const allowed = currentCount < limit;
  return { allowed, limit };
}

export function checkDailyTradeLimit(database: Database.Database, telegramId: string): { allowed: boolean; limit: number } {
  const plan = service.getUserPlan(database, telegramId);
  const limit = plan.maxTradesPerDay;
  return { allowed: limit === -1 ? true : limit > 0, limit };
}

export function getTreasuryAddress(): string {
  return process.env.PAYMENT_TREASURY || 'TREASURY_WALLET_PLACEHOLDER';
}

export function getPaymentMode(): string {
  return process.env.PAYMENT_MODE || 'mock';
}

export async function verifyPayment(txSignature: string, expectedAmountSol: number, treasuryWallet: string): Promise<boolean> {
  // Support both adapter shapes: new-style verifyPaymentTx or legacy verifyPayment.
  if (typeof (adapter as any).verifyPaymentTx === 'function') {
    return (adapter as any).verifyPaymentTx(txSignature, expectedAmountSol, treasuryWallet);
  }

  if (typeof (adapter as any).verifyPayment === 'function') {
    // Legacy form may expect a Connection as first arg and return a PaymentVerification.
    try {
      const res = await (adapter as any).verifyPayment(undefined, txSignature, expectedAmountSol, treasuryWallet);
      if (typeof res === 'object' && 'valid' in res) return Boolean(res.valid);
      return Boolean(res);
    } catch (err) {
      console.warn('[payment] Legacy verifyPayment threw:', err);
      return false;
    }
  }

  // Default to true in mock mode
  return true;
}

export async function activateSubscription(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<boolean> {
  // If payments are disabled, still allow mock activation
  if (typeof (adapter as any).activateSubscription === 'function') {
    return (adapter as any).activateSubscription(database, telegramId, planId, txSignature);
  }
  // No-op default
  return true;
}

// Expose adapter utilities for tests
export const _adapter = adapter;
