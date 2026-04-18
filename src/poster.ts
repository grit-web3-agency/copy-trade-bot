export interface ActivityEvent {
  type: string;
  direction?: string;
  tokenMint?: string;
  amountSol?: number;
  signature?: string | null;
  mode?: string;
  status?: string;
  error?: string;
  telegramId?: string;
  whaleAddress?: string;
  timestamp: number;
}

export interface PosterConfig {
  dashboardUrl: string | null;
  discordWebhookUrl: string | null;
  enabled: boolean;
}

export function loadPosterConfig(): PosterConfig {
  return {
    dashboardUrl: process.env.DASHBOARD_API_URL || 'http://127.0.0.1:8088',
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
    enabled: process.env.POSTER_ENABLED !== 'false',
  };
}

export async function postToDashboard(
  config: PosterConfig,
  event: ActivityEvent
): Promise<boolean> {
  if (!config.dashboardUrl) return false;
  try {
    const url = `${config.dashboardUrl}/api/activity`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(`[Poster] Dashboard POST failed: ${resp.status}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Poster] Dashboard POST error: ${err?.message || err}`);
    return false;
  }
}

export async function postToDiscord(
  config: PosterConfig,
  event: ActivityEvent
): Promise<boolean> {
  if (!config.discordWebhookUrl) return false;
  try {
    const emoji = event.type === 'trade_executed' ? (event.direction === 'BUY' ? '🟢' : '🔴') : 'ℹ️';
    const content = [
      `${emoji} **${event.type}**`,
      event.direction ? `Direction: ${event.direction}` : null,
      event.tokenMint ? `Token: \`${event.tokenMint}\`` : null,
      event.amountSol != null ? `Amount: ${event.amountSol} SOL` : null,
      event.mode ? `Mode: ${event.mode}` : null,
      event.status ? `Status: ${event.status}` : null,
      event.signature ? `Sig: \`${event.signature}\`` : null,
      event.error ? `Error: ${event.error}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const resp = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(`[Poster] Discord POST failed: ${resp.status}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Poster] Discord POST error: ${err?.message || err}`);
    return false;
  }
}

export async function postActivity(
  config: PosterConfig,
  event: ActivityEvent
): Promise<{ dashboard: boolean; discord: boolean }> {
  if (!config.enabled) {
    return { dashboard: false, discord: false };
  }
  const [dashboard, discord] = await Promise.all([
    postToDashboard(config, event),
    postToDiscord(config, event),
  ]);
  return { dashboard, discord };
}

export function tradeExecutedEvent(opts: {
  direction: string;
  tokenMint: string;
  amountSol: number;
  signature: string | null;
  mode: string;
  status: string;
  error?: string;
  telegramId: string;
  whaleAddress: string;
}): ActivityEvent {
  return {
    type: 'trade_executed',
    ...opts,
    timestamp: Date.now(),
  };
}
