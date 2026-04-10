import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  getOrCreateUser,
  getActiveSubscription,
  createSubscription,
  deactivateSubscriptions,
  recordPaymentEvent,
  getPaymentHistory,
  updatePaymentEventStatus,
} from '../src/db';
import { createAndStoreWallet } from '../src/wallet-manager';
import {
  PLANS,
  getUserPlan,
  checkWhaleLimit,
  checkDailyTradeLimit,
  activateSubscription,
  formatPlans,
  formatSubscriptionStatus,
  getTreasuryAddress,
  getPaymentMode,
} from '../src/payment';
import {
  validateWebhookPayload,
  handlePaymentWebhook,
  getWebhookHistory,
} from '../src/api/payments/webhook';
import type { WebhookPayload } from '../src/api/payments/webhook';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  getOrCreateUser(db, '100', 'alice');
  createAndStoreWallet(db, '100');
  getOrCreateUser(db, '200', 'bob');
});

describe('Plan definitions', () => {
  it('has free, basic, and pro plans', () => {
    expect(PLANS.free).toBeDefined();
    expect(PLANS.basic).toBeDefined();
    expect(PLANS.pro).toBeDefined();
  });

  it('free plan has 0 SOL price', () => {
    expect(PLANS.free.priceSol).toBe(0);
  });

  it('pro plan has unlimited trades', () => {
    expect(PLANS.pro.maxTradesPerDay).toBe(-1);
  });
});

describe('Subscription DB operations', () => {
  it('creates a subscription', () => {
    const sub = createSubscription(db, '100', 'basic', 'sig123', 0.1, 30);
    expect(sub.plan).toBe('basic');
    expect(sub.tx_signature).toBe('sig123');
    expect(sub.paid_sol).toBe(0.1);
    expect(sub.active).toBe(1);
  });

  it('retrieves active subscription', () => {
    createSubscription(db, '100', 'pro', 'sig456', 0.5, 30);
    const active = getActiveSubscription(db, '100');
    expect(active).toBeDefined();
    expect(active!.plan).toBe('pro');
  });

  it('returns undefined when no subscription', () => {
    const active = getActiveSubscription(db, '200');
    expect(active).toBeUndefined();
  });

  it('deactivates old subscriptions', () => {
    createSubscription(db, '100', 'basic', 'sig1', 0.1, 30);
    deactivateSubscriptions(db, '100');
    const active = getActiveSubscription(db, '100');
    expect(active).toBeUndefined();
  });

  it('deactivate then create new subscription works', () => {
    createSubscription(db, '100', 'basic', 'sig1', 0.1, 30);
    deactivateSubscriptions(db, '100');
    createSubscription(db, '100', 'pro', 'sig2', 0.5, 30);
    const active = getActiveSubscription(db, '100');
    expect(active).toBeDefined();
    expect(active!.plan).toBe('pro');
  });
});

describe('getUserPlan', () => {
  it('returns free plan for users without subscription', () => {
    const plan = getUserPlan(db, '100');
    expect(plan.id).toBe('free');
  });

  it('returns correct plan for subscribed user', () => {
    createSubscription(db, '100', 'pro', 'sig', 0.5, 30);
    const plan = getUserPlan(db, '100');
    expect(plan.id).toBe('pro');
  });
});

describe('checkWhaleLimit', () => {
  it('allows watching whales within free plan limit', () => {
    const result = checkWhaleLimit(db, '100', 0);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(1);
  });

  it('blocks watching beyond free plan limit', () => {
    const result = checkWhaleLimit(db, '100', 1);
    expect(result.allowed).toBe(false);
  });

  it('allows more whales with pro plan', () => {
    createSubscription(db, '100', 'pro', 'sig', 0.5, 30);
    const result = checkWhaleLimit(db, '100', 15);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
  });
});

