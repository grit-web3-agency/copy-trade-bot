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
- Open a PR from dev/sprint-5-payment-adapter → develop/main as appropriate and request review.
- If reviewers prefer a stricter single adapter shape, consolidate providers to the chosen API and remove compatibility shims.
- Add end-to-end demo/runbook for payment flows when integrating a real provider (Stripe) and CI checks for build/tests.

Change-log summary (files touched):
- src/payments/adapter.ts — unified adapter interface
- src/payment.ts — compatibility wrappers & helpers
- src/payments/stripeMock.ts — updated mock adapter
- src/payments/adapter.ts — resolved merge markers
- src/bot.ts, src/api/payments/webhook.ts — made robust to result shapes

Report generated on: 2026-06-24 04:14 (Asia/Bangkok)

---

Automated sprint continuation report

- Run by: automated reminder handler
- Time (Asia/Bangkok): 2026-11-23 03:55
- Actions performed:
  - Read PROJECT_SPEC.md and confirmed scope & rules (dev-only, devnet-only, no external repos).
  - Confirmed current branch: dev/sprint-5-payment-adapter
  - Ran test suite: vitest → 241 tests passed (no failures)
  - Ran build: npm run build → success
  - No code changes required during this automated continuation step.

- Git:
  - Local branch dev/sprint-5-payment-adapter is in sync with origin (no ahead/behind commits).

Notes / Next steps:
- If you want me to open a PR or notify reviewers, tell me and provide target branch and reviewer list.
- To send the routine Telegram report to the boss automatically, place BOT_TOKEN and chat_id into the repo .env or instruct me to send now and provide credentials.

Report appended by automated process.

Maintenance update (automated continuation):

- Time (Asia/Bangkok): 2026-11-24 04:55
- Actions performed:
  - Created maintenance branch: dev/continue-sprint-20261124 (from dev/sprint-4-payment-stub)
  - Ran full test suite (vitest) → 241 tests passed
  - Built project (npm run build) → success
  - Created a small maintenance commit (runs tests/build and appends this note) and pushed branch to origin

Notes:
- No must-have sprint work remained in PROJECT_SPEC; this commit is purely maintenance to record continuation and ensure tests/build are green.
- Automated Telegram delivery remains disabled: BOT_TOKEN and BOSS_CHAT_ID are not configured in project .env (see .env.example).

Report appended by automated continuation handler.
