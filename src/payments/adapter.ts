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
