Payment adapter work (dev/sprint-5-payment-adapter)

- Resolved merge conflicts in src/payments/adapter.ts and unified adapter interfaces to support both legacy on-chain verification and newer server-side adapters.
- Implemented compatibility wrappers in src/payment.ts:
  - formatPlans(), formatSubscriptionStatus(), checkWhaleLimit(), checkDailyTradeLimit(), getTreasuryAddress(), getPaymentMode()
  - Kept formatPlansMessage and other service exports for tests.
- Updated Stripe mock implementation (src/payments/stripeMock.ts) to implement the newer adapter shape (activateSubscription, verifyPaymentTx) while remaining compatible with legacy providers.
- Adjusted bot and webhook handlers to accept both boolean and object return shapes from activateSubscription (backwards compatibility).
- Fixed TypeScript build errors and resolved test failures; ran full test suite (vitest) — all tests passed locally (241 tests).
- Committed changes to branch: dev/sprint-5-payment-adapter and pushed to remote: https://github.com/grit-web3-agency/copy-trade-bot (branch dev/sprint-5-payment-adapter).

Next steps:
- Open a PR from dev/sprint-5-payment-adapter  develop/main as appropriate and request review.
- If reviewers prefer a stricter single adapter shape, consolidate providers to the chosen API and remove compatibility shims.
- Add end-to-end demo/runbook for payment flows when integrating a real provider (Stripe) and CI checks for build/tests.

Change-log summary (files touched):
- src/payments/adapter.ts  unified adapter interface
- src/payment.ts  compatibility wrappers & helpers
- src/payments/stripeMock.ts  updated mock adapter
- src/payments/adapter.ts  resolved merge markers
- src/bot.ts, src/api/payments/webhook.ts  made robust to result shapes

Report generated on: 2026-06-24 04:14 (Asia/Bangkok)


---

Sprint continuation (automated reminder handled)

Actions performed (latest reminder):
- Re-read PROJECT_SPEC at /Users/m4/Web3_AI_Agency/projects/copy-trade-bot/PROJECT_SPEC.md and verified sprint plan and scope.
- Ran full test suite: npm test (vitest). Result: 964 tests collected, 963 passed, 1 skipped. All test files passed; overall test suite green.
- Branch checked: dev/auto-sprint-continue-20260627-work (no uncommitted changes except .claude worktrees)
- No further code changes required to pass tests.

Git summary (latest):
- Branch: dev/auto-sprint-continue-20260627-work
- Working tree: modified .claude worktrees (ignored for product changes)

Reminder handled at: 2026-06-28 22:09 (Asia/Bangkok)
