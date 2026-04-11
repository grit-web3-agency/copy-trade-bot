/**
 * Environment variable validation.
 * Validates required and optional env vars at startup with clear error messages.
 */

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnv(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Required ---
  if (!process.env.BOT_TOKEN) {
    errors.push('BOT_TOKEN is required. Get one from @BotFather on Telegram.');
  }

  // --- RPC validation ---
  const devnetRpc = process.env.DEVNET_RPC;
  const solanaRpc = process.env.SOLANA_RPC_URL;

  if (!devnetRpc && !solanaRpc) {
    warnings.push(
      'Neither DEVNET_RPC nor SOLANA_RPC_URL is set. ' +
      'Falling back to public https://api.devnet.solana.com (rate-limited).'
    );
  }

  // Warn if RPC looks like a placeholder
  const rpcUrl = devnetRpc || solanaRpc || '';
  if (rpcUrl && (rpcUrl.includes('YOUR_KEY') || rpcUrl.includes('your_'))) {
    errors.push(
      `RPC URL contains a placeholder value: "${rpcUrl}". ` +
      'Replace with a real endpoint (e.g., from Helius free tier).'
    );
  }

  // --- WebSocket ---
  if (!process.env.SOLANA_WS_URL) {
    warnings.push(
      'SOLANA_WS_URL is not set. Whale listener will use default WebSocket. ' +
      'Set this to a Helius devnet WebSocket URL for better reliability.'
    );
  }

  // --- Network safety ---
  if (process.env.SOLANA_NETWORK && process.env.SOLANA_NETWORK !== 'devnet') {
    errors.push(
      `SOLANA_NETWORK is set to "${process.env.SOLANA_NETWORK}" but this bot is devnet-only. ` +
      'Set SOLANA_NETWORK=devnet or remove it.'
    );
  }

  // --- Optional config validation ---
  const maxTrade = process.env.DEFAULT_MAX_TRADE_SIZE_SOL;
  if (maxTrade !== undefined) {
    const val = parseFloat(maxTrade);
    if (isNaN(val) || val <= 0) {
      errors.push(`DEFAULT_MAX_TRADE_SIZE_SOL must be a positive number, got "${maxTrade}".`);
    }
  }

  const slippage = process.env.DEFAULT_SLIPPAGE_BPS;
  if (slippage !== undefined) {
    const val = parseInt(slippage, 10);
    if (isNaN(val) || val < 0 || val > 10000) {
      errors.push(`DEFAULT_SLIPPAGE_BPS must be 0-10000, got "${slippage}".`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
