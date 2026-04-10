#!/usr/bin/env tsx
/**
 * Seed a test subscription for a user.
 *
 * Usage:
 *   npx tsx scripts/seed-subscription.ts <telegram_id> [plan]
 *
 * Examples:
 *   npx tsx scripts/seed-subscription.ts 12345            # seed free plan
 *   npx tsx scripts/seed-subscription.ts 12345 basic      # seed basic plan
 *   npx tsx scripts/seed-subscription.ts 12345 pro        # seed pro plan
 */
import 'dotenv/config';
import { getDb, getOrCreateUser, getActiveSubscription } from '../src/db';
import { PLANS, activateSubscription } from '../src/payment';

async function main() {
  const telegramId = process.argv[2];
  const planId = process.argv[3] || 'free';

  if (!telegramId) {
    console.error('Usage: npx tsx scripts/seed-subscription.ts <telegram_id> [plan]');
    console.error('Plans:', Object.keys(PLANS).join(', '));
    process.exit(1);
  }

  if (!PLANS[planId]) {
    console.error(`Unknown plan: ${planId}`);
    console.error('Available plans:', Object.keys(PLANS).join(', '));
    process.exit(1);
  }

  const db = getDb();

  // Ensure user exists
  getOrCreateUser(db, telegramId, `seed-user-${telegramId}`);
  console.log(`[Seed] User ${telegramId} ensured`);

  // For paid plans in mock mode, use a fake tx signature
  const txSig = planId === 'free' ? null : `mock-seed-tx-${Date.now()}`;

  const result = await activateSubscription(db, telegramId, planId, txSig);

  if (result.success) {
    const sub = getActiveSubscription(db, telegramId);
    console.log(`[Seed] Subscription created successfully:`);
    console.log(`  User:    ${telegramId}`);
    console.log(`  Plan:    ${result.subscription!.plan}`);
    console.log(`  Expires: ${sub?.expires_at || 'never'}`);
    console.log(`  TX:      ${txSig || 'none (free plan)'}`);
  } else {
    console.error(`[Seed] Failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
