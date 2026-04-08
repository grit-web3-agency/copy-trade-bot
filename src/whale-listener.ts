import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { withRetry } from './retry';

export interface WhaleTradeEvent {
  whaleAddress: string;
  direction: 'BUY' | 'SELL';
  tokenMint: string;
  amountSol: number;
  signature: string;
  timestamp: number;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export class WhaleListener extends EventEmitter {
  private watchedAddresses: Set<string> = new Set();
  private wsConnection: WebSocket | null = null;
  private running = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptionIds: Map<string, number> = new Map();
  private wsUrl: string | null = null;
  private nextId = 1;

  addAddress(address: string) {
    this.watchedAddresses.add(address);
    // If already connected, subscribe to the new address immediately
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.subscribeAddress(address);
    }
  }

  removeAddress(address: string) {
    this.watchedAddresses.delete(address);
    // Unsubscribe if connected
    const subId = this.subscriptionIds.get(address);
    if (subId !== undefined && this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'accountUnsubscribe',
        params: [subId],
      }));
      this.subscriptionIds.delete(address);
    }
  }

  getWatchedAddresses(): string[] {
    return Array.from(this.watchedAddresses);
  }

  isWatching(address: string): boolean {
    return this.watchedAddresses.has(address);
  }

  async start(wsUrl?: string): Promise<void> {
    if (this.running) return;

    this.wsUrl = wsUrl || null;

    await withRetry(
      async () => {
        this.running = true;

        if (this.wsUrl) {
          this.connectWebSocket(this.wsUrl);
        }

        console.log(`[WhaleListener] Started monitoring ${this.watchedAddresses.size} addresses`);
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

  private connectWebSocket(url: string) {
    try {
      this.wsConnection = new WebSocket(url);

      this.wsConnection.on('open', () => {
        console.log('[WhaleListener] WebSocket connected');
        this.reconnectAttempts = 0;
        // Subscribe to all watched addresses
        for (const address of this.watchedAddresses) {
          this.subscribeAddress(address);
        }
        this.emit('ws:connected');
      });

      this.wsConnection.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleWsMessage(msg);
        } catch (err) {
          console.error('[WhaleListener] Failed to parse WS message:', err);
        }
      });

      this.wsConnection.on('close', () => {
        console.warn('[WhaleListener] WebSocket disconnected');
        this.subscriptionIds.clear();
        this.emit('ws:disconnected');
        if (this.running) {
          this.scheduleReconnect();
        }
      });

      this.wsConnection.on('error', (err: Error) => {
        console.error('[WhaleListener] WebSocket error:', err.message);
        this.emit('ws:error', err);
      });
    } catch (err) {
      console.error('[WhaleListener] connectWebSocket error:', err);
    }
  }

  private subscribeAddress(address: string) {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) return;

    const id = this.nextId++;
    // Use accountSubscribe to watch for on-chain changes to the address
    this.wsConnection.send(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'accountSubscribe',
      params: [
        address,
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ],
    }));
  }

  private handleWsMessage(msg: any) {
    // Handle subscription confirmations
    if (msg.id && msg.result !== undefined) {
      // Store subscription ID (we'd need to map id -> address for full tracking)
      return;
    }

    // Handle account change notifications
    if (msg.method === 'accountNotification' && msg.params) {
      this.handleAccountNotification(msg.params);
    }

    // Handle Helius-enhanced transaction notifications
    if (msg.method === 'transactionNotification' && msg.params) {
      this.handleTransactionNotification(msg.params);
    }
  }

  private handleAccountNotification(params: any) {
    // Account change detected — fetch recent signatures to find the trade
    // This is a lightweight notification; detailed parsing requires getTransaction
    const subscription = params.subscription;
    const value = params.result?.value;
    if (value) {
      this.emit('account:change', { subscription, value });
    }
  }

  private handleTransactionNotification(params: any) {
    // Helius enhanced websocket sends full parsed transactions
    const tx = params.result;
    if (!tx) return;

    const parsed = this.parseTransaction(tx);
    if (parsed) {
      this.emit('trade', parsed);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[WhaleListener] Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      this.emit('ws:maxReconnect');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    console.log(`[WhaleListener] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.running && this.wsUrl) {
        this.connectWebSocket(this.wsUrl);
      }
    }, delay);
  }

  stop() {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.wsConnection) {
      try {
        this.wsConnection.close();
      } catch {
        // ignore close errors
      }
      this.wsConnection = null;
    }
    this.subscriptionIds.clear();
    this.reconnectAttempts = 0;
    console.log('[WhaleListener] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // Parse a Solana transaction to detect swaps
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

      // Parse Helius enhanced transaction format (nativeTransfers + tokenTransfers)
      if (tx.nativeTransfers || tx.tokenTransfers) {
        return this.parseHeliusTx(tx, signerAddress);
      }

      // Parse standard Solana transaction format (meta.preBalances/postBalances)
      if (tx.meta && tx.transaction) {
        return this.parseStandardTx(tx, signerAddress);
      }

      return null;
    } catch (err) {
      console.error('[WhaleListener] parseTransaction error:', err);
      return null;
    }
  }

  private parseHeliusTx(tx: any, signerAddress: string): WhaleTradeEvent | null {
    const nativeTransfers: any[] = tx.nativeTransfers || [];
    const tokenTransfers: any[] = tx.tokenTransfers || [];

    if (tokenTransfers.length === 0) return null;

    // Find the token transfer involving the signer
    const signerTokenTransfer = tokenTransfers.find(
      (t: any) => t.fromUserAccount === signerAddress || t.toUserAccount === signerAddress
    );
    if (!signerTokenTransfer) return null;

    // Find the native SOL transfer involving the signer (swap counterpart)
    const signerNativeTransfer = nativeTransfers.find(
      (t: any) => t.fromUserAccount === signerAddress || t.toUserAccount === signerAddress
    );

    const tokenMint = signerTokenTransfer.mint;
    if (!tokenMint || tokenMint === SOL_MINT) return null;

    // Determine direction: if signer sends SOL and receives token = BUY
    const signerSentSol = signerNativeTransfer && signerNativeTransfer.fromUserAccount === signerAddress;
    const signerReceivedToken = signerTokenTransfer.toUserAccount === signerAddress;

    let direction: 'BUY' | 'SELL';
    if (signerSentSol && signerReceivedToken) {
      direction = 'BUY';
    } else if (!signerSentSol && !signerReceivedToken) {
      direction = 'SELL';
    } else {
      return null; // ambiguous — skip
    }

    const amountLamports = signerNativeTransfer
      ? Math.abs(Number(signerNativeTransfer.amount || 0))
      : 0;
    const amountSol = amountLamports / 1e9;

    if (amountSol < 0.001) return null; // dust filter

    return {
      whaleAddress: signerAddress,
      direction,
      tokenMint,
      amountSol,
      signature: tx.signature,
      timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
    };
  }

  private parseStandardTx(tx: any, signerAddress: string): WhaleTradeEvent | null {
    const meta = tx.meta;
    if (!meta || meta.err) return null;

    const accountKeys: string[] = (tx.transaction?.message?.accountKeys || []).map(
      (k: any) => (typeof k === 'string' ? k : k.pubkey)
    );

    const signerIdx = accountKeys.indexOf(signerAddress);
    if (signerIdx === -1) return null;

    // Compute SOL balance change for the signer
    const preBalance = meta.preBalances?.[signerIdx] ?? 0;
    const postBalance = meta.postBalances?.[signerIdx] ?? 0;
    const solDelta = (postBalance - preBalance) / 1e9;

    // Find token balance changes
    const preTokenBalances: any[] = meta.preTokenBalances || [];
    const postTokenBalances: any[] = meta.postTokenBalances || [];

    // Find token mints that changed for the signer
    const signerTokenChanges = postTokenBalances
      .filter((b: any) => b.owner === signerAddress)
      .map((post: any) => {
        const pre = preTokenBalances.find(
          (p: any) => p.owner === signerAddress && p.mint === post.mint
        );
        const preAmount = pre ? Number(pre.uiTokenAmount?.uiAmount || 0) : 0;
        const postAmount = Number(post.uiTokenAmount?.uiAmount || 0);
        return { mint: post.mint, delta: postAmount - preAmount };
      })
      .filter((c: any) => Math.abs(c.delta) > 0);

    if (signerTokenChanges.length === 0) return null;

    const tokenChange = signerTokenChanges[0];
    const tokenMint = tokenChange.mint;
    if (!tokenMint || tokenMint === SOL_MINT) return null;

    // BUY: SOL decreased, token increased
    // SELL: SOL increased, token decreased
    let direction: 'BUY' | 'SELL';
    if (solDelta < 0 && tokenChange.delta > 0) {
      direction = 'BUY';
    } else if (solDelta > 0 && tokenChange.delta < 0) {
      direction = 'SELL';
    } else {
      return null;
    }

    const amountSol = Math.abs(solDelta);
    if (amountSol < 0.001) return null;

    return {
      whaleAddress: signerAddress,
      direction,
      tokenMint,
      amountSol,
      signature: tx.signature,
      timestamp: Date.now(),
    };
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
