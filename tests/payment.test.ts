import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, getOrCreateUser } from '../src/db';
import {
  PLANS,
  initPaymentSchema,
  createSubscription,
  getActiveSubscription,
  getUserPlan,
  verifyPayment,
  formatPlansMessage,
} from '../src/payment';

describe('payment module', () => {
  let db: Database.Database;
  const telegramId = 'pay-user-1';

  beforeEach(() => {
    db = createTestDb();
    initPaymentSchema(db);
    getOrCreateUser(db, telegramId, 'payer');
  });

  describe('PLANS', () => {
    it('defines free, basic, and pro plans', () => {
      expect(PLANS.free).toBeDefined();
      expect(PLANS.basic).toBeDefined();
      expect(PLANS.pro).toBeDefined();
    });

    it('free plan costs 0 SOL', () => {
      expect(PLANS.free.priceSolMonthly).toBe(0);
    });

    it('plans have increasing limits', () => {
      expect(PLANS.basic.maxWhales).toBeGreaterThan(PLANS.free.maxWhales);
      expect(PLANS.pro.maxWhales).toBeGreaterThan(PLANS.basic.maxWhales);
      expect(PLANS.pro.maxTradesPerDay).toBeGreaterThan(PLANS.basic.maxTradesPerDay);
    });
  });

  describe('createSubscription', () => {
    it('creates a free subscription', () => {
      const sub = createSubscription(db, telegramId, 'free', null);
      expect(sub.plan_id).toBe('free');
      expect(sub.status).toBe('active');
      expect(sub.tx_signature).toBeNull();
    });

    it('creates a paid subscription with tx signature', () => {
      const sub = createSubscription(db, telegramId, 'basic', 'fake-tx-sig-123');
      expect(sub.plan_id).toBe('basic');
      expect(sub.tx_signature).toBe('fake-tx-sig-123');
    });

    it('replaces previous active subscription', () => {
      createSubscription(db, telegramId, 'free', null);
      createSubscription(db, telegramId, 'basic', 'tx-123');

      const active = getActiveSubscription(db, telegramId);
      expect(active).not.toBeNull();
      expect(active!.plan_id).toBe('basic');

      const all = db.prepare('SELECT * FROM subscriptions WHERE telegram_id = ?').all(telegramId) as any[];
      const replaced = all.filter((s: any) => s.status === 'replaced');
      expect(replaced).toHaveLength(1);
    });

    it('throws for unknown plan', () => {
      expect(() => createSubscription(db, telegramId, 'ultra', null)).toThrow('Unknown plan');
    });
  });

  describe('getActiveSubscription', () => {
    it('returns null when no subscription exists', () => {
      expect(getActiveSubscription(db, telegramId)).toBeNull();
    });

    it('returns active subscription', () => {
      createSubscription(db, telegramId, 'pro', 'tx-pro');
      const sub = getActiveSubscription(db, telegramId);
      expect(sub).not.toBeNull();
      expect(sub!.plan_id).toBe('pro');
    });
  });

  describe('getUserPlan', () => {
    it('returns free plan when no subscription', () => {
      const plan = getUserPlan(db, telegramId);
      expect(plan.id).toBe('free');
    });

    it('returns subscribed plan', () => {
      createSubscription(db, telegramId, 'pro', 'tx-abc');
      const plan = getUserPlan(db, telegramId);
      expect(plan.id).toBe('pro');
    });
  });

  describe('verifyPayment (mocked)', () => {
    it('always returns true on devnet', async () => {
      const result = await verifyPayment('any-sig', 0.1, 'any-wallet');
      expect(result).toBe(true);
    });
  });

  describe('formatPlansMessage', () => {
    it('includes all plan names', () => {
      const msg = formatPlansMessage();
      expect(msg).toContain('Free');
      expect(msg).toContain('Basic');
      expect(msg).toContain('Pro');
    });

    it('includes usage instructions', () => {
      const msg = formatPlansMessage();
      expect(msg).toContain('/subscribe');
    });
  });
});
