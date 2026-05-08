---
name: mark-house-entities
description: Detect formally-named home-property entity spans across the markdown corpus — Person, Room, Subsystem, Appliance, Vendor, Utility, Service, Date, MonetaryValue, Address.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are detecting named entities across the home-property corpus.

## What it does

For every markdown / text resource, calls `mark.assist(resourceId, 'linking', { entityTypes })`.

| Entity type | What it tags |
|---|---|
| `Person` / `HouseholdMember` | Household members and named individuals |
| `Vendor` / `ServiceProvider` | Service companies, contractors, utility providers, exterminators, lawn services |
| `Room` | Specific named rooms ("the kitchen", "the master bath", "the basement") |
| `Subsystem` | Named subsystems ("the HVAC", "the roof", "the panel", "the water heater") |
| `Appliance` | Major appliances (washer, dryer, dishwasher, water heater, sump pump) |
| `Utility` | Utility services (electric, gas, water, internet, garbage) |
| `Service` | Service events / event types (HVAC tune-up, pest spray, gutter cleaning) |
| `Date` | Dates |
| `MonetaryValue` | Dollar amounts |
| `Address` | Physical addresses |

Override the type list with `ENTITY_TYPES`.

## SDK verbs

- `browse.resources` — discover the markdown subset
- `mark.assist` — one call per resource, motivation `linking`

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/mark-house-entities/script.ts'
```

## Output

Per-resource count of new annotations.

## Guidance for the AI assistant

- This skill does not canonicalize. `canonicalize-rooms`, `canonicalize-subsystems`, and `canonicalize-vendors` do that downstream.
- Vendor canonicalization in particular benefits from the model tagging the vendor name *and* the service-type span — both contribute to the canonical Vendor resource's body.
