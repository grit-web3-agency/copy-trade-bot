import Database from 'better-sqlite3';

export interface SubscriptionPlan {
  id: string;
  name: string;
  maxWhales: number;
  maxTradesPerDay: number;
  priceSolMonthly: number;
}

export const PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    maxWhales: 1,
    maxTradesPerDay: 5,
    priceSolMonthly: 0,
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    maxWhales: 5,
    maxTradesPerDay: 50,
    priceSolMonthly: 0.1,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    maxWhales: 20,
    maxTradesPerDay: 500,
    priceSolMonthly: 0.5,
  },
};

export interface Subscription {
  id: number;
  telegram_id: string;
  plan_id: string;
  status: string;
  tx_signature: string | null;
  started_at: string;
  expires_at: string;
}

export function initPaymentSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      plan_id TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      tx_signature TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+30 days')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
  `);
}

export function getActiveSubscription(database: Database.Database, telegramId: string): Subscription | null {
  const row = database.prepare(
    `SELECT * FROM subscriptions
     WHERE telegram_id = ? AND status = 'active' AND expires_at > datetime('now')
     ORDER BY expires_at DESC LIMIT 1`
  ).get(telegramId) as Subscription | undefined;
  return row || null;
}

export function getUserPlan(database: Database.Database, telegramId: string): SubscriptionPlan {
  const sub = getActiveSubscription(database, telegramId);
  if (!sub) return PLANS.free;
  return PLANS[sub.plan_id] || PLANS.free;
}

export function createSubscription(
  database: Database.Database,
  telegramId: string,
  planId: string,
  txSignature: string | null
): Subscription {
  if (!PLANS[planId]) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  database.prepare(
    `UPDATE subscriptions SET status = 'replaced' WHERE telegram_id = ? AND status = 'active'`
  ).run(telegramId);

  database.prepare(
    `INSERT INTO subscriptions (telegram_id, plan_id, status, tx_signature) VALUES (?, ?, 'active', ?)`
  ).run(telegramId, planId, txSignature);

  return database.prepare(
    'SELECT * FROM subscriptions WHERE telegram_id = ? ORDER BY id DESC LIMIT 1'
  ).get(telegramId) as Subscription;
}

export async function verifyPayment(
  _txSignature: string,
  _expectedAmountSol: number,
  _treasuryWallet: string
): Promise<boolean> {
  // Mocked for devnet — always returns true
  console.log(`[Payment] Mock verify: tx=${_txSignature}, amount=${_expectedAmountSol} SOL`);
  return true;
}

export function formatPlansMessage(): string {
  const lines = ['Subscription Plans:', ''];
  for (const plan of Object.values(PLANS)) {
    const price = plan.priceSolMonthly === 0 ? 'Free' : `${plan.priceSolMonthly} SOL/month`;
    lines.push(
      `${plan.name} — ${price}`,
      `  Whales: ${plan.maxWhales} | Trades/day: ${plan.maxTradesPerDay}`,
      ''
    );
  }
  lines.push('Usage: /subscribe <free|basic|pro> [tx_signature]');
  return lines.join('\n');
}
