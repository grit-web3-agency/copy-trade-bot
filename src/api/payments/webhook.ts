import Database from 'better-sqlite3';
import { getOrCreateUser, recordPaymentEvent, getPaymentHistory } from '../../db';
import { PLANS, activateSubscription, getPaymentMode } from '../../payment';
import type { PaymentEvent } from '../../db';

export interface WebhookPayload {
  event: 'payment.confirmed' | 'payment.failed';
  telegram_id: string;
  plan: string;
  tx_signature: string;
  amount_sol: number;
}

export interface WebhookResult {
  success: boolean;
  message: string;
  event?: PaymentEvent;
}

export function validateWebhookPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return 'Invalid payload: expected an object';
  }

  const p = payload as Record<string, unknown>;

  if (!p.event || !['payment.confirmed', 'payment.failed'].includes(p.event as string)) {
    return 'Invalid event type: must be payment.confirmed or payment.failed';
  }
  if (!p.telegram_id || typeof p.telegram_id !== 'string') {
    return 'Missing or invalid telegram_id';
  }
  if (!p.plan || typeof p.plan !== 'string' || !PLANS[p.plan]) {
    return `Invalid plan: must be one of ${Object.keys(PLANS).join(', ')}`;
  }
  if (!p.tx_signature || typeof p.tx_signature !== 'string') {
    return 'Missing or invalid tx_signature';
  }
  if (typeof p.amount_sol !== 'number' || p.amount_sol < 0) {
    return 'Missing or invalid amount_sol';
  }

  return null;
}

export async function handlePaymentWebhook(
  db: Database.Database,
  payload: WebhookPayload,
): Promise<WebhookResult> {
  const mode = getPaymentMode();
  console.log(`[Webhook] Received ${payload.event} for user=${payload.telegram_id} plan=${payload.plan} mode=${mode}`);

  getOrCreateUser(db, payload.telegram_id);

  if (payload.event === 'payment.failed') {
    const event = recordPaymentEvent(
      db,
      payload.telegram_id,
      'webhook_payment_failed',
      payload.plan,
      payload.amount_sol,
      payload.tx_signature,
      'failed',
    );
    console.log(`[Webhook] Payment failed recorded for user=${payload.telegram_id}`);
    return { success: true, message: 'Payment failure recorded', event };
  }

  const event = recordPaymentEvent(
    db,
    payload.telegram_id,
    'webhook_payment_confirmed',
    payload.plan,
    payload.amount_sol,
    payload.tx_signature,
    'processing',
  );

  const result = await activateSubscription(
    db,
    payload.telegram_id,
    payload.plan,
    payload.tx_signature,
  );

  if (result.success) {
    recordPaymentEvent(db, payload.telegram_id, 'subscription_activated_via_webhook', payload.plan, payload.amount_sol, payload.tx_signature, 'completed');
    console.log(`[Webhook] Subscription activated for user=${payload.telegram_id} plan=${payload.plan}`);
    return { success: true, message: `Subscription activated: ${payload.plan}`, event };
  }

  recordPaymentEvent(db, payload.telegram_id, 'webhook_activation_failed', payload.plan, payload.amount_sol, payload.tx_signature, 'failed', { error: result.error });
  console.log(`[Webhook] Activation failed for user=${payload.telegram_id}: ${result.error}`);
  return { success: false, message: result.error || 'Activation failed', event };
}

export function getWebhookHistory(db: Database.Database, telegramId: string): PaymentEvent[] {
  return getPaymentHistory(db, telegramId);
}
