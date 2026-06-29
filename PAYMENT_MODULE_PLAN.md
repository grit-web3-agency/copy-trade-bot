PAYMENT MODULE - Plan & Stub

Date: 2026-04-25 14:10 Asia/Bangkok
Branch: dev/sprint-4-payment-stub

Goal: Implement a minimal payment/membership module (Nice-to-Have from PROJECT_SPEC) without using paid services. Must remain devnet-only and free-tier.

Tasks:
1) Design API surface (verifyPayment(txSig, amountSol) => boolean) - stub that returns true in dev/test.
2) Add DB schema (payments table) - store txSig, userId, amount, timestamp, status.
3) Add CLI/Telegram command hooks (/subscribe, /verify-payment) - CLI wiring later; for now, document.
4) Add unit tests (vitest) that mock Helius/Explorer verification and assert dev behavior.
5) Implement non-blocking: default to devnet/mock verify in config when Helius/Explorer credentials not present.

Estimates:
- Design + tests + docs: 2-3 hours
- Implementation + integration: 3-5 hours

Notes:
- Must follow PROJECT_SPEC rules: devnet-only, free-tier, repo grit-web3-agency/copy-trade-bot.
- No production payment gateway integrations in MVP (out of scope).

