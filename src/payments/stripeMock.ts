import Database from 'better-sqlite3';
import { PaymentAdapter } from './adapter';
import { createSubscription } from './service';

// StripeMock implements the PaymentAdapter interface for dev/test use
export class StripeMock implements PaymentAdapter {
  async activateSubscription(database: Database.Database, telegramId: string, planId: string, txSignature?: string | null): Promise<boolean> {
    // In the mock, activation simply creates the subscription record in DB.
    createSubscription(database, telegramId, planId, txSignature || null);
    return true;
  }

  async verifyPayment(_txSignature: string, _expectedAmountSol: number, _treasuryWallet: string): Promise<boolean> {
    // Always succeed in mock mode
    console.log('[StripeMock] verifyPayment mocked to true');
    return true;
  }

  generateTestWebhookEvent(eventType: string, payload: any = {}) {
    // Return a simple shape that tests can inspect; no external calls.
    return {
      id: `evt_mock_${Date.now()}`,
      type: eventType,
      data: payload,
    };
  }
}

export default new StripeMock();

