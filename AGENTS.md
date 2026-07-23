# AGENTS.md — semiont-household-kb (and any home-property KB)

This is a home-property Semiont knowledge base. The corpus covers everything connected to the physical house — rooms, subsystems (HVAC / plumbing / electrical / roof / etc.), utility services, recurring service schedules (pest control, lawn care, HVAC tune-ups), episodic services (bat removal, roof repair), appliances, mortgage / insurance / property tax, vendor track records, and neighborhood / HOA context.

The skills detect rooms, subsystems, appliances, vendors, utilities, and dated events; promote them to canonical resources whose ids cross-reference across years and source types; build the recurring-service schedule; and synthesize the backward-looking, forward-looking, and vendor-decisional aggregates that homeowner queries actually want — maintenance assessments, system-priority lists, vendor track-records.

If you're an AI assistant working in this repo, this file is your orientation. The skills are **corpus-generic** — drop a different home-property corpus into the same directory layout and the skills work without modification.

This KB operationalizes the home-management worked examples in [`semiont-template-kb/PERSONAL-KB-EXPLORATION.md`](https://github.com/The-AI-Alliance/semiont-template-kb/blob/main/PERSONAL-KB-EXPLORATION.md) — Q1 ("How well-maintained has this house been?") and Q2 ("What home systems are priorities for repair or replacement this year?") map directly to skills here.

## What's here

- **Top-level subdirectories** organized by subsystem or topic (e.g., `hvac/`, `plumbing/`, `electrical/`, `roof/`, `pest-control/`, `exterior/`, `appliances/`, `mortgage-insurance/`, `neighborhood/`). Each holds the documents for one subject. Each file becomes one resource via skill 1. The directory is convenient organization, not load-bearing — file classification comes from filename heuristics.
- **`context/`, `curated/`, or `generated/`** (optional) — pre-curated context articles (e.g., manufacturer-spec summaries, ASHRAE schedule excerpts). Skill 1 ingests them as `HouseholdContext` resources on day 1.
- **`src/`** — small helper modules:
  - `src/files.ts` — corpus discovery and classification by filename heuristic
  - `src/house-patterns.ts` — fast pattern-detection for vendor names, dollar amounts, dates, model numbers, room references
  - `src/external-authorities.ts` — adapters for manufacturer manual lookups, ASHRAE / NFPA / NRCA standard references, USDA hardiness zones
  - `src/lifespan-data.ts` — typical lifespan ranges by subsystem (used by `prioritize-house-systems` when no manufacturer reference is available)
  - `src/interactive.ts` — `confirm` / `pick` / `preview` helpers for tier-3 interactive checkpoints
- **`skills/`** — ten skills, each shipping a `SKILL.md` plus a `script.ts` that uses `@semiont/sdk` against the running backend.

| Skill | What it does | New SDK verbs |
|---|---|---|
| [`ingest-corpus`](skills/ingest-corpus/) | Walk the repo, declare entity-type vocabulary, create one resource per file | `frame.addEntityTypes`, `yield.resource` |
| [`mark-house-entities`](skills/mark-house-entities/) | Detect Person, Room, Subsystem, Appliance, Vendor, Utility, Service, Date, MonetaryValue, Address — including anaphoric mentions ("the contractor", "the AC unit", "the master bath") | `mark.assist` (linking) |
| [`canonicalize-rooms`](skills/canonicalize-rooms/) | Promote Room mentions to canonical Room resources | `+ match.search`, `+ yield.fromAnnotation`, `+ bind.body` |
| [`canonicalize-subsystems`](skills/canonicalize-subsystems/) | Promote Subsystem / Appliance mentions to canonical Subsystem resources with manufacturer / installed-date / warranty / lifespan | same shape |
| [`canonicalize-vendors`](skills/canonicalize-vendors/) | Promote Vendor / service-company mentions to canonical Vendor resources | same shape |
| [`extract-events`](skills/extract-events/) | Synthesize one Event per dated service / repair / payment / visit, bound to Subsystem and Vendor | `+ yield.fromAnnotation`, `+ bind.body` |
| [`track-recurring-services`](skills/track-recurring-services/) | Detect recurring service schedules; project next-due dates | `+ yield.resource` (one ServiceSchedule per cadence) |
| [`comment-action-items`](skills/comment-action-items/) | Surface follow-up items, missing documentation, warranty events | `mark.assist` (commenting) |
| [`assess-house-maintenance`](skills/assess-house-maintenance/) | Per-Subsystem backward-looking maintenance score (worked example Q1) | `+ gather.annotation`, full pipeline |
| [`prioritize-house-systems`](skills/prioritize-house-systems/) | Forward-looking System priorities (worked example Q2) | full pipeline composition |
| [`vendor-track-record`](skills/vendor-track-record/) | Per-Vendor decisional summary | full pipeline composition |

## What does home-property record-keeping involve?

Working homeowner documentation usually involves several braided activities:

1. **Cataloging across sources** — paper receipts, Gmail messages, scanned manuals, contractor texts, utility-portal exports, insurance / mortgage statements, calendar entries, HOA notices. A typical homeowner has 8–15 inbound source streams.
2. **Subsystem inventory** — every major Subsystem of the house — HVAC, plumbing, electrical, roof, foundation, yard, security, networking — should be a canonical resource with an installed date, manufacturer where applicable, warranty status, and an event log.
3. **Vendor canonicalization** — the contractor who serviced the furnace in 2020, 2022, and 2024 is one canonical Vendor resource, not three string mentions. Vendor track-records compound across years.
4. **Recurring-schedule modeling** — pest control runs quarterly; HVAC service is biannual; gutters get cleaned each fall. Once schedules are modeled, "what's overdue?" becomes a structural query, not a memory check.
5. **Event extraction** — every dated service / repair / payment / inspection / utility-bill / HOA-notice as an Event resource bound to a Subsystem and a Vendor.
6. **External-authority grounding** — manufacturer-rated lifespans (HVAC: 15–20 yrs; water heater: 8–12 yrs; asphalt roof: 20–25 yrs); ASHRAE / NFPA / NRCA standards for service cadence; USDA hardiness zones for landscaping; municipal building-code for permit requirements.
7. **Decisional aggregate synthesis** — "How well-maintained has this house been?" / "What's a priority for replacement this year?" / "Should I call this contractor again?" These are the questions homeowners actually ask, and the aggregates produced here are the artifacts that answer them — defensibly enough to hand to a buyer's agent at sale, an insurance reviewer at renewal, or a contractor scoping a renovation.

The Semiont SDK is well-suited for all seven. The skills are organized to demonstrate that — turning a raw set of homeowner records into a navigable network of Room, Subsystem, Vendor, Event, ServiceSchedule, MaintenanceAssessment, SystemPriorities, and VendorTrackRecord resources, all anchored back to source receipts / emails / inspections.

## Pre-curated context articles are preserved

Drop a markdown file into `context/`, `curated/`, or `generated/` and skill 1 ingests it as a `HouseholdContext` resource on day 1. Skills that synthesize new context articles `match.search` against existing ones first, so any hand-curated content survives subsequent runs. This is where you'd put manufacturer-spec summaries (the Carrier furnace's installed model details, the Rheem water heater specs) so subsequent skills can match against them.

