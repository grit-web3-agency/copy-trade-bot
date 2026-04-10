# Copy-Trade Bot MVP (Solana)

Telegram bot that monitors whale wallets on Solana and auto-copies their trades via Jupiter Aggregator. **Devnet only — no real money.**

## Architecture

```
User (Telegram)
  → grammy Bot (/start /watch /copy /balance /settings)
    → Wallet Manager (create/encrypt/store keypairs)
    → Whale Listener (Helius websocket → parse txs)
    → Copy Policy (filter: token match, size limit, slippage)
    → Trade Executor (Jupiter swap API → sign, dry-run only)
    → SQLite DB (users, wallets, trades, settings)
```

## Tech Stack

- **Language:** TypeScript / Node.js
- **Bot:** grammy
- **Blockchain:** @solana/web3.js
- **DEX:** Jupiter Aggregator API
- **RPC:** Helius (free tier)
- **Database:** SQLite (better-sqlite3)
- **Testing:** vitest

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your BOT_TOKEN and HELIUS_API_KEY
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `SOLANA_RPC_URL` | No | Solana RPC endpoint (defaults to devnet) |
| `SOLANA_WS_URL` | No | Helius websocket URL for whale monitoring |
| `PAYMENT_MODE` | No | `mock` (default) or `live` — mock skips on-chain verification |
| `TREASURY_WALLET` | No | Treasury wallet address for subscription payments |

## Commands

```bash
npm run dev      # Start bot (requires BOT_TOKEN)
npm run test     # Run unit tests
npm run demo     # Run E2E dry-run demo
npm run build    # Compile TypeScript
```

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Register & create Solana wallet |
| `/watch [address]` | Add whale address to monitoring |
| `/copy on\|off` | Toggle copy trading |
| `/balance` | Check wallet balance |
| `/settings [max <SOL>] [slippage <bps>]` | View or update user settings |
| `/help` | Show help message |
| `/plan` | View available subscription plans |
| `/subscribe [plan] [tx_sig]` | Activate a subscription plan |

### /settings Usage

View current settings:
```
/settings
```

Update max trade size (0.001–10 SOL):
```
/settings max 0.5
```

Update slippage (1–5000 bps):
```
/settings slippage 200
```

Update both at once:
```
/settings max 0.5 slippage 200
```

## Copy Policy

When a whale trade is detected:
1. Check if token is in whitelist (if configured)
2. Cap trade size to user's `max_trade_size_sol` (default 0.1 SOL)
3. Reject dust trades (< 0.001 SOL)
4. Execute dry-run trade via Jupiter quote API
5. Record trade in SQLite and notify user via Telegram

## Error Handling

All errors are handled gracefully — the bot never crashes on user-facing operations.

| Layer | Strategy |
|-------|----------|
| **Bot commands** | Each `/command` handler is wrapped in try-catch. Errors return a user-friendly message ("Something went wrong…") and log details with `[Bot]` prefix. |
| **Whale listener** | `parseTransaction()` returns `null` on malformed data. `start()` retries up to 3× with backoff. Listener errors are caught in `index.ts` so the bot continues running. |
| **Trade executor** | Jupiter API calls retry 3× with exponential backoff (500ms base, 5s max). In-flight trade guard prevents double-spend. Failed trades are recorded to DB with `dry-run-error` status. |
| **Copy policy** | Rejected trades are logged and the user is notified with the reason. Processing errors per-user don't block other users. |
| **Process-level** | `uncaughtException` and `unhandledRejection` handlers prevent silent crashes. `SIGINT`/`SIGTERM` trigger graceful shutdown. |
| **Structured logging** | All modules log with `[ModuleName]` prefix for easy filtering (e.g., `[Bot]`, `[TradeExecutor]`, `[WhaleListener]`). |

## Payment Module (Membership)

The payment module provides subscription plans that control whale monitoring and trade limits. **Runs in mock mode by default — no real money.**

### Plans

| Plan | Price | Whales | Trades/Day |
|------|-------|--------|------------|
| Free | 0 SOL | 1 | 5 |
| Basic | 0.1 SOL/mo | 5 | 50 |
| Pro | 0.5 SOL/mo | 20 | Unlimited |

### Running in Dev Mode

Set `PAYMENT_MODE=mock` in `.env` (default). This skips on-chain payment verification so you can test subscription flows without real SOL.

### Seed a Test Subscription

```bash
# Seed a free plan for user 12345
npm run seed:subscription -- 12345

# Seed a pro plan
npm run seed:subscription -- 12345 pro
```

### Run Payment Migrations

If upgrading from an older database without the `payment_history` table:

```bash
npm run migrate:payments
# Or specify a custom DB path:
npm run migrate:payments -- /path/to/copytrade.db
```

### Webhook Simulation (Dev/Test)

The webhook handler at `src/api/payments/webhook.ts` simulates payment processor callbacks. It validates incoming payloads, records events in `payment_history`, and activates subscriptions on confirmation. This is for dev/test use only.

### Running Payment Tests

```bash
npm run test              # runs all tests including payment tests
npm run test -- payment   # run only payment-related tests
```

## Deployment

### Local development

```bash
cp .env.example .env   # set BOT_TOKEN
npm run dev
```

### Production (PM2)

```bash
# 1. Build TypeScript
npm run build

# 2. Start with PM2
pm2 start ecosystem.config.js

# 3. Monitor logs
pm2 logs copy-trade-bot

# 4. Restart / stop
pm2 restart copy-trade-bot
pm2 stop copy-trade-bot
```

**PM2 config** (`ecosystem.config.js`):
- Auto-restart on crash (max 5 restarts with 5s delay)
- Log timestamps enabled
- `NODE_ENV=production`

### Quick start script

```bash
bash scripts/start_pm2.sh
```

### Health check

```bash
pm2 status          # process running?
pm2 logs --lines 50 # recent output
```

## Sprint Progress

- [x] Sprint 1: Scaffold + Listener
- [x] Sprint 2: Wallet + Executor
- [x] Sprint 3: Copy Logic + Demo
- [x] Sprint 4: Polish + Deploy
