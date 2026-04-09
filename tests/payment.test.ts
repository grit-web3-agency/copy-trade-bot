import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  getOrCreateUser,
  getActiveSubscription,
  createSubscription,
  deactivateSubscriptions,
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
} from '../src/payment';
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
