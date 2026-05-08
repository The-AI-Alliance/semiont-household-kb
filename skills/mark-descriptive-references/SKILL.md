---
name: mark-descriptive-references
description: Detect anaphoric mentions in the corpus — "the contractor", "the AC unit", "the basement", "the master bath" — that refer to entities named formally elsewhere.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are detecting *descriptive* references — the everyday way homeowner records refer to subsystems, vendors, and rooms after the formal name has been introduced. "We had the AC serviced" rather than "Carrier 58STA central air-conditioning unit serviced." `resolve-descriptive-references`-style downstream skills (here folded into the canonicalize-* skills) will resolve these to the canonical Subsystem / Vendor / Room they point at.

## What it does

`mark.assist(rId, 'linking', { instructions })` with an instruction that emphasizes anaphoric / descriptive mentions, not formally-named ones.

## SDK verbs

- `browse.resources`
- `mark.assist` (linking with custom instructions)

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/mark-descriptive-references/script.ts'
```

## Guidance for the AI assistant

- Run `mark-house-entities` first — descriptive references are the second-pass work after formally-named entities are tagged.
- Common targets: "the contractor", "the plumber", "the AC", "the furnace", "the roof", "the basement", "the master bath", "the kid's room", "the panel", "the water heater". The heuristic is: definite article + common-noun reference to a household entity.
