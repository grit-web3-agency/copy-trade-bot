import type { PaymentAdapter, PaymentVerification } from '../adapter';
import type { Connection } from '@solana/web3.js';

const mockAdapter: PaymentAdapter = {
  async verifyPayment(_connection: Connection | undefined, _txSignature: string, _expectedSol: number, _payerPubkey: string) {
    // Mock provider: always return valid. Useful for tests and local development.
    return { valid: true } as PaymentVerification;
  },
};

export default mockAdapter;
<<<<<<< HEAD
=======

>>>>>>> 41c3e58 (chore: save reminder drafts and sprint report (auto))
