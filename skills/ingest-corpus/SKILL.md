---
name: ingest-corpus
description: Walk the repo's home-property corpus and create one Semiont resource per file with appropriate entity types.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write
---

You are bootstrapping a home-property corpus into a Semiont knowledge base.

## What it does

1. `discoverCorpus()` walks the repo's top-level subdirectories.
2. Declares the KB's entity-type vocabulary via `frame.addEntityTypes` (idempotent).
3. For each ingestable file, calls `yield.resource(...)` with format and filename-derived entity types.

| Filename pattern | Entity types |
|---|---|
| `receipt` / `invoice` | `Receipt` |
| `email` / `message` / `text` | `Email` |
| `manual` / `spec` | `ManualExcerpt` |
| `inspection` / `appraisal` / `assessment-report` | `InspectionReport` |
| `warranty` | `WarrantyNotice` |
| `mortgage` / `escrow` / `loan-statement` | `MortgageStatement` |
| `insurance-policy` / `insurance-renewal` | `InsurancePolicy` |
| `property-tax` / `assessment-notice` | `PropertyTaxBill` |
| `hoa` / `homeowners-association` | `HOANotice` |
| `neighborhood` / `listserv` / `nextdoor` | `NeighborhoodNotice` |
| `utility-bill` / `electric-bill` / `gas-bill` / `water-bill` / `internet-bill` | `Receipt, Utility` |
| anything else | `HouseholdDocument` |

`README.md`, `LICENSE`, `AGENTS.md`, dotfiles, and config dirs are skipped.

## SDK verbs

- `frame.addEntityTypes`
- `yield.resource`

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/ingest-corpus/script.ts'
```

## Output

Per-file resource id and entity types.

## Guidance for the AI assistant

- Re-running creates duplicates. Restart the backend stack to start fresh, or use `browse.resources({ search: '<title>' })` to check before re-running.
- Subdirectory layout (`hvac/`, `plumbing/`, etc.) is convenient organization, not load-bearing — file classification comes from filename heuristics, so reorganizing the corpus by topic doesn't change what the skills see.
- Pre-curated context articles in `context/` / `curated/` / `generated/` survive subsequent runs.
