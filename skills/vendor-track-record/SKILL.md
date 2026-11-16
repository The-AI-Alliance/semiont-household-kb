---
name: vendor-track-record
description: Per-Vendor decisional summary — visit history, total spend, recency of last use, repeat-customer pattern, any outstanding concerns from comments. Synthesizes a VendorTrackRecord aggregate per Vendor.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

You are producing the vendor-decisional aggregate that answers *"should I call this contractor again?"* — for each canonical Vendor, a one-page summary of every Event they've handled, the dollars spent, the recency of last use, and any flagged concerns.

## What it does

For each canonical Vendor:
1. Browses every Event resource bound to it.
2. Sums dollars (where Cost is parseable from Event bodies).
3. Computes last-used date and visit count.
4. Walks commenting annotations on the source documents that referenced this Vendor.
5. `gather.annotation` over the most material event annotations.
6. `yield.fromContext` synthesizes a `VendorTrackRecord` aggregate.

## SDK verbs

`browse.resources`, `browse.annotations`, `gather.annotation`, `yield.fromContext`.

## CLI args

```
--vendor <resourceId>     # Optional. Run for one vendor; default = every canonical Vendor.
```

## Run it

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/vendor-track-record/script.ts'
```

## Output

One `VendorTrackRecord` resource per canonical Vendor.

## Guidance for the AI assistant

- Run extract-events first.
- Vendors used once look thin in the track-record; that's accurate — a one-time vendor doesn't have a track record yet, and the aggregate says so.
- Repeat use across years is the strongest signal — vendors used in 3+ separate Events generate the most actionable track-records.
