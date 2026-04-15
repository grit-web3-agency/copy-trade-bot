import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDevnetUrl, assertDevnetRpc, loadDevnetConfig } from '../src/devnet-config';

describe('devnet-config', () => {
  describe('isDevnetUrl', () => {
    it('returns true for standard devnet RPC', () => {
      expect(isDevnetUrl('https://api.devnet.solana.com')).toBe(true);
    });

    it('returns true for Helius devnet URL', () => {
      expect(isDevnetUrl('https://devnet.helius-rpc.com/?api-key=abc')).toBe(true);
    });

    it('returns false for mainnet URL', () => {
      expect(isDevnetUrl('https://api.mainnet-beta.solana.com')).toBe(false);
    });

    it('returns false for arbitrary URL', () => {
      expect(isDevnetUrl('https://my-custom-rpc.example.com')).toBe(false);
    });
  });

  describe('assertDevnetRpc', () => {
    it('does not throw for devnet URLs', () => {
      expect(() => assertDevnetRpc('https://api.devnet.solana.com')).not.toThrow();
      expect(() => assertDevnetRpc('https://devnet.helius-rpc.com/?api-key=x')).not.toThrow();
    });

    it('throws for mainnet URLs', () => {
      expect(() => assertDevnetRpc('https://api.mainnet-beta.solana.com')).toThrow(
        /Safety check failed/
      );
    });
  });

  describe('loadDevnetConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns defaults when no env vars set', () => {
      delete process.env.SOLANA_RPC_URL;
      delete process.env.SOLANA_NETWORK;
      delete process.env.ENABLE_LIVE_DEVNET;

      const config = loadDevnetConfig();
      expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
      expect(config.network).toBe('devnet');
      expect(config.enableLiveTrading).toBe(false);
    });

    it('enables live trading when ENABLE_LIVE_DEVNET=true', () => {
      process.env.ENABLE_LIVE_DEVNET = 'true';
      const config = loadDevnetConfig();
      expect(config.enableLiveTrading).toBe(true);
    });

    it('keeps live trading disabled for other values', () => {
      process.env.ENABLE_LIVE_DEVNET = 'yes';
      expect(loadDevnetConfig().enableLiveTrading).toBe(false);

      process.env.ENABLE_LIVE_DEVNET = '1';
      expect(loadDevnetConfig().enableLiveTrading).toBe(false);
    });
  });
});
