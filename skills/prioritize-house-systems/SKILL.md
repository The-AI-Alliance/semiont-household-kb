---
name: prioritize-house-systems
description: Forward-looking ranked priority list — which Subsystems should be repaired or replaced this year. Synthesizes a SystemPriorities aggregate.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are producing the headline forward-looking aggregate of this KB — the per-Subsystem priority ranking that answers *"what's a priority for repair or replacement this year?"*

This skill implements **Q2 from `PERSONAL-KB-EXPLORATION.md`**.

## What it does

For each canonical Subsystem:
1. Computes age vs. expected lifespan (manufacturer where present, fallback to `src/lifespan-data.ts`).
2. Walks recent Events (last 24 months) for escalating-frequency signal.
3. Walks ServiceSchedules for overdue cadences.
4. Walks commenting annotations for outstanding concerns.
5. Pulls warranty status from the canonical body.
6. Scores priority (0–100) based on age-ratio + recent-issue density + cadence drift.
7. `gather.annotation` over the most material event annotations.
8. `yield.fromContext` synthesizes a `SystemPriorities` aggregate with a ranked priority list, cost estimates where present, cascade-risk reasoning, seasonality notes.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `yield.fromContext`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `PRIORITIES_INSTRUCTIONS` | (built-in default) | Override the synthesis prompt. |
| `LOOKBACK_MONTHS` | `24` | How many months of recent Events to consider for the escalating-frequency signal. |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/prioritize-house-systems/script.ts'
```

## Output

A `SystemPriorities` resource. Print its resourceId; browse the body in the Semiont UI.

## Guidance for the AI assistant

- Run the full upstream pipeline first.
- Cascade risk (water-heater failure → floor damage; roof failure → interior damage) is LLM judgment from the system descriptions. The Edge layer doesn't currently model failure-mode cascades formally; this is acknowledged.
- Quote freshness matters: a 2-year-old contractor estimate is stale by definition. The skill flags estimates older than 12 months as needing refresh before the homeowner acts.