## Entity types used in this KB

- **People**: `Person`, `HouseholdMember` (the owners), `Vendor`, `ServiceProvider`
- **Spaces**: `Room`, `Yard`, `Garage`, `Basement`, `Attic`
- **Subsystems**: `Subsystem`, `HVAC`, `Plumbing`, `Electrical`, `RoofingSystem`, `Foundation`, `Networking`, `Security`, `Entertainment`
- **Things**: `Appliance`, `WaterHeater`, `Pump`, `Filter`
- **Services**: `Service`, `RecurringService`, `EpisodicService`, `Utility`, `PestControl`, `LawnCare`, `Cleaning`
- **Documents**: `Receipt`, `Invoice`, `Email`, `ManualExcerpt`, `InspectionReport`, `WarrantyNotice`, `MortgageStatement`, `InsurancePolicy`, `PropertyTaxBill`, `HOANotice`, `NeighborhoodNotice`, `HouseholdDocument`
- **Where & when & how much**: `Address`, `Date`, `MonetaryValue`
- **Synthesized aggregates**: `Event`, `ServiceSchedule`, `MaintenanceAssessment`, `SystemPriorities`, `VendorTrackRecord`, `Aggregate`
- **External-authority shadows**: `ManufacturerManual`, `ASHRAE_Schedule`, `NFPA_Standard`, `NRCA_Standard`, `USDAZone`, `BuildingCode`
- **Curated content marker**: `HouseholdContext`, `Curated`

