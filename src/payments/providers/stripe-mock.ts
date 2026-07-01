import type { PaymentAdapter } from '../adapter';

// A lightweight Stripe-style mock adapter. It simulates a provider that may
// verify payments using webhooks; for on-chain verification it can still
// accept tx signatures (here we simply accept signatures that start with "stripe-").
const stripeMock: PaymentAdapter = {
  async activateSubscription(_database, _telegramId, _planId, _txSignature) {
    return true;
  },
  async verifyPayment(txSignature: string, _expectedSol: number, _treasuryWallet: string) {
    if (typeof txSignature === 'string' && txSignature.startsWith('stripe-')) {
      return true;
    }
    return false;
  },
};

export default stripeMock;
