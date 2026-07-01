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
