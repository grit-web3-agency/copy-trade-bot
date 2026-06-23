<<<<<<< HEAD
import type { Connection } from '@solana/web3.js';

export type PaymentVerification = { valid: boolean; reason?: string };

export interface PaymentAdapter {
  // Verify an on-chain payment or provider-side event.
  // Connection may be optional for provider mocks.
  verifyPayment?(connection: Connection | undefined, txSignature: string, expectedSol: number, payerPubkey: string): Promise<PaymentVerification>;

  // Optional provider-specific webhook verification (e.g., Stripe signature checks)
  verifyWebhookPayload?(payload: unknown): Promise<{ valid: boolean; reason?: string }>;
}

export default PaymentAdapter;
=======
import Database from 'better-sqlite3';

export interface PaymentAdapter {
  // Activate a subscription for a user (creates DB entry and any provider-side setup).
  activateSubscription(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<boolean>;

  // Verify a payment (tx signature / provider-specific). Optional for adapters that don't use it.
  verifyPayment?(txSignature: string, expectedAmountSol: number, treasuryWallet: string): Promise<boolean>;

  // Utility to generate test webhook events (for mocks) — optional.
  generateTestWebhookEvent?(eventType: string, payload?: any): any;
}

export type PaymentMode = 'mock' | 'stripe';

>>>>>>> origin/dev/claude-fix-payment-tests
