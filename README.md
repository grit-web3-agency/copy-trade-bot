# Copy-Trade Bot MVP (Solana)

Telegram bot that monitors whale wallets on Solana and auto-copies their trades via Jupiter Aggregator. **Devnet only — no real money.**

## Architecture

```
User (Telegram)
  → grammy Bot (/start /watch /copy /balance /settings)
    → Wallet Manager (create/encrypt/store keypairs)
    → Whale Listener (Helius websocket → parse txs)
    → Copy Policy (filter: token match, size limit, slippage)
    → Trade Executor (Jupiter swap API → sign; dry-run or devnet)
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
| `DEVNET_RPC` | No | Devnet RPC for real trades (defaults to `https://api.devnet.solana.com`). **Must be a devnet endpoint** — mainnet URLs are rejected at startup. |

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
| `/mode dry-run\|devnet` | Switch trading mode (per-user) |
| `/balance` | Check wallet balance |
| `/pnl` | View profit & loss summary (realized, unrealized, positions) |
| `/settings [max <SOL>] [slippage <bps>]` | View or update user settings |
| `/settings set-mode dry-run\|devnet` | Alias to switch trading mode |
| `/help` | Show help message |

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

## Devnet Trading (Per-User Mode Toggle)

Each user can independently choose between **dry-run** (simulation) and **devnet** (real devnet transactions) mode.

### Switching modes

```
/mode devnet        # enable real devnet trading
/mode dry-run       # back to simulation (default)
/settings set-mode devnet   # same thing via /settings
```

### How it works

1. Default mode is `dry-run` — trades are simulated (Jupiter quote only, no tx sent).
2. When mode is `devnet`, the bot signs and submits transactions to Solana **devnet** via Jupiter.
3. **Mainnet safety**: The bot validates all RPC endpoints on startup and before every trade. Any mainnet URL is rejected with an error.
4. Fund your devnet wallet with the [Solana faucet](https://faucet.solana.com) before switching to devnet mode.

### Running a devnet dry-run demo

```bash
# 1. Run unit tests (no network needed)
npm test

# 2. Run E2E demo (simulated, no BOT_TOKEN needed)
npm run demo

# 3. (Optional) Start bot with devnet trading
cp .env.example .env
# Edit .env: set BOT_TOKEN, optionally set DEVNET_RPC
npm run dev
# In Telegram: /mode devnet → /copy on → watch a whale
```

## PnL Tracking

The `/pnl` command shows your profit & loss across all copy trades:

```
/pnl
```

Example output:
```
📊 PnL Summary

Realized: +1.5000 SOL
Unrealized: +0.5000 SOL
Total: +2.0000 SOL

Positions:
• TokenA...AAAA: 50.0000 qty @ avg 0.010000 | now 0.020000 | PnL: +2.0000
• TokenB...BBBB: closed | realized: -0.3000

Last 5 trades:
• BUY TokenA...AAAA 0.1 SOL @ 0.010000 [dry]
• SELL TokenB...BBBB 0.2 SOL @ 0.005000 [dry]
```

**How it works:**
- Uses average cost basis method to compute realized PnL on sells
- Fetches current token prices from Jupiter Price API for unrealized PnL
- Tracks positions per token with entry price, quantity, and fees
- PnL snapshots are persisted in SQLite for fast retrieval

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
- [x] Sprint 6: PnL Tracking
