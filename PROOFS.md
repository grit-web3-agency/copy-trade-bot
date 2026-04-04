# PROOFS — Copy-Trade Bot MVP

## Sprint 3: Copy Logic + Demo

### Unit Tests (22/22 passing)

```
 ✓ tests/whale-listener.test.ts  (4 tests)
 ✓ tests/watch-command.test.ts   (7 tests)
 ✓ tests/copy-policy.test.ts     (11 tests)

 Test Files  3 passed (3)
      Tests  22 passed (22)
```

### E2E Demo Output (Devnet Dry-Run)

```
============================================================
  COPY-TRADE BOT — E2E DEMO (Devnet Dry-Run)
============================================================

[1] Initializing in-memory database...
[2] Registering user (telegram_id=demo_user)...
    User created: demo_user
[3] Creating Solana wallet...
    Wallet: GES1e4tUzm299nthVV9ngyG5puhqcE4UTciQZdVkrRCU
[4] Adding whale to watch list: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
[5] Enabling copy trading...
[6] Starting whale listener...
[7] Simulating whale BUY event...

[WHALE DETECTED] BUY 2.5 SOL → EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    → Copy Policy caps to 0.1 SOL (max_trade_size)
    → Dry-run trade executed successfully

[8] Simulating whale SELL event...

[WHALE DETECTED] SELL 1.0 SOL → EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    → Copy Policy caps to 0.1 SOL (max_trade_size)
    → Dry-run trade executed successfully

============================================================
  DEMO SUMMARY
============================================================
  Trades executed (dry-run): 2
  Notifications sent: 2
  All trades were DRY-RUN only. No real transactions sent.
============================================================
```

---

## Sprint 4: Polish + Deploy

### What changed
- **Retry with backoff** (`src/retry.ts`): All RPC/Jupiter calls retry up to 3x with exponential backoff.
- **Double-spend guard** (`src/trade-executor.ts`): In-flight trade set prevents concurrent duplicate trades.
- **Settings validation** (`src/bot.ts`): `/settings` now validates bounds (max: 0.001–10 SOL, slippage: 1–5000 bps).
- **Error handling**: Improved logging and error paths across whale-listener, trade-executor, and copy-policy.
- **New tests**: `settings.test.ts`, `retry.test.ts`, `trade-executor.test.ts`, `error-handling.test.ts`.
- **Documentation**: Updated README with full usage guide; this PROOFS.md with E2E checklist.

### Unit Tests

```
 ✓ tests/whale-listener.test.ts   — WhaleListener core
 ✓ tests/watch-command.test.ts    — /watch DB operations
 ✓ tests/copy-policy.test.ts      — Copy policy + processWhaleTrade
 ✓ tests/settings.test.ts         — /settings DB operations
 ✓ tests/retry.test.ts            — withRetry utility
 ✓ tests/trade-executor.test.ts   — TradeExecutor + double-spend guard
 ✓ tests/error-handling.test.ts   — WhaleListener error paths
```

---

## E2E Dry-Run Checklist

Follow these steps to verify the bot works end-to-end in dry-run mode.

### Prerequisites
- Node.js 18+
- `npm install` completed
- No `BOT_TOKEN` needed for the demo script

### Steps

1. **Run unit tests**
   ```bash
   npm run test
   ```
   Expected: All tests pass.

2. **Run E2E demo script**
   ```bash
   npm run demo
   ```
   Expected: See output similar to Sprint 3 demo above — two dry-run trades executed, notifications logged.

3. **Build the project**
   ```bash
   npm run build
   ```
   Expected: No TypeScript errors, `dist/` directory created.

4. **Manual Telegram test** (optional, requires BOT_TOKEN)
   ```bash
   echo "BOT_TOKEN=your_token_here" > .env
   npm run dev
   ```
   Then in Telegram:
   - Send `/start` — should create wallet and show welcome message
   - Send `/settings` — should show default settings (0.1 SOL, 100 bps)
   - Send `/settings max 0.5 slippage 200` — should update and confirm
   - Send `/settings max 999` — should show validation error
   - Send `/watch 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM` — should confirm watching
   - Send `/copy on` — should enable copy trading
   - Send `/balance` — should show wallet balance (0 on devnet)

### Evidence to collect
- Screenshot or terminal output of `npm run test` (all green)
- Screenshot or terminal output of `npm run demo` (trades logged)
- Screenshot or terminal output of `npm run build` (no errors)
- (Optional) Telegram screenshots of `/settings` command in action
