---
name: canonicalize-vendors
description: Promote Vendor / service-company mentions to canonical Vendor resources. Vendor track-records compound across years.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are turning every Vendor / service-company mention in the corpus into a canonical Vendor resource. The same plumber across three repair receipts is one canonical Vendor with edges back to all three.

## What it does

1. Walks `Vendor`, `ServiceProvider`-tagged annotations.
2. Clusters by surface text.
3. For each cluster: gathers context, matches against existing Vendor resources; if no confident match, synthesizes a new Vendor resource via `yield.fromAnnotation`.
4. Binds every annotation in the cluster.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `match.search`, `yield.fromAnnotation`, `bind.body`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `MATCH_THRESHOLD` | `30` | Minimum match score for an existing Vendor as the canonical target. |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/canonicalize-vendors/script.ts'
```

## Guidance for the AI assistant

- Vendors are the entity that most accumulates value over years. The same furnace contractor across 2019, 2022, 2024 is a sharp signal — `vendor-track-record` is what surfaces it.
- A single individual contractor *and* their company are typically the same Vendor here. If the corpus distinguishes ("Bob from Smith HVAC"), keep them as one canonical (Smith HVAC) with Bob as a Person.
