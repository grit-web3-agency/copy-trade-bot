Sprint: Sprint 4 (Payment module)
Branch: dev/sprint-4-payment-stub
Completed: 2026-05-02 11:59:00 Asia/Bangkok
Summary:
- Implemented payment module (payment.ts) with plans: free, basic, pro
- Added webhook handler at src/api/payments/webhook.ts
- Added bot commands: /plans and /subscribe to view and activate subscriptions
- Database support for payment_history and subscriptions (db.ts)
- All tests passing: 244 tests (vitest)
- Changes committed and pushed to origin/dev/sprint-4-payment-stub (commit acf8abc)
Notes:
- Payment mode defaults to mock. Live mode requires PAYMENT_MODE=live and an RPC connection for on-chain verification.
- Treasury address is configured via TREASURY_WALLET env var.
- Manual verification and webhook flow documented in PROJECT_SPEC.md
