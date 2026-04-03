# Copy-Trade Bot MVP (Solana)

Telegram bot that monitors whale wallets on Solana and auto-copies their trades via Jupiter Aggregator. **Devnet only — no real money.**

## Architecture

```
User (Telegram)
  → grammy Bot (/start /watch /copy /balance)
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
| `/help` | Show help message |

## Copy Policy

When a whale trade is detected:
1. Check if token is in whitelist (if configured)
2. Cap trade size to user's `max_trade_size_sol` (default 0.1 SOL)
3. Reject dust trades (< 0.001 SOL)
4. Execute dry-run trade via Jupiter quote API
5. Record trade in SQLite and notify user via Telegram

## Sprint Progress

- [x] Sprint 1: Scaffold + Listener
- [x] Sprint 2: Wallet + Executor
- [x] Sprint 3: Copy Logic + Demo
- [ ] Sprint 4: Polish + Deploy
