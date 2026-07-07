PR Title: sprint-5: payment-adapter compatibility shims + tests

Summary (3–4 lines):
- Adds a pluggable payment-adapter compatibility layer and shims to unify adapter behaviour across providers.
- Includes unit tests and compatibility tests; build and vitest runs are green locally (241 tests passing).
- Payments remain feature-flagged (ENABLE_PAYMENTS) and disabled by default; no credentials or live providers were added.

Detailed description / changelog:
- Implemented PaymentAdapter interface and compatibility shims to support multiple provider integrations.
- Added unit tests covering adapter behaviour and payment edge-cases (mocked network failures included).
- Updated README and .env.example to document ENABLE_PAYMENTS, ENABLE_LIVE_DEVNET, and required env vars for e2e (HELIUS_KEY, DEVNET_RPC).
- Kept payments disabled by default; demo/e2e scripts remain gated behind environment variables and explicit authorization.

Why this change:
- Consolidates multiple ad-hoc payment stubs into a single, testable adapter API so future provider integrations are straightforward and safer.

Testing performed:
- npm run build ✅
- npm run test (vitest) ✅ — 241 tests passed locally. Logs include expected mocked external-service warnings (Jupiter quote retries, Poster dashboard POST errors) which are non-blocking.
- Regression checks: WalletManager decryptSecret error observed in tests is part of an error-handling test and expected.

Safety notes / runtime behaviour:
- Payments are feature-flagged. ENABLE_PAYMENTS must be set to enable any payment flows.
- Live trading should only be run against devnet/testnet; scripts and README explicitly require Helius/DEVNET_RPC and other keys for e2e.
- No BOT_TOKEN / BOSS_CHAT_ID or other secrets were added. Do not add secrets to the repo automatically.

Files / areas changed (high level):
- src/adapters/payment-adapter.ts (new interface / shims)
- src/adapters/* (compatibility shims and tests)
- tests/** (new/updated unit tests)
- .env.example (documented placeholders only)
- docs/ or README.md (notes on feature flags and e2e)

Link to the latest automated sprint report saved in the repo:
- projects/copy-trade-bot/reports/SPRINT_COMPLETE_2026-07-06_2236.md

Requested next steps (pick one and reply with the exact authorization phrase):
- Open a PR from dev/sprint-5-payment-adapter → main: reply: "allow open-pr to main"
- Open a PR from dev/sprint-5-payment-adapter → dev: reply: "allow open-pr to dev"
- Or ask me to prepare additional changelog/packaging notes before PR: reply: "prepare more PR notes"

Maintainer checklist (before merge):
- [ ] Re-run build & tests on CI
- [ ] Confirm reviewers and merge target
- [ ] Ensure no secrets are included and env documentation is complete
- [ ] Optional: run e2e:devnet only after providing Helius/DEVNET_RPC and explicit authorization

If you'd like me to open the PR, reply with the exact phrase above. If you'd like a different PR title/body or reviewers added, say so and I will update the draft.