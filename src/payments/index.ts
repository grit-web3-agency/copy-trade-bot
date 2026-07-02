import mockAdapter from './providers/mock';
import stripeMock from './providers/stripe-mock';
import type PaymentAdapter from './adapter';

export function isPaymentsEnabled(): boolean {
  const v = process.env.ENABLE_PAYMENTS;
  return v === '1' || v === 'true' || v === 'yes';
}

export function getPaymentProviderName(): string {
  return process.env.PAYMENT_PROVIDER || 'mock';
}

export function getPaymentAdapter(): PaymentAdapter {
  const name = getPaymentProviderName();
  switch (name) {
    case 'stripe-mock':
      return stripeMock;
    case 'mock':
    default:
      return mockAdapter;
  }
}

export default getPaymentAdapter;
<<<<<<< HEAD
=======

>>>>>>> 41c3e58 (chore: save reminder drafts and sprint report (auto))