## Worked example: deciding whether to call this contractor again

The seeded corpus contains service receipts and emails from synthetic vendors — some used once, some used many times across multiple subsystems. After running:

1. `ingest-corpus` → resources for each document.
2. `mark-house-entities` → annotations on Vendor, Subsystem, Date, MonetaryValue spans, plus anaphoric mentions ("the contractor", "the plumbers").
3. `canonicalize-vendors` → one Vendor resource per service company.
4. `extract-events` → one Event per service / repair / visit.
5. `vendor-track-record` → per-Vendor aggregate listing every Event the vendor handled, total dollars, last-used recency, repeat-customer pattern, any commenting flags.

The vendor track-record is the demonstration — a queryable artifact that shows *whether the homeowner should call the same contractor again*, citing the exact source emails / receipts. This pattern works on any home-property corpus: drop in your own records, run the skills, get the track-record. Specific vendor names from the seeded corpus appear *only in the track-records the run produces*; the skills themselves never hard-code any vendor or contractor name.

## Privacy as a first-order design concern

A real-world deployment of this KB carries the family's address, financial details, mortgage information, security-system notes, and patterns about who is home when. The synthetic dataset shipped with this repo poses no privacy risk; a real-world deployment should:

- Use **local-first** inference (Ollama) — the privacy gain compounds with the cost gain.
- Be careful about external-authority lookups — sending a vendor's name to a generic Google search is fine; sending the homeowner's address to a third-party API is not.
- Treat the backend stack as on-premise from the start. Codespaces is for evaluating the synthetic dataset, not for running real homeowner records.

## Working in containers — do not install npm packages on the host

This template assumes a containerized workflow. The backend stack runs in containers (`semiont start` brings it up); the skills run in containers too.

## Backend setup

### Local: `semiont start`

```bash
brew install the-ai-alliance/semiont/semiont   # once
semiont start
```

Then create the admin user you'll sign in with:

```bash
semiont useradd --email admin@example.com --password password --admin
```

### Codespaces (synthetic data only)

```bash
gh codespace create --repo The-AI-Alliance/semiont-household-kb --machine premiumLinux
gh codespace ports forward 4000:4000
gh codespace ssh -- cat .devcontainer/admin.json
```

## Background reading

| Where | What |
|---|---|
| [PERSONAL-KB-EXPLORATION.md](https://github.com/The-AI-Alliance/semiont-template-kb/blob/main/PERSONAL-KB-EXPLORATION.md) | Full analysis of personal-KB use cases. The home-management worked examples (Q1, Q2) and vendor / system canonicalization patterns map directly to skills here. |
| [`@semiont/sdk` README](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk) | The TypeScript surface — eight verbs plus admin/auth/job. |
| [Semiont protocol skills](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol/skills) | Reference skill packs. |
| [ASHRAE Standard 180](https://www.ashrae.org/) | HVAC inspection / maintenance schedules. |
| [NFPA codes](https://www.nfpa.org/) | Electrical and fire-safety standards. |
| [NRCA roofing standards](https://www.nrca.net/) | Roofing-system inspection cadences. |
| [USDA Plant Hardiness Zone Map](https://planthardiness.ars.usda.gov/) | Used by landscape / yard skills. |
