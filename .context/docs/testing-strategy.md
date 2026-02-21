---
type: doc
name: testing-strategy
description: Test frameworks, patterns, coverage requirements, and quality gates
category: testing
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Testing Strategy

## Framework

- **Vitest** with V8 coverage (thresholds: 70% lines/branches/functions/statements)
- Test files colocated with source: `*.test.ts`
- E2E tests: `*.e2e.test.ts`

## Enterprise Test Suite (added by this fork)

### Authorization & Policy Tests
| File | Tests | Coverage |
|------|-------|----------|
| `src/gateway/stateless/scheduler-policy.test.ts` | 4 | Supervisor/worker scheduling matrix |
| `src/gateway/server-methods/cron.temporal-scheduling-policy.test.ts` | 8 | Temporal scheduling policy integration |
| `src/gateway/server-methods/swarm.test.ts` | 2 | Swarm team upsert/get + scope denial |
| `src/gateway/server-methods/chat.abort-persistence.test.ts` | 5 | BYOK override denial, abort persistence |

### Metrics & Observability Tests
| File | Tests | Coverage |
|------|-------|----------|
| `src/gateway/server-methods/system.metrics.test.ts` | 1 | `system.metrics` RPC endpoint |
| `src/gateway/server-methods.metrics-auth.test.ts` | 1 | Metrics auth enforcement |
| `src/gateway/server-maintenance.test.ts` | 1 | Alert threshold maintenance loop |

### Chat Portal Tests
| File | Tests | Coverage |
|------|-------|----------|
| `src/gateway/server-methods/chat-portal.test.ts` | ~2 | Portal contract + stack status |

**Total: 22+ enterprise-specific tests**

## Running Tests

```bash
# All tests
pnpm test

# Coverage
pnpm test:coverage

# Specific enterprise tests
pnpm vitest run src/gateway/stateless/scheduler-policy.test.ts
pnpm vitest run src/gateway/server-methods/cron.temporal-scheduling-policy.test.ts
pnpm vitest run src/gateway/server-methods/swarm.test.ts

# Type checking
pnpm tsgo
```

## Test Gaps

- [ ] Cross-tenant E2E tests (tenant A cannot access tenant B data)
- [ ] Temporal integration tests against live cluster
- [ ] Redis adapter integration tests
- [ ] BYOK propagation end-to-end test
- [ ] Load/performance tests for scheduler and tool bus
- [ ] Swarm directory persistence tests (currently in-memory only)
