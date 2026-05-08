---
name: canonicalize-subsystems
description: Promote Subsystem / Appliance mentions to canonical Subsystem resources, with manufacturer / installed-date / warranty / lifespan grounded against ManufacturerManual + ASHRAE/NFPA/NRCA External References.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are turning every Subsystem / Appliance mention in the corpus into a canonical Subsystem resource. The canonical Furnace, Roof, Water Heater, Dishwasher, etc. carry installed-date, manufacturer / model, warranty status, and an External References section pointing at the manufacturer manual plus relevant industry standard.

## What it does

1. Walks every annotation tagged `Subsystem`, `Appliance`, `HVAC`, `Plumbing`, `Electrical`, `RoofingSystem`, etc.
2. Clusters by surface text (normalized — definite-articles stripped, ALL CAPS lowercased).
3. For each cluster: gathers context, matches against existing Subsystem resources; if no confident match, synthesizes a new Subsystem resource via `yield.fromAnnotation` with body content + an External References section.
4. Binds every annotation in the cluster.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `match.search`, `yield.fromAnnotation`, `bind.body`.

## Tier-2 parameters

| Var | Default | Purpose |
|---|---|---|
| `MATCH_THRESHOLD` | `30` | Minimum match score for an existing Subsystem as the canonical target. |

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/canonicalize-subsystems/script.ts'
```

## Output

Per-cluster: matched or synthesized canonical Subsystem.

## Guidance for the AI assistant

- The synthesized body is grounded in source language for installed-date, manufacturer, model. If the corpus doesn't carry that info, the canonical resource will be sparse — `prioritize-house-systems` falls back to lifespan defaults from `src/lifespan-data.ts`.
- Subsystem types (HVAC, Plumbing, etc.) are entity-type tags, not separate resources. Each canonical Subsystem may carry several relevant tags simultaneously (a heat-pump-based HVAC system is `Subsystem, HVAC, Appliance`).
