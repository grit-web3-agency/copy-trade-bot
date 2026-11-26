# SPRINT_CONTINUE — 2026-11-26 (additional payment hardening)

Summary of additional automated changes applied during scheduled reminder handling:

1) Database safety
- Added partial unique index on subscriptions(tx_signature) to prevent replayed transaction signatures (file: src/payments/service.ts, function initPaymentSchema).
- Modified createSubscription to check for existing tx_signature and to perform the replacement+insert inside a single transaction (better-sqlite3 transaction wrapper).

2) Feature gating
- Exposed isPaymentsEnabled() in src/payment.ts (returns true only when ENABLE_PAYMENTS=true).
- Bot: /subscribe now checks the global flag and rejects paid subscriptions if payments are disabled (src/bot.ts).
- Webhook: handlePaymentWebhook rejects processing if ENABLE_PAYMENTS is false (src/api/payments/webhook.ts).

3) Tests
- Ran full test suite after changes: 241 tests passed locally.

4) Git
- Committed and pushed changes to branch: fix/payment-verify-20261126 (origin)

Next recommended steps:
- Run a DB migration/dedupe if applying the index to an existing production DB that may contain duplicate tx_signature entries.
- Implement remaining prioritized items from Claude review (unique index done; next: enforce ENABLE_PAYMENTS in other code paths, consolidate adapter, add CI, etc.).
- Open PR and request reviewers for the branch fix/payment-verify-20261126 → dev/sprint-5-payment-adapter or appropriate base.

Recorded by: automated reminder handler
Timestamp: 2026-11-26 23:58 Asia/Bangkok
