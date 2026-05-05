Payment adapter work (dev/sprint-4-payment-stub)

- Added a pluggable payments adapter architecture under src/payments/:
  - src/payments/adapter.ts — PaymentAdapter interface
  - src/payments/stripeMock.ts — Stripe-style mock adapter (default)
  - src/payments/service.ts — DB-level subscription service and plans

- Facade exported at src/payment.ts for backwards compatibility (PLANS, createSubscription, getUserPlan, etc.)
- Added env-validation for ENABLE_PAYMENTS and PAYMENT_MODE; real providers blocked on non-devnet networks.
- Tests: updated/added tests/payment.test.ts (unit tests for adapter/service). Ran targeted vitest for these tests — they pass locally.

Notes:
- I resolved merge conflicts and committed changes on branch dev/sprint-4-payment-stub.
- Next steps: create/update PR and run repository-wide checks as requested.
