import type { PaymentAdapter } from '../adapter';

const mockAdapter: PaymentAdapter = {
  async activateSubscription(_database, _telegramId, _planId, _txSignature) {
    return true;
  },
  async verifyPayment(_txSignature: string, _expectedSol: number, _treasuryWallet: string) {
    // Mock provider: always return valid. Useful for tests and local development.
    return true;
  },
};

export default mockAdapter;
