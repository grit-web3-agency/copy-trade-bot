import type { Connection } from '@solana/web3.js';
import Database from 'better-sqlite3';

// Payment verification result used by legacy/on-chain adapters
export type PaymentVerification = { valid: boolean; reason?: string };

// Payment mode selector
export type PaymentMode = 'mock' | 'stripe';

// Flexible PaymentAdapter interface that supports both legacy on-chain
// verification signatures (used by providers in src/payments/providers)
// and the newer server-side adapter shape (activateSubscription, verifyPayment).
export interface PaymentAdapter {
  // Legacy-style: on-chain verification. Some adapters accept a Connection
  // and return a detailed PaymentVerification object.
  verifyPayment?(
    connection: Connection | undefined,
    txSignature: string,
    expectedSol: number,
    payerPubkey: string
  ): Promise<PaymentVerification>;

  // Newer-style: verify by txSignature/amount against a treasury wallet; returns boolean.
  // Adapters may implement either this or the legacy form.
  verifyPaymentTx?(txSignature: string, expectedAmountSol: number, treasuryWallet: string): Promise<boolean>;

  // Activate a subscription for a user (creates DB entry and any provider-side setup).
  activateSubscription?(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<boolean>;

  // Optional provider-specific webhook verification (e.g., Stripe signature checks)
  verifyWebhookPayload?(payload: unknown): Promise<{ valid: boolean; reason?: string }>;

  // Optional: generate test webhook events for mock adapters
  generateTestWebhookEvent?(eventType: string, payload?: any): any;
}

export default PaymentAdapter;
