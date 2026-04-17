import { makeBot, getUserSettings, userSettingsMap, UserSettings } from '../bot';
import { DEFAULT_POLICY } from '../policy';

describe('bot', () => {
  beforeEach(() => {
    userSettingsMap.clear();
  });

  it('exports makeBot', () => {
    const b = makeBot();
    expect(b).toBeDefined();
  });

  it('getUserSettings returns defaults for new user', () => {
    const s = getUserSettings(123);
    expect(s.maxTradeLamports).toBe(DEFAULT_POLICY.maxPerWalletLamports);
    expect(s.slippagePct).toBe(DEFAULT_POLICY.slippagePct);
    expect(s.watchAddress).toBeNull();
    expect(s.copyEnabled).toBe(false);
    expect(s.posterEnabled).toBe(true);
  });

  it('getUserSettings returns same object on subsequent calls', () => {
    const s1 = getUserSettings(42);
    s1.slippagePct = 5;
    const s2 = getUserSettings(42);
    expect(s2.slippagePct).toBe(5);
  });

  it('different users have independent settings', () => {
    const a = getUserSettings(1);
    const b = getUserSettings(2);
    a.copyEnabled = true;
    expect(b.copyEnabled).toBe(false);
  });

  it('settings can be modified', () => {
    const s = getUserSettings(99);
    s.maxTradeLamports = 1_000_000_000;
    s.slippagePct = 3;
    s.watchAddress = 'SomeWalletAddress123456789012345678901234';
    s.copyEnabled = true;
    s.posterEnabled = false;

    expect(s.maxTradeLamports).toBe(1_000_000_000);
    expect(s.slippagePct).toBe(3);
    expect(s.watchAddress).toBe('SomeWalletAddress123456789012345678901234');
    expect(s.copyEnabled).toBe(true);
    expect(s.posterEnabled).toBe(false);
  });
});
