---
name: temporal-scheduling
description: Use when a user or agent wants to schedule a recurring task, run something in the background, set a reminder, delay an action, or create a follow-up check. Also use when deciding between scheduling now vs. responding immediately, or when interpreting a completed async job callback.
---

# Temporal Scheduling — Agent Decision Guide

## Overview

OpenClaw routes cron/scheduling through Temporal.io when `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`.
Agents interact with it exclusively through the `cron` gateway tool — never through Temporal SDK directly.
All scheduling calls go via `cron.add`, and results come back via `cron.callback` + `cron.resume.pull`.

---

## Decision: Use Scheduling or Respond Directly?

Use `cron.add` when ANY of these is true:
- The action must happen **in the future** (not right now)
- The action must repeat on a **schedule** (hourly, daily, weekly)
- The action is **long-running** (seconds to hours) and must not block the conversation
- You need **guaranteed delivery** even if the gateway restarts

Respond directly (NO scheduling) when:
- The user wants an answer now
- The task takes < 5 seconds
- The user did not ask for automation or recurrence
- There is no natural "done later" outcome

---

## Schedule Types — When to Use Each

| Kind | Field | When to use | Example |
|------|-------|-------------|---------|
| `every` | `everyMs` | Repeating at fixed intervals | Scraping every hour: `everyMs: 3_600_000` |
| `cron` | `expr` + optional `tz` | Human-readable recurrence | Every Monday 07:00: `expr: "0 7 * * 1"`, `tz: "America/Sao_Paulo"` |
| `at` | `at` (ISO 8601) | One-shot at a specific time | Follow-up in 3 days: `at: "2026-02-25T10:00:00Z"` |

**Rule of thumb:**
- Interval → `every`
- Day/time pattern → `cron`
- Specific moment → `at`

---

## Workflow Kinds — Which to Choose

| `workflowKind` | Use when | Examples |
|----------------|----------|---------|
| `passive_trigger` | Agent wakes up and acts on its own initiative, no result needed | Weekly report reminder, recurring data collection |
| `report_dispatch` | Agent produces output that should be delivered/stored | Heavy reconciliation report, nightly analytics |
| `proactive_followup` | Supervisor wakes a worker for a specific task | Supervisor pinging worker every Monday morning |

---

## Using `cron.add` — Parameter Reference

```
action: "add"
job:
  name: string                     # Human-readable job name (stable for deduplication)
  schedule:
    kind: "every" | "cron" | "at"
    everyMs?: number               # for kind=every
    expr?: string                  # for kind=cron (cron expression)
    tz?: string                    # for kind=cron (IANA timezone)
    at?: string                    # for kind=at (ISO 8601 UTC)
  payload:
    kind: "agentTurn"              # Use "agentTurn" for most cases
    message: string                # The message the agent will receive when the job fires
  sessionTarget: "isolated"        # "isolated" creates a fresh context per run
  wakeMode: "next-heartbeat"       # Standard — wakes the agent at next available slot
  workflowKind: "passive_trigger" | "report_dispatch" | "proactive_followup"
  enabled: true
  deleteAfterRun?: true            # Set true for one-shot jobs (kind=at)
```

---

## The 4 Use Cases — Concrete Examples

### 1. Supervisor Waking Workers (Recurrence)

**Situation:** Supervisor wants every worker in its team to receive a briefing every Monday.

```
cron.add
  job:
    name: "monday-briefing"
    schedule: { kind: "cron", expr: "0 7 * * 1", tz: "America/Sao_Paulo" }
    payload: { kind: "agentTurn", message: "Weekly briefing: summarize open tasks and send status report." }
    sessionTarget: "isolated"
    wakeMode: "next-heartbeat"
    workflowKind: "proactive_followup"
  orchestration:
    targetAgentId: "worker-sales-1"    # supervisor targets each worker explicitly
```

**Key point:** Supervisor role allows targeting `targetAgentId` from its team. Worker role can only schedule for itself.

---

### 2. Continuous Data Collection (Fixed Interval)

**Situation:** Research agent collects news headlines every hour.

