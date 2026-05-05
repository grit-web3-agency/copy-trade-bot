import type { PaymentAdapter, PaymentVerification } from '../adapter';
import type { Connection } from '@solana/web3.js';

// A lightweight Stripe-style mock adapter. It simulates a provider that may
// verify payments using webhooks; for on-chain verification it can still
// accept tx signatures (here we simply accept signatures that start with "stripe-").
const stripeMock: PaymentAdapter = {
  async verifyPayment(_connection: Connection | undefined, txSignature: string, _expectedSol: number, _payerPubkey: string) {
    if (typeof txSignature === 'string' && txSignature.startsWith('stripe-')) {
      return { valid: true } as PaymentVerification;
    }
    return { valid: false, reason: 'stripe-mock: invalid signature format' } as PaymentVerification;
  },

  async verifyWebhookPayload(payload: unknown) {
    // Very small simulation: accept payloads that have a field provider === 'stripe-mock'
    try {
      const p = payload as Record<string, any>;
      if (p && p.provider === 'stripe-mock') return { valid: true };
      return { valid: false, reason: 'invalid stripe-mock webhook payload' };
    } catch (err: any) {
      return { valid: false, reason: String(err) };
    }
  },
};

export default stripeMock;
