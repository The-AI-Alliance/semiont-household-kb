---
name: extract-events
description: For every dated household event in the corpus, synthesize an Event resource bound to its Subsystem and Vendor.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are turning every dated household event into a queryable Event resource — the unit `assess-house-maintenance` and `vendor-track-record` aggregate over.

## What it does

For each markdown resource:
1. Browses `Date`-tagged annotations.
2. For each Date annotation, calls `gather.annotation` to pull surrounding context (the service that took place on that date — what subsystem, which vendor, what cost).
3. `yield.fromContext` synthesizes an Event resource with structured fields (date, kind — service / repair / inspection / payment / visit / utility-bill — subsystem, vendor, cost, notes).
4. Binds the source annotation to the new Event resource.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `yield.fromContext`, `bind.body`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `EVENT_INSTRUCTIONS` | (built-in default) | Override the per-event extraction prompt. |
| `MIN_DATE_CONTEXT` | `40` | Skip Date annotations whose surrounding context is shorter than this many characters (likely just a date stamp with no event content). |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/extract-events/script.ts'
```

## Guidance for the AI assistant

- Run `mark-house-entities`, `canonicalize-subsystems`, `canonicalize-vendors` first — Events bind to the canonical Subsystem and Vendor in their context.
- Recurring service events (a Quarterly pest spray, a biannual HVAC tune-up) generate one Event per occurrence; `track-recurring-services` is what aggregates the cadence.
- Filter spurious dates by `MIN_DATE_CONTEXT` — pure date-stamps in headers without surrounding event language don't make useful Events.
