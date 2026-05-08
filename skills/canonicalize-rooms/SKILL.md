---
name: canonicalize-rooms
description: Promote Room mentions to canonical Room resources. The canonical Kitchen / Master Bath / Basement / etc. are reused across years and source types.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are turning every Room mention in the corpus into a canonical Room resource. Once canonicalized, "the kitchen", "kitchen sink", "the master bath", "the basement" all collapse to one Room resource each.

## What it does

1. Walks every `Room`-tagged annotation in the corpus.
2. Clusters by surface text.
3. For each cluster: gathers context, matches against existing Room resources; if no confident match, synthesizes a new Room resource via `yield.fromAnnotation`.
4. Binds every annotation in the cluster via `bind.body`.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `match.search`, `yield.fromAnnotation`, `bind.body`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `MATCH_THRESHOLD` | `30` | Minimum match score for an existing Room as the canonical target. |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/canonicalize-rooms/script.ts'
```

## Guidance for the AI assistant

- Rooms are the spatial anchor — Subsystems and Appliances bind to Rooms via the events that take place in them ("the kitchen disposal", "the basement sump pump").
- Singular vs. plural ("the kid's rooms" vs. "the kid's room"): keep them as separate canonicals if they describe different physical spaces; merge if one is just a typo.
