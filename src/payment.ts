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

export async function verifyPayment(txSignature: string, expectedAmountSol: number, treasuryWallet: string): Promise<boolean> {
  if (adapter.verifyPayment) {
    return adapter.verifyPayment(txSignature, expectedAmountSol, treasuryWallet);
  }
  // Default to true in mock mode
  return true;
}

export async function activateSubscription(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<boolean> {
  // If payments are disabled, still allow mock activation
  return adapter.activateSubscription(database, telegramId, planId, txSignature);
}

// Expose adapter utilities for tests
export const _adapter = adapter;