describe('checkDailyTradeLimit', () => {
  it('allows trades within free plan limit', () => {
    const result = checkDailyTradeLimit(db, '100');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.used).toBe(0);
  });

  it('returns unlimited for pro plan', () => {
    createSubscription(db, '100', 'pro', 'sig', 0.5, 30);
    const result = checkDailyTradeLimit(db, '100');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });
});

describe('activateSubscription', () => {
  it('activates free plan without tx signature', async () => {
    const result = await activateSubscription(db, '100', 'free', null);
    expect(result.success).toBe(true);
    expect(result.subscription!.plan).toBe('free');
  });

  it('rejects unknown plan', async () => {
    const result = await activateSubscription(db, '100', 'diamond', null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown plan');
  });

  it('requires tx signature for paid plans', async () => {
    const result = await activateSubscription(db, '100', 'basic', null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Transaction signature required');
  });

  it('activates paid plan with tx signature (no connection = skip verification)', async () => {
    // Without connection, verification is skipped (for dry-run/testing)
    const result = await activateSubscription(db, '100', 'basic', 'fakesig123');
    expect(result.success).toBe(true);
    expect(result.subscription!.plan).toBe('basic');
  });

  it('deactivates previous subscription on upgrade', async () => {
    await activateSubscription(db, '100', 'basic', 'sig1');
    await activateSubscription(db, '100', 'pro', 'sig2');
    const plan = getUserPlan(db, '100');
    expect(plan.id).toBe('pro');
  });

  it('requires wallet for paid plans', async () => {
    // user 200 has no wallet
    const result = await activateSubscription(db, '200', 'basic', 'sig');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No wallet found');
  });
});

describe('formatPlans', () => {
  it('includes all plan names', () => {
    const text = formatPlans();
    expect(text).toContain('Free');
    expect(text).toContain('Basic');
    expect(text).toContain('Pro');
  });
});

describe('formatSubscriptionStatus', () => {
  it('shows free plan for unsubscribed user', () => {
    const text = formatSubscriptionStatus(db, '100');
    expect(text).toContain('Free');
    expect(text).toContain('1 whale');
  });

  it('shows pro plan details for subscribed user', () => {
    createSubscription(db, '100', 'pro', 'sig', 0.5, 30);
    const text = formatSubscriptionStatus(db, '100');
    expect(text).toContain('Pro');
    expect(text).toContain('unlimited');
  });
});

describe('getTreasuryAddress', () => {
  it('returns a string', () => {
    expect(typeof getTreasuryAddress()).toBe('string');
    expect(getTreasuryAddress().length).toBeGreaterThan(0);
  });
});

describe('getPaymentMode', () => {
  it('defaults to mock', () => {
    expect(getPaymentMode()).toBe('mock');
  });
});

describe('Payment history DB operations', () => {
  it('records a payment event', () => {
    const event = recordPaymentEvent(db, '100', 'subscription_activated', 'basic', 0.1, 'sig1', 'completed');
    expect(event.telegram_id).toBe('100');
    expect(event.event_type).toBe('subscription_activated');
    expect(event.plan).toBe('basic');
    expect(event.amount_sol).toBe(0.1);
    expect(event.status).toBe('completed');
  });

  it('records event with metadata', () => {
    const event = recordPaymentEvent(db, '100', 'webhook_payment_confirmed', 'pro', 0.5, 'sig2', 'processing', { source: 'webhook' });
    expect(event.metadata).toContain('webhook');
    const parsed = JSON.parse(event.metadata!);
    expect(parsed.source).toBe('webhook');
  });

  it('retrieves payment history in reverse order', () => {
    recordPaymentEvent(db, '100', 'event1', 'free', 0, null, 'completed');
    recordPaymentEvent(db, '100', 'event2', 'basic', 0.1, 'sig', 'completed');
    const history = getPaymentHistory(db, '100');
    expect(history).toHaveLength(2);
    expect(history[0].event_type).toBe('event2'); // most recent first
  });

  it('returns empty array for user with no history', () => {
    const history = getPaymentHistory(db, '200');
    expect(history).toHaveLength(0);
  });

  it('updates payment event status', () => {
    const event = recordPaymentEvent(db, '100', 'test', 'basic', 0.1, 'sig', 'pending');
    updatePaymentEventStatus(db, event.id, 'completed');
    const history = getPaymentHistory(db, '100');
    expect(history[0].status).toBe('completed');
  });
});

describe('Webhook payload validation', () => {
  it('rejects null payload', () => {
    expect(validateWebhookPayload(null)).toContain('Invalid payload');
  });

  it('rejects invalid event type', () => {
    expect(validateWebhookPayload({ event: 'bad', telegram_id: '1', plan: 'free', tx_signature: 'sig', amount_sol: 0 })).toContain('Invalid event type');
  });

  it('rejects missing telegram_id', () => {
    expect(validateWebhookPayload({ event: 'payment.confirmed', plan: 'free', tx_signature: 'sig', amount_sol: 0 })).toContain('telegram_id');
  });

  it('rejects invalid plan', () => {
    expect(validateWebhookPayload({ event: 'payment.confirmed', telegram_id: '1', plan: 'diamond', tx_signature: 'sig', amount_sol: 0 })).toContain('Invalid plan');
  });

  it('rejects missing tx_signature', () => {
    expect(validateWebhookPayload({ event: 'payment.confirmed', telegram_id: '1', plan: 'basic', amount_sol: 0.1 })).toContain('tx_signature');
  });

  it('rejects negative amount', () => {
    expect(validateWebhookPayload({ event: 'payment.confirmed', telegram_id: '1', plan: 'basic', tx_signature: 'sig', amount_sol: -1 })).toContain('amount_sol');
  });

  it('accepts valid payload', () => {
    const valid = { event: 'payment.confirmed', telegram_id: '100', plan: 'basic', tx_signature: 'sig123', amount_sol: 0.1 };
    expect(validateWebhookPayload(valid)).toBeNull();
  });
});

describe('Webhook handler', () => {
  it('handles payment.confirmed and activates subscription', async () => {
    // user 100 already has a wallet from beforeEach
    const payload: WebhookPayload = {
      event: 'payment.confirmed',
      telegram_id: '100',
      plan: 'basic',
      tx_signature: 'webhook-sig-1',
      amount_sol: 0.1,
    };
    const result = await handlePaymentWebhook(db, payload);
    expect(result.success).toBe(true);
    expect(result.message).toContain('basic');

    // Verify subscription was activated
    const plan = getUserPlan(db, '100');
    expect(plan.id).toBe('basic');
  });

  it('handles payment.failed and records event', async () => {
    const payload: WebhookPayload = {
      event: 'payment.failed',
      telegram_id: '100',
      plan: 'pro',
      tx_signature: 'failed-sig',
      amount_sol: 0.5,
    };
    const result = await handlePaymentWebhook(db, payload);
    expect(result.success).toBe(true);
    expect(result.message).toContain('failure recorded');

    // User should still be on free plan
    const plan = getUserPlan(db, '100');
    expect(plan.id).toBe('free');
  });

  it('records payment history on webhook', async () => {
    const payload: WebhookPayload = {
      event: 'payment.confirmed',
      telegram_id: '100',
      plan: 'pro',
      tx_signature: 'webhook-sig-2',
      amount_sol: 0.5,
    };
    await handlePaymentWebhook(db, payload);
    const history = getWebhookHistory(db, '100');
    expect(history.length).toBeGreaterThan(0);
    expect(history.some(e => e.event_type.includes('webhook'))).toBe(true);
  });

  it('creates user if not exists on webhook', async () => {
    const payload: WebhookPayload = {
      event: 'payment.confirmed',
      telegram_id: '999',
      plan: 'free',
      tx_signature: 'new-user-sig',
      amount_sol: 0,
    };
    const result = await handlePaymentWebhook(db, payload);
    expect(result.success).toBe(true);
  });
});
