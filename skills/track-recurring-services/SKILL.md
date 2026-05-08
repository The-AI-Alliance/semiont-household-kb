---
name: track-recurring-services
description: Detect recurring service schedules (quarterly pest control, biannual HVAC, annual roof inspection) from the Event corpus; project next-due dates.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are inferring service schedules from the Event log and producing forward-looking ServiceSchedule resources that project next-due dates per Subsystem × service-type.

## What it does

1. Walks every Event resource grouped by (Subsystem, Vendor, kind).
2. For each group, extracts the date sequence and infers a cadence (monthly / quarterly / biannual / annual / irregular) using interval analysis.
3. Synthesizes a ServiceSchedule resource with the inferred cadence, last-occurrence date, and projected next-due date.
4. Surfaces overdue schedules — schedules whose projected next-due date has passed without a corresponding Event.

## SDK verbs

`browse.resources`, `browse.annotations`, `yield.resource`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `MIN_OCCURRENCES` | `3` | Minimum events in a group before a recurring schedule is inferred (3 is the natural cadence-detection threshold). |
| `IRREGULAR_TOLERANCE` | `0.4` | Coefficient-of-variation cutoff above which a schedule is labeled "irregular." |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/track-recurring-services/script.ts'
```

## Guidance for the AI assistant

- Run `extract-events` first.
- Schedules with fewer than `MIN_OCCURRENCES` events are not yet established — reported but not used by `assess-house-maintenance`'s scheduled-vs-actual comparison.
- The "overdue" projection is heuristic: `expected-next = last + median-interval`. Real-world cadences drift; treat the surfaced "overdue" list as a prompt, not an authoritative due-date.
