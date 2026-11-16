---
name: assess-house-maintenance
description: Per-Subsystem backward-looking maintenance assessment — services on schedule, reactive-vs-proactive ratio, total spend, documentation gaps. Synthesizes a MaintenanceAssessment aggregate.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are producing the headline backward-looking aggregate of this KB — the per-Subsystem maintenance assessment that answers the homeowner's question *"how well-maintained has this house been?"*

This skill implements **Q1 from `PERSONAL-KB-EXPLORATION.md`**.

## What it does

1. Walks every canonical Subsystem resource.
2. For each, browses Event resources bound to it.
3. Walks ServiceSchedule resources for the Subsystem to compute scheduled-vs-actual cadence compliance.
4. Counts emergencies / repairs / inspections; computes reactive/proactive ratio.
5. Walks commenting annotations for outstanding concerns.
6. `gather.annotation` over the most material event annotations for context.
7. `yield.fromContext` synthesizes a `MaintenanceAssessment` aggregate citing every supporting Event.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `yield.fromContext`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `ASSESSMENT_INSTRUCTIONS` | (built-in default) | Override the synthesis prompt. |
| `MAX_GATHER` | `15` | Cap on event-annotation gather calls (cost control). |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/assess-house-maintenance/script.ts'
```

## Output

A `MaintenanceAssessment` resource. Print its resourceId; browse the body in the Semiont UI.

## Guidance for the AI assistant

- Run the full upstream pipeline first: ingest-corpus → mark-house-entities → canonicalize-* → extract-events → track-recurring-services → comment-action-items.
- The score itself ("B+", "well-maintained", "significantly under-maintained") is LLM judgment. The substrate makes it auditable (every input is cited) but doesn't make it objective.
- Subsystems with no Events show up as **documentation gaps** — known-unknowns surfaced explicitly. The unknown-unknowns aren't visible.
