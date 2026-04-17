import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  postToDashboard,
  postToDiscord,
  postActivity,
  tradeExecutedEvent,
  loadPosterConfig,
  PosterConfig,
  ActivityEvent,
} from '../src/poster';

function makeConfig(overrides: Partial<PosterConfig> = {}): PosterConfig {
  return {
    dashboardUrl: 'http://127.0.0.1:8088',
    discordWebhookUrl: 'https://discord.com/api/webhooks/test',
    enabled: true,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    type: 'trade_executed',
    direction: 'BUY',
    tokenMint: 'TokenMint123',
    amountSol: 0.05,
    signature: 'sig123',
    mode: 'dry-run',
    status: 'executed (dry-run)',
    telegramId: '42',
    whaleAddress: 'Whale123',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('poster', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  describe('postToDashboard', () => {
    it('sends POST to dashboard /api/activity', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
      const config = makeConfig();
      const event = makeEvent();
      const result = await postToDashboard(config, event);
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8088/api/activity',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('returns false when dashboardUrl is null', async () => {
      const config = makeConfig({ dashboardUrl: null });
      const result = await postToDashboard(config, makeEvent());
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns false on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      const result = await postToDashboard(makeConfig(), makeEvent());
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await postToDashboard(makeConfig(), makeEvent());
      expect(result).toBe(false);
    });
  });

  describe('postToDiscord', () => {
    it('sends POST to discord webhook', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
      const config = makeConfig();
      const result = await postToDiscord(config, makeEvent());
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('returns false when discordWebhookUrl is null', async () => {
      const config = makeConfig({ discordWebhookUrl: null });
      const result = await postToDiscord(config, makeEvent());
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'));
      const result = await postToDiscord(makeConfig(), makeEvent());
      expect(result).toBe(false);
    });
  });

  describe('postActivity', () => {
    it('sends to both dashboard and discord', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
      const config = makeConfig();
      const result = await postActivity(config, makeEvent());
      expect(result.dashboard).toBe(true);
      expect(result.discord).toBe(true);
    });

    it('returns false for both when disabled', async () => {
      const config = makeConfig({ enabled: false });
      const result = await postActivity(config, makeEvent());
      expect(result.dashboard).toBe(false);
      expect(result.discord).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('tradeExecutedEvent', () => {
    it('creates event with correct type and fields', () => {
      const event = tradeExecutedEvent({
        direction: 'SELL',
        tokenMint: 'Mint456',
        amountSol: 1.5,
        signature: 'txSig',
        mode: 'devnet',
        status: 'executed (devnet)',
        telegramId: '99',
        whaleAddress: 'WhaleXYZ',
      });
      expect(event.type).toBe('trade_executed');
      expect(event.direction).toBe('SELL');
      expect(event.amountSol).toBe(1.5);
      expect(event.timestamp).toBeGreaterThan(0);
    });
  });

  describe('loadPosterConfig', () => {
    it('uses defaults when env vars not set', () => {
      const config = loadPosterConfig();
      expect(config.dashboardUrl).toBe('http://127.0.0.1:8088');
      expect(config.enabled).toBe(true);
    });
  });
});
