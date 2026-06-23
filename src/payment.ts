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
export type { SubscriptionPlan } from './payments/service';
export type Subscription = service.Subscription;

export const initPaymentSchema = service.initPaymentSchema;
export const getActiveSubscription = service.getActiveSubscription;
export const getUserPlan = service.getUserPlan;
export const createSubscription = service.createSubscription;
export const formatPlansMessage = service.formatPlansMessage;

/** Return current payment mode string */
export function getPaymentMode(): PaymentMode {
  return (process.env.PAYMENT_MODE || 'mock') as PaymentMode;
}

/** Format plans listing for bot display */
export function formatPlans(): string {
  return service.formatPlansMessage();
}

/** Format subscription status for a user */
export function formatSubscriptionStatus(database: Database.Database, telegramId: string): string {
  const plan = service.getUserPlan(database, telegramId);
  const sub = service.getActiveSubscription(database, telegramId);
  if (!sub || sub.plan_id === 'free') {
    return `Current plan: *Free*`;
  }
  return `Current plan: *${plan.name}* (expires: ${sub.expires_at})`;
}

/** Check if user is within whale limit for their plan */
export function checkWhaleLimit(database: Database.Database, telegramId: string, currentCount: number): boolean {
  const plan = service.getUserPlan(database, telegramId);
  return currentCount < plan.maxWhales;
}

/** Get treasury wallet address from env */
export function getTreasuryAddress(): string {
  return process.env.TREASURY_ADDRESS || 'TREASURY_NOT_SET';
}

export async function verifyPayment(txSignature: string, expectedAmountSol: number, treasuryWallet: string): Promise<boolean> {
  if (adapter.verifyPayment) {
    return adapter.verifyPayment(txSignature, expectedAmountSol, treasuryWallet);
  }
  // Default to true in mock mode
  return true;
}

export interface ActivationResult {
  success: boolean;
  error?: string;
}

export async function activateSubscription(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<ActivationResult> {
  try {
    const ok = await adapter.activateSubscription(database, telegramId, planId, txSignature);
    if (ok) {
      return { success: true };
    }
    return { success: false, error: 'Activation returned false' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// Expose adapter utilities for tests
export const _adapter = adapter;

