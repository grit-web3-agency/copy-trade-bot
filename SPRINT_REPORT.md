Sprint continuation — 2026-11-28

Branch: dev/sprint-4-payment-stub
Commits pushed:
- 659be741f6221569ff3aa6b34b4e532244b8bf2c — fix(payments): resolve merge conflict and TS errors in payment webhook/service (Signed-off-by: OpenClaw assistant <assistant@local>)

Work performed:
- Read and followed PROJECT_SPEC.md.
- Switched to branch dev/sprint-4-payment-stub (tracking origin/dev/sprint-4-payment-stub).
- Installed dependencies (npm install).
- Ran test suite (vitest): 241 tests passed, 0 failed.
- Built TypeScript project (npm run build): initial build failed due to merge conflict markers in src/api/payments/webhook.ts and a TypeScript typing error in src/payment.ts; fixed both issues.
  - Resolved merge conflict in src/api/payments/webhook.ts by merging lines handling boolean/object adapter results and normalizing error message handling.
  - Added legacy alias fields (plan_id, status) to Subscription interface in src/payments/service.ts to satisfy TypeScript typing and updated code in src/payment.ts to use plan alias safely.
- Re-ran tests and build: all tests still pass (241 passed), build succeeded.
- Committed changes and pushed to origin/dev/sprint-4-payment-stub.

Test & Build Results:
- Tests: 241 passed, 0 failed
- Build: ok (tsc completed)

Files changed:
- src/api/payments/webhook.ts (fixed merge conflict, improved result handling)
- src/payments/service.ts (added optional legacy alias fields)
- src/payment.ts (robust plan lookup; TS index fix)

Report path: ./SPRINT_REPORT.md

Notes / Remaining items:
- No credentials were required for these git operations; push succeeded to origin.
- Payments are feature-gated via environment flags (PAYMENT_MODE / ENABLE_PAYMENTS). Per PROJECT_SPEC, payments are allowed but must be devnet/mock by default.
- No further work required for this sprint per PROJECT_SPEC; no out-of-scope features added.

Signed-off-by: OpenClaw assistant <assistant@local>