```
cron.add
  job:
    name: "news-collector-hourly"
    schedule: { kind: "every", everyMs: 3600000 }
    payload: { kind: "agentTurn", message: "Fetch latest tech news from your configured sources and append to the daily digest." }
    sessionTarget: "isolated"
    wakeMode: "next-heartbeat"
    workflowKind: "passive_trigger"
```

After creating, confirm to the user: *"I've set up hourly news collection. You can check status with `cron status` or cancel it with `cron remove <id>`."*

---

### 3. Long Async Report (Non-blocking)

**Situation:** User requests a 50,000-row reconciliation report.

**Agent response flow:**
1. Immediately respond: *"Your report is being generated in the background. I'll notify you when it's ready."*
2. Call `cron.add` with `kind: "at"` set ~30 seconds in the future (or use a one-shot workflow)
3. Set `deleteAfterRun: true`

```
cron.add
  job:
    name: "reconciliation-report-2026-02"
    schedule: { kind: "at", at: "<ISO timestamp 30s from now>" }
    payload: { kind: "agentTurn", message: "Generate the monthly reconciliation report for February 2026 and deliver it via email." }
    sessionTarget: "isolated"
    wakeMode: "next-heartbeat"
    workflowKind: "report_dispatch"
    deleteAfterRun: true
```

**Do NOT block** the conversation waiting for it. Return the `jobId` in your response so the user can track it.

---

### 4. Delayed Follow-up (Timed Retry)

**Situation:** Agent sent an email and wants to check for a reply in 3 days.

```
cron.add
  job:
    name: "email-followup-client-x"
    schedule: { kind: "at", at: "2026-02-25T10:00:00Z" }
    payload: { kind: "agentTurn", message: "Check the inbox for a reply from client X about the proposal sent on 2026-02-22. If no reply, draft a polite follow-up email." }
    sessionTarget: "isolated"
    wakeMode: "next-heartbeat"
    workflowKind: "passive_trigger"
    deleteAfterRun: true
```

---

## Managing Scheduled Jobs

| Action | Command | When to use |
|--------|---------|-------------|
| List active jobs | `cron.list` | Show user what's running |
| Cancel a job | `cron.remove id=<jobId>` | User cancels automation |
| Pause without deleting | `cron.update id=<jobId> patch={enabled: false}` | Temporary pause |
| Trigger immediately | `cron.run id=<jobId>` | Force run outside schedule |
| View history | `cron.runs id=<jobId>` | Check past execution results |
| Check scheduler status | `cron.status` | Verify Temporal is connected |

---

## Async Callback Pattern (Report Dispatch)

When a job fires and completes, Temporal sends a callback to `cron.callback`.
The agent can poll for the result using `cron.resume.pull`:

```
# After dispatching a report job, poll for completion:
cron.resume.pull
  correlationId: "<id from the original job trigger>"
```

The response will contain:
- `status`: `"succeeded"` | `"failed"` | `"timed_out"` | `"cancelled"`
- `output`: the result payload (if succeeded)
- `error`: the error details (if failed)

**Important:** Only poll when the user is actively waiting. For background jobs, let the result arrive via the next scheduled agent turn.

---

## Anti-Patterns to Avoid

- **Do NOT** call `cron.add` for tasks the user wants done now.
- **Do NOT** create multiple jobs with the same name for the same recurring task — use `cron.update` to modify the existing one.
- **Do NOT** use `sessionTarget: "main"` for scheduled jobs — it contaminates the main conversation context. Always use `"isolated"`.
- **Do NOT** hardcode timestamps without converting to UTC ISO 8601.
- **Do NOT** schedule without confirming with the user first when the action has side effects (sending emails, modifying data).

---

## Confirming Scheduling to the User

After a successful `cron.add`, always report back:
- **What** was scheduled (name, payload summary)
- **When** it will run (human-readable interpretation of the schedule)
- **The job ID** (so the user can cancel/update it later)
- **How to cancel**: `cron remove <id>`

Example: *"Done! I've scheduled weekly news collection every Monday at 07:00 (São Paulo time). Job ID: `abc-123`. To cancel: `cron remove abc-123`."*
