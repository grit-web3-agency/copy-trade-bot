import { Connection } from '@solana/web3.js';

const DEVNET_MARKERS = ['devnet', 'api.devnet.solana.com'];

export interface DevnetConfig {
  rpcUrl: string;
  enableLiveTrading: boolean;
  network: string;
}

export function loadDevnetConfig(): DevnetConfig {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const enableLiveTrading = process.env.ENABLE_LIVE_DEVNET === 'true';

  return { rpcUrl, enableLiveTrading, network };
}

export function isDevnetUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return DEVNET_MARKERS.some(marker => lower.includes(marker));
}

export function assertDevnetRpc(rpcUrl: string): void {
  if (!isDevnetUrl(rpcUrl)) {
    throw new Error(
      `Safety check failed: RPC URL does not appear to be devnet. ` +
      `Got: ${rpcUrl}. Only devnet is allowed for MVP.`
    );
  }
}

export function getDevnetConnection(rpcUrl?: string): Connection {
  const url = rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  assertDevnetRpc(url);
  return new Connection(url);
}
