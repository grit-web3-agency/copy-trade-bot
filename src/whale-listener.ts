import { EventEmitter } from 'events';
import { withRetry } from './retry';

export interface WhaleTradeEvent {
  whaleAddress: string;
  direction: 'BUY' | 'SELL';
  tokenMint: string;
  amountSol: number;
  signature: string;
  timestamp: number;
}

// Abstraction for websocket so it can be mocked in tests
export interface WebSocketProvider {
  connect(url: string): void;
  send(data: string): void;
  close(): void;
  on(event: string, handler: (...args: any[]) => void): void;
}

// Default WebSocket provider using Node's built-in or ws module
class DefaultWebSocketProvider implements WebSocketProvider {
  private ws: any = null;

  connect(url: string): void {
    // Uses globalThis.WebSocket (Node 21+) or falls back gracefully
    const WS = (globalThis as any).WebSocket;
    if (!WS) {
      throw new Error('WebSocket not available. Install "ws" package or use Node 21+.');
    }
    this.ws = new WS(url);
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(data);
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.ws) return;
    if (typeof this.ws.on === 'function') {
      // ws-style (Node ws module)
      this.ws.on(event, handler);
    } else {
      // Browser-style WebSocket
      this.ws[`on${event}`] = handler;
    }
  }
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Known DEX program IDs for swap detection
const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const RAYDIUM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

export class WhaleListener extends EventEmitter {
  private watchedAddresses: Set<string> = new Set();
  private wsProvider: WebSocketProvider | null = null;
  private running = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private wsProviderFactory?: () => WebSocketProvider) {
    super();
  }

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

  // Start listening via Helius websocket with retry
  async start(wsUrl?: string): Promise<void> {
    if (this.running) return;

    if (!wsUrl) {
      // No websocket URL — run in stub mode (events emitted via simulateTrade)
      this.running = true;
      console.log(`[WhaleListener] Started in stub mode (no wsUrl). Monitoring ${this.watchedAddresses.size} addresses`);
      return;
    }

    await withRetry(
      async () => {
        this.connectWebSocket(wsUrl);
        this.running = true;
        console.log(`[WhaleListener] Connected to ${wsUrl}, monitoring ${this.watchedAddresses.size} addresses`);
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, err) => {
          console.warn(`[WhaleListener] Start retry ${attempt}: ${err}`);
          this.running = false;
        },
      }
    );
  }

  private connectWebSocket(wsUrl: string): void {
    const provider = this.wsProviderFactory
      ? this.wsProviderFactory()
      : new DefaultWebSocketProvider();

    provider.connect(wsUrl);
    this.wsProvider = provider;

    provider.on('open', () => {
      this.reconnectAttempts = 0;
      // Subscribe to account changes for watched addresses (Helius enhanced websocket)
      for (const address of this.watchedAddresses) {
        const subscribeMsg = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'transactionSubscribe',
          params: [
            { accountInclude: [address] },
            { commitment: 'confirmed', encoding: 'jsonParsed', transactionDetails: 'full' },
          ],
        });
        provider.send(subscribeMsg);
      }
    });

    provider.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data);
        if (msg.params?.result) {
          const parsed = this.parseTransaction(msg.params.result);
          if (parsed) {
            this.emit('trade', parsed);
          }
        }
      } catch (err) {
        console.error('[WhaleListener] Failed to parse ws message:', err);
      }
    });

    provider.on('close', () => {
      if (this.running && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.warn(`[WhaleListener] Connection closed, reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => {
          if (this.running) this.connectWebSocket(wsUrl);
        }, 1000 * this.reconnectAttempts);
      }
    });

    provider.on('error', (err: Error) => {
      console.error('[WhaleListener] WebSocket error:', err.message);
      this.emit('error', err);
    });
  }

  stop() {
    this.running = false;
    if (this.wsProvider) {
      this.wsProvider.close();
      this.wsProvider = null;
    }
    this.reconnectAttempts = 0;
    console.log('[WhaleListener] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // Parse a Solana transaction to detect swaps (buy/sell events)
  parseTransaction(tx: any): WhaleTradeEvent | null {
    try {
      if (!tx || !tx.signature) {
        console.warn('[WhaleListener] parseTransaction: missing signature');
        return null;
      }

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

      // Parse Helius enhanced transaction format
      if (tx.transaction) {
        return this.parseHeliusTx(tx, signerAddress);
      }

      // Parse token balance changes (fallback heuristic)
      if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
        return this.parseTokenBalanceChanges(tx, signerAddress);
      }

      return null;
    } catch (err) {
      console.error('[WhaleListener] parseTransaction error:', err);
      return null;
    }
  }

  // Parse Helius enhanced transaction format for swap detection
  private parseHeliusTx(tx: any, signerAddress: string): WhaleTradeEvent | null {
    const instructions = tx.transaction?.message?.instructions || [];
    const isDex = instructions.some((ix: any) =>
      ix.programId === JUPITER_PROGRAM || ix.programId === RAYDIUM_PROGRAM
    );

    if (!isDex) return null;

    // Look at SOL balance change to determine direction
    const preBalance = tx.meta?.preBalances?.[0] ?? 0;
    const postBalance = tx.meta?.postBalances?.[0] ?? 0;
    const solDelta = (postBalance - preBalance) / 1e9;

    // Find token mint involved (from postTokenBalances)
    const tokenBalances = tx.meta?.postTokenBalances || [];
    const tokenEntry = tokenBalances.find((b: any) => b.owner === signerAddress && b.mint !== SOL_MINT);
    if (!tokenEntry) return null;

    const direction: 'BUY' | 'SELL' = solDelta < -0.001 ? 'BUY' : 'SELL';
    const amountSol = Math.abs(solDelta);

    if (amountSol < 0.001) return null;

    return {
      whaleAddress: signerAddress,
      direction,
      tokenMint: tokenEntry.mint,
      amountSol,
      signature: tx.signature,
      timestamp: Date.now(),
    };
  }

  // Fallback: parse token balance changes to detect swaps
  private parseTokenBalanceChanges(tx: any, signerAddress: string): WhaleTradeEvent | null {
    const pre = tx.meta.preTokenBalances as any[];
    const post = tx.meta.postTokenBalances as any[];

    // Find token where signer's balance changed
    for (const postBal of post) {
      if (postBal.owner !== signerAddress || postBal.mint === SOL_MINT) continue;

      const preBal = pre.find((p: any) => p.owner === signerAddress && p.mint === postBal.mint);
      const preAmount = parseFloat(preBal?.uiTokenAmount?.uiAmountString || '0');
      const postAmount = parseFloat(postBal.uiTokenAmount?.uiAmountString || '0');
      const delta = postAmount - preAmount;

      if (Math.abs(delta) < 0.000001) continue;

      // Estimate SOL amount from lamport balance change
      const preBalance = tx.meta?.preBalances?.[0] ?? 0;
      const postBalance = tx.meta?.postBalances?.[0] ?? 0;
      const solDelta = Math.abs((postBalance - preBalance) / 1e9);

      return {
        whaleAddress: signerAddress,
        direction: delta > 0 ? 'BUY' : 'SELL',
        tokenMint: postBal.mint,
        amountSol: solDelta > 0.001 ? solDelta : 0.01,
        signature: tx.signature,
        timestamp: Date.now(),
      };
    }

    return null;
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
