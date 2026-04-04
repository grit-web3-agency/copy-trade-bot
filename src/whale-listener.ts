import { EventEmitter } from 'events';

export interface WhaleTradeEvent {
  whaleAddress: string;
  direction: 'BUY' | 'SELL';
  tokenMint: string;
  amountSol: number;
  signature: string;
  timestamp: number;
}

export class WhaleListener extends EventEmitter {
  private watchedAddresses: Set<string> = new Set();
  private wsConnection: any = null;
  private running = false;

  addAddress(address: string) {
    this.watchedAddresses.add(address);
  }

  removeAddress(address: string) {
    this.watchedAddresses.delete(address);
  }

  getWatchedAddresses(): string[] {
    return Array.from(this.watchedAddresses);
  }

  isWatching(address: string): boolean {
    return this.watchedAddresses.has(address);
  }

  // Start listening via Helius websocket (stub for devnet)
  async start(wsUrl?: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // In production: connect to websocket and handle errors
      console.log(`[WhaleListener] Started monitoring ${this.watchedAddresses.size} addresses`);
    } catch (err) {
      console.error('[WhaleListener] start error:', err);
      this.running = false;
      throw err;
    }
    // In production: connect to Helius websocket and subscribe to account changes
    // For MVP: we emit events manually or via the E2E demo script
  }

  stop() {
    this.running = false;
    if (this.wsConnection) {
      this.wsConnection = null;
    }
    console.log('[WhaleListener] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // Parse a Solana transaction to detect swaps
  // In production, this would parse Jupiter/Raydium swap instructions
  parseTransaction(tx: any): WhaleTradeEvent | null {
    try {
      // Stub: real implementation would decode instruction data
      // and detect token swap patterns (Jupiter route, Raydium swap, etc.)
      if (!tx || !tx.signature) return null;

      const signerAddress = tx.feePayer || tx.signer;
      if (!signerAddress || !this.watchedAddresses.has(signerAddress)) return null;

      // For demo/testing: accept pre-parsed trade events
      if (tx.parsedTrade) {
        return {
          whaleAddress: signerAddress,
          direction: tx.parsedTrade.direction,
          tokenMint: tx.parsedTrade.tokenMint,
          amountSol: tx.parsedTrade.amountSol,
          signature: tx.signature,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (err) {
      console.error('[WhaleListener] parseTransaction error:', err);
      return null;
    }
  }

  // Simulate a whale trade event (for testing and demos)
  simulateTrade(event: WhaleTradeEvent) {
    try {
      if (this.watchedAddresses.has(event.whaleAddress)) {
        this.emit('trade', event);
      }
    } catch (err) {
      console.error('[WhaleListener] simulateTrade error:', err);
    }
  }
}
