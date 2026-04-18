import { posterOnExecuted, postActivity, postDiscordMessage } from '../poster';
import fetch from 'node-fetch';

jest.mock('node-fetch', () => jest.fn());
const mockedFetch = fetch as unknown as jest.Mock;

describe('poster', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('posts activity and discord message when enabled', async () => {
    mockedFetch.mockResolvedValue({ ok: true });
    const trade = { signature: 'sig1', from: 'A', to: 'B', amount: 1000 } as any;
    await posterOnExecuted(trade, { tx: 'tx1', cluster: 'devnet' });
    expect(mockedFetch).toHaveBeenCalled();
  });

  it('does NOT post when enabled=false (toggle off)', async () => {
    mockedFetch.mockResolvedValue({ ok: true });
    const trade = { signature: 'sig2', from: 'A', to: 'B', amount: 2000 } as any;
    await posterOnExecuted(trade, { tx: 'tx2', cluster: 'devnet' }, false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('defaults to enabled=true', async () => {
    mockedFetch.mockResolvedValue({ ok: true });
    const trade = { signature: 'sig3', from: 'A', to: 'B', amount: 3000 } as any;
    await posterOnExecuted(trade, { tx: 'tx3' });
    // Should have been called (at least postActivity)
    expect(mockedFetch).toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    mockedFetch.mockRejectedValue(new Error('network error'));
    // Should not throw
    await expect(
      postActivity('agent', 'event', 'detail')
    ).resolves.toBeUndefined();
  });
});
