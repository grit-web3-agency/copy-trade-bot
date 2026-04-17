PROOFS for Copy-Trade Bot (Solana)

- Created: initial scaffold

## Sprint-2 Demo — 2026-04-03T06:07:04.062Z

Mode: DRY-RUN (network unavailable)
RPC: https://api.devnet.solana.com

- **Trade 1** (follower `5Kx2JXQN…`): DRY-RUN — policy passed, tx simulated
- **Trade 2** (follower `8piKf4rV…`): DRY-RUN — policy passed, tx simulated
- **Trade 3** (follower `63LBD3Kn…`): DRY-RUN — policy passed, tx simulated

> Note: Airdrop/network calls failed; results are dry-run simulations.

## Demo run (automated) — 2026-04-04T13:52:50.663154+07:00

Mode: DRY-RUN

Log:
=== Copy-Trade Bot — DEMO (dry-run) ===

Simulated trade detected:
{
  "signature": "DEMO_SIG_1775285561994",
  "from": "11111111111111111111111111111111",
  "to": "25hbscNoZ6Zf6m5YCJEPWFkTsJKbtn6Qdo2p4khAwKFe",
  "amount": 50000000
}

[DRY-RUN] Would send 0.05 SOL → 25hbscNoZ6Zf6m5YCJEPWFkTsJKbtn6Qdo2p4khAwKFe
Executor result: { success: true, dryRun: true }

Demo complete. Use 'start' command with real keys for live mode.

## Sprint-4 Demo — 2026-04-18

### Unit Tests (20/20 passed)

```
PASS src/__tests__/policy.test.ts
PASS src/__tests__/listener.test.ts
PASS src/__tests__/poster.test.ts
PASS src/__tests__/bot.test.ts

Test Suites: 4 passed, 4 total
Tests:       20 passed, 20 total
```

### Demo Dry-Run

```
=== Copy-Trade Bot — DEMO (dry-run) ===

Simulated trade detected:
{
  "signature": "DEMO_SIG_1776468014582",
  "from": "11111111111111111111111111111111",
  "to": "7KEDCncEhtN7kHbdMNETgnLcJ46Kwhoz6a9RMoNDvbCY",
  "amount": 50000000
}

[DRY-RUN] Would send 0.05 SOL → 7KEDCncEhtN7kHbdMNETgnLcJ46Kwhoz6a9RMoNDvbCY
Executor result: { success: true, dryRun: true }

Demo complete. Use 'start' command with real keys for live mode.
```

### Sprint-4 Changes

- Added `/settings` command (max trade size, slippage %, poster toggle)
- Added `/watch`, `/copy`, `/balance` commands to Telegram bot
- Improved error handling with structured log prefixes
- Poster respects user toggle (`posterEnabled`) — no spam when off
- PM2 ecosystem config (`ecosystem.config.js`) for deployment
- Unit tests expanded: 20 tests across 4 suites (bot settings, poster toggle, policy, listener)
