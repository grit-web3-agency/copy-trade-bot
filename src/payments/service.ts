import Database from 'better-sqlite3';

export interface Subscription {
  id: number;
  telegram_id: string;
  plan: string;
  active: number;
  tx_signature: string | null;
  paid_sol: number;
  started_at: string;
  expires_at: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  maxWhales: number;
  maxTradesPerDay: number;
  priceSolMonthly: number;
  // legacy alias used elsewhere
  priceSol?: number;
}

export const PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    maxWhales: 1,
    maxTradesPerDay: 5,
    priceSolMonthly: 0,
    priceSol: 0,
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    maxWhales: 5,
    maxTradesPerDay: 50,
    priceSolMonthly: 0.1,
    priceSol: 0.1,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    maxWhales: 20,
    maxTradesPerDay: 500,
    priceSolMonthly: 0.5,
    priceSol: 0.5,
  },
};

export function initPaymentSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      tx_signature TEXT,
      paid_sol REAL DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
  `);

  // Ensure legacy status column exists for compatibility
  const cols = database.pragma('table_info(subscriptions)') as { name: string }[];
  if (!cols.some(c => c.name === 'status')) {
    try {
      database.exec(`ALTER TABLE subscriptions ADD COLUMN status TEXT DEFAULT 'active'`);
    } catch (err) {
      // ignore if cannot add
    }
  }
}

export function getActiveSubscription(database: Database.Database, telegramId: string): Subscription | null {
  const row = database.prepare(
    `SELECT * FROM subscriptions
     WHERE telegram_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY id DESC LIMIT 1`
  ).get(telegramId) as Subscription | undefined;
  if (!row) return null;
  // legacy aliases
  (row as any).plan_id = (row as any).plan;
  (row as any).status = (row as any).active === 1 ? 'active' : 'inactive';
  return row;
}

export function getUserPlan(database: Database.Database, telegramId: string): SubscriptionPlan {
  const sub = getActiveSubscription(database, telegramId);
  if (!sub) return PLANS.free;
  return PLANS[sub.plan] || PLANS.free;
}

export function createSubscription(
  database: Database.Database,
  telegramId: string,
  planId: string,
  txSignature: string | null,
  paidSol: number = 0,
  durationDays: number = 30
): Subscription {
  if (!PLANS[planId]) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  // deactivate previous (mark as replaced for legacy systems)
  database.prepare(`UPDATE subscriptions SET active = 0, status = 'replaced' WHERE telegram_id = ? AND active = 1`).run(telegramId);

  const expires = durationDays > 0 ? `datetime('now', '+${durationDays} days')` : null;
  database.prepare(
    `INSERT INTO subscriptions (telegram_id, plan, tx_signature, paid_sol, expires_at, active) VALUES (?, ?, ?, ?, ${expires ? expires : 'NULL'}, 1)`
  ).run(telegramId, planId, txSignature, paidSol);

  const row = database.prepare('SELECT * FROM subscriptions WHERE telegram_id = ? ORDER BY id DESC LIMIT 1').get(telegramId) as Subscription;
  // legacy aliases
  (row as any).plan_id = (row as any).plan;
  (row as any).status = (row as any).active === 1 ? 'active' : 'inactive';
  return row;
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
