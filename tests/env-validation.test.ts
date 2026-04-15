import { describe, it, expect, afterEach } from 'vitest';
import { validateEnv } from '../src/env-validation';

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fails when BOT_TOKEN is missing', () => {
    delete process.env.BOT_TOKEN;
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('BOT_TOKEN'))).toBe(true);
  });

  it('passes when BOT_TOKEN is set', () => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.SOLANA_NETWORK;
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('warns when no RPC URL is set', () => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.DEVNET_RPC;
    delete process.env.SOLANA_RPC_URL;
    const result = validateEnv();
    expect(result.warnings.some(w => w.includes('DEVNET_RPC'))).toBe(true);
  });

  it('errors when RPC URL contains placeholder', () => {
    process.env.BOT_TOKEN = 'test-token';
    process.env.DEVNET_RPC = 'https://devnet.helius-rpc.com/?api-key=YOUR_KEY';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
  });

  it('errors when SOLANA_NETWORK is not devnet', () => {
    process.env.BOT_TOKEN = 'test-token';
    process.env.SOLANA_NETWORK = 'mainnet-beta';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('devnet-only'))).toBe(true);
  });

  it('passes when SOLANA_NETWORK is devnet', () => {
    process.env.BOT_TOKEN = 'test-token';
    process.env.SOLANA_NETWORK = 'devnet';
    const result = validateEnv();
    expect(result.valid).toBe(true);
  });

  it('errors on invalid DEFAULT_MAX_TRADE_SIZE_SOL', () => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.SOLANA_NETWORK;
    process.env.DEFAULT_MAX_TRADE_SIZE_SOL = 'abc';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('DEFAULT_MAX_TRADE_SIZE_SOL'))).toBe(true);
  });

  it('errors on negative DEFAULT_MAX_TRADE_SIZE_SOL', () => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.SOLANA_NETWORK;
    process.env.DEFAULT_MAX_TRADE_SIZE_SOL = '-1';
    const result = validateEnv();
    expect(result.valid).toBe(false);
  });

  it('errors on invalid DEFAULT_SLIPPAGE_BPS', () => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.SOLANA_NETWORK;
    process.env.DEFAULT_SLIPPAGE_BPS = '99999';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('DEFAULT_SLIPPAGE_BPS'))).toBe(true);
  });

  it('warns when SOLANA_WS_URL is missing', () => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.SOLANA_WS_URL;
    const result = validateEnv();
    expect(result.warnings.some(w => w.includes('SOLANA_WS_URL'))).toBe(true);
  });

  it('collects multiple errors', () => {
    delete process.env.BOT_TOKEN;
    process.env.SOLANA_NETWORK = 'mainnet-beta';
    process.env.DEFAULT_MAX_TRADE_SIZE_SOL = '-5';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
