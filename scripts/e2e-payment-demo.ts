import {
  createTestDb,
  getOrCreateUser,
  getActiveSubscription,
  getPaymentHistory,
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
} from '../src/payment';
import {
  validateWebhookPayload,
  handlePaymentWebhook,
} from '../src/api/payments/webhook';
import type { WebhookPayload } from '../src/api/payments/webhook';

async function main() {
  console.log('=== Payment Module E2E Demo (Mock Mode) ===\n');

  const db = createTestDb();

  // 1. Register users
  console.log('--- Step 1: Register users ---');
  getOrCreateUser(db, '100', 'alice');
  createAndStoreWallet(db, '100');
  getOrCreateUser(db, '200', 'bob');
  createAndStoreWallet(db, '200');
  console.log('Users alice (100) and bob (200) registered with wallets.\n');

  // 2. Show plans
  console.log('--- Step 2: Available plans ---');
  console.log(formatPlans());
  console.log();

  // 3. Check default (free) plan limits
  console.log('--- Step 3: Default free plan limits ---');
  const freePlan = getUserPlan(db, '100');
  console.log(`Alice plan: ${freePlan.name} (${freePlan.maxWhales} whales, ${freePlan.maxTradesPerDay} trades/day)`);
  const whaleCheck = checkWhaleLimit(db, '100', 0);
  console.log(`Can watch first whale? ${whaleCheck.allowed} (limit: ${whaleCheck.limit})`);
  const whaleCheck2 = checkWhaleLimit(db, '100', 1);
  console.log(`Can watch second whale? ${whaleCheck2.allowed} (blocked by free plan)\n`);

  // 4. Subscribe Alice to basic plan via mock payment
  console.log('--- Step 4: Subscribe Alice to Basic plan ---');
  const result = await activateSubscription(db, '100', 'basic', 'mock-tx-sig-001');
  console.log(`Success: ${result.success}`);
  console.log(`Plan: ${result.subscription?.plan}`);
  console.log(`Status: ${formatSubscriptionStatus(db, '100')}\n`);

  // 5. Check upgraded limits
  console.log('--- Step 5: Upgraded limits ---');
  const basicPlan = getUserPlan(db, '100');
  console.log(`Alice plan: ${basicPlan.name} (${basicPlan.maxWhales} whales, ${basicPlan.maxTradesPerDay} trades/day)`);
  const whaleCheck3 = checkWhaleLimit(db, '100', 4);
  console.log(`Can watch 5th whale? ${whaleCheck3.allowed}`);
  const whaleCheck4 = checkWhaleLimit(db, '100', 5);
  console.log(`Can watch 6th whale? ${whaleCheck4.allowed} (blocked by basic plan)\n`);

  // 6. Webhook: payment.confirmed for Bob (pro plan)
  console.log('--- Step 6: Webhook payment.confirmed for Bob ---');
  const payload: WebhookPayload = {
    event: 'payment.confirmed',
    telegram_id: '200',
    plan: 'pro',
    tx_signature: 'webhook-tx-sig-002',
    amount_sol: 0.5,
  };
  const validation = validateWebhookPayload(payload);
  console.log(`Payload valid: ${validation === null}`);
  const webhookResult = await handlePaymentWebhook(db, payload);
  console.log(`Webhook result: ${webhookResult.success} — ${webhookResult.message}`);
  console.log(`Bob's plan: ${getUserPlan(db, '200').name}`);
  const tradeLimit = checkDailyTradeLimit(db, '200');
  console.log(`Bob trades/day: ${tradeLimit.limit === -1 ? 'unlimited' : tradeLimit.limit}\n`);

  // 7. Webhook: payment.failed
  console.log('--- Step 7: Webhook payment.failed ---');
  const failPayload: WebhookPayload = {
    event: 'payment.failed',
    telegram_id: '100',
    plan: 'pro',
    tx_signature: 'failed-tx-sig',
    amount_sol: 0.5,
  };
  const failResult = await handlePaymentWebhook(db, failPayload);
  console.log(`Failed webhook result: ${failResult.success} — ${failResult.message}`);
  console.log(`Alice still on: ${getUserPlan(db, '100').name}\n`);

  // 8. Payment history
  console.log('--- Step 8: Payment history ---');
  const aliceHistory = getPaymentHistory(db, '100');
  console.log(`Alice has ${aliceHistory.length} payment events:`);
  aliceHistory.forEach(e => console.log(`  [${e.status}] ${e.event_type} — ${e.plan} — ${e.amount_sol} SOL`));
  const bobHistory = getPaymentHistory(db, '200');
  console.log(`Bob has ${bobHistory.length} payment events:`);
  bobHistory.forEach(e => console.log(`  [${e.status}] ${e.event_type} — ${e.plan} — ${e.amount_sol} SOL`));

  console.log('\n=== E2E Payment Demo Complete ===');
}

main().catch(console.error);
