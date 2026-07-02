import Database from 'better-sqlite3';
import { getOrCreateUser, recordPaymentEvent, getPaymentHistory } from '../../db';
import { PLANS, activateSubscription, getPaymentMode } from '../../payment';
import { getPaymentAdapter, isPaymentsEnabled, getPaymentProviderName } from '../../payments';
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
  const provider = getPaymentProviderName();
  const paymentsOn = isPaymentsEnabled();
  console.log(`[Webhook] Received ${payload.event} for user=${payload.telegram_id} plan=${payload.plan} mode=${mode} provider=${provider} enabled=${paymentsOn}`);

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

  // If payments are enabled and the provider offers webhook verification,
  // run it first to ensure the webhook is genuine.
  if (paymentsOn) {
    const adapter = getPaymentAdapter();
    if (adapter && adapter.verifyWebhookPayload) {
      const verified = await adapter.verifyWebhookPayload(payload as unknown);
      if (!verified.valid) {
        const failed = recordPaymentEvent(db, payload.telegram_id, 'webhook_activation_failed', payload.plan, payload.amount_sol, payload.tx_signature, 'failed', { error: verified.reason, provider });
        return { success: false, message: verified.reason || 'Webhook verification failed', event: failed };
      }
    }
  }

  const result = await activateSubscription(
    db,
    payload.telegram_id,
    payload.plan,
    payload.tx_signature,
  );
  // adapter may return boolean or object
  if (typeof result === 'boolean') {
    if (result) {
      recordPaymentEvent(db, payload.telegram_id, 'subscription_activated_via_webhook', payload.plan, payload.amount_sol, payload.tx_signature, 'completed');
      console.log(`[Webhook] Subscription activated for user=${payload.telegram_id} plan=${payload.plan}`);
      return { success: true, message: `Subscription activated: ${payload.plan}`, event };
    }
    recordPaymentEvent(db, payload.telegram_id, 'webhook_activation_failed', payload.plan, payload.amount_sol, payload.tx_signature, 'failed', { error: 'activation failed' });
    return { success: false, message: 'Activation failed', event };
  }

<<<<<<< HEAD
  // Support boolean or object result shapes
  const ok = typeof result === 'boolean' ? result : (result && (result as any).success);
  const err = typeof result === 'boolean' ? undefined : (result && (result as any).error);

  if (ok) {
=======
  if (result && typeof result === 'object' && result.success) {
>>>>>>> 41c3e58 (chore: save reminder drafts and sprint report (auto))
    recordPaymentEvent(db, payload.telegram_id, 'subscription_activated_via_webhook', payload.plan, payload.amount_sol, payload.tx_signature, 'completed');
    console.log(`[Webhook] Subscription activated for user=${payload.telegram_id} plan=${payload.plan}`);
    return { success: true, message: `Subscription activated: ${payload.plan}`, event };
  }

<<<<<<< HEAD
  recordPaymentEvent(db, payload.telegram_id, 'webhook_activation_failed', payload.plan, payload.amount_sol, payload.tx_signature, 'failed', { error: err });
  console.log(`[Webhook] Activation failed for user=${payload.telegram_id}: ${err}`);
  return { success: false, message: err || 'Activation failed', event };
=======
  const err = result && result.error ? result.error : 'Activation failed';
  recordPaymentEvent(db, payload.telegram_id, 'webhook_activation_failed', payload.plan, payload.amount_sol, payload.tx_signature, 'failed', { error: err });
  console.log(`[Webhook] Activation failed for user=${payload.telegram_id}: ${err}`);
  return { success: false, message: err, event };
>>>>>>> 41c3e58 (chore: save reminder drafts and sprint report (auto))
}

export function getWebhookHistory(db: Database.Database, telegramId: string): PaymentEvent[] {
  return getPaymentHistory(db, telegramId);
}
