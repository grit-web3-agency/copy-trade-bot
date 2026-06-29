import { describe, it, expect, beforeEach } from 'vitest';
import { getPaymentAdapter, getPaymentProviderName, isPaymentsEnabled } from '../src/payments';

beforeEach(() => {
  process.env.ENABLE_PAYMENTS = 'true';
});

describe('Payment adapter selection', () => {
  it('selects mock adapter by default', () => {
    delete process.env.PAYMENT_PROVIDER;
    const name = getPaymentProviderName();
    expect(name).toBe('mock');
    const adapter = getPaymentAdapter();
    expect(adapter).toBeTruthy();
    // mock adapter should have verifyPayment
    expect(typeof (adapter as any).verifyPayment).toBe('function');
  });

  it('selects stripe-mock when configured', () => {
    process.env.PAYMENT_PROVIDER = 'stripe-mock';
    const name = getPaymentProviderName();
    expect(name).toBe('stripe-mock');
    const adapter = getPaymentAdapter();
    expect(adapter).toBeTruthy();
  });

  it('paymentsEnabled respects env flag', () => {
    process.env.ENABLE_PAYMENTS = 'false';
    expect(isPaymentsEnabled()).toBe(false);
    process.env.ENABLE_PAYMENTS = '1';
    expect(isPaymentsEnabled()).toBe(true);
  });
});
