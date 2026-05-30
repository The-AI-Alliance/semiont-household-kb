# Household Knowledge Base (Synthetic Documents)

[![Lint](https://github.com/The-AI-Alliance/semiont-household-kb/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/The-AI-Alliance/semiont-household-kb/actions/workflows/lint.yml?query=branch%3Amain)
[![Build](https://github.com/The-AI-Alliance/semiont-household-kb/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/The-AI-Alliance/semiont-household-kb/actions/workflows/build.yml?query=branch%3Amain)
[![License](https://img.shields.io/github/license/The-AI-Alliance/semiont-household-kb)](https://github.com/The-AI-Alliance/semiont-household-kb/blob/main/LICENSE)

A collection of **synthetic but realistic household-property documents** — service receipts, contractor emails, manuals, inspection reports, utility bills, mortgage statements, HOA notices, neighborhood communications — formatted for demonstration of personal-property annotation and decisional-aggregate workflows with [Semiont](https://github.com/The-AI-Alliance/semiont).

This KB is the operational counterpart to the home-management worked examples in [`semiont-template-kb`'s `PERSONAL-KB-EXPLORATION.md`](https://github.com/The-AI-Alliance/semiont-household-kb/blob/main/PERSONAL-KB-EXPLORATION.md). The skills implement those queries — backward-looking maintenance assessments, forward-looking system-priority lists, vendor track-records — against synthetic data, but operate generically over any household-property corpus dropped into the same directory layout.

## About This Dataset

This repository contains synthetic household-property materials. **All addresses, vendors, contractor names, account numbers, dates, model numbers, and dollar amounts are entirely fictional.** The documents resemble real homeowner records in form and shape but describe no actual property, no actual people, and no actual transactions.

The corpus covers the full surface area of a homeowner's documentation:

- **Rooms** — kitchen, baths, bedrooms, basement, attic, garage, yard
- **Subsystems** — HVAC, plumbing, electrical, roofing, foundation, networking, security, entertainment
- **Utilities** — electric, gas, water, internet, garbage / recycling
- **Recurring services** — pest control, lawn care, gutter cleaning, exterior washing, HVAC tune-ups, chimney sweeping, snow removal
- **Episodic services** — bat removal, roof repair, plumbing emergencies, appliance replacement
- **Appliances** — laundry (washer, dryer), kitchen, water heater, sump pump
- **Mortgage and insurance** — lender statements, escrow, refinancing notes, homeowner's policy, property-tax assessments
- **Neighborhood / HOA** — HOA notices, neighborhood-listserv excerpts, easement / right-of-way notes

## Skills

This repo ships ten skills that build a layered home-property KB on top of the Semiont SDK. See [AGENTS.md](AGENTS.md) for the full design discussion.

| Skill | What it does |
|---|---|
| [`ingest-corpus`](skills/ingest-corpus/SKILL.md) | Walk the repo's corpus and create one resource per file. |
| [`mark-house-entities`](skills/mark-house-entities/SKILL.md) | Detect Person, Room, Subsystem, Appliance, Vendor, Utility, Service, Date, MonetaryValue, Address spans — including anaphoric mentions ("the contractor", "the AC unit", "the master bath"). |
| [`canonicalize-rooms`](skills/canonicalize-rooms/SKILL.md) | Promote Room mentions to canonical Room resources. |
| [`canonicalize-subsystems`](skills/canonicalize-subsystems/SKILL.md) | Promote Subsystem / Appliance mentions to canonical Subsystem resources, with installed-date / warranty / manufacturer-rated lifespan. |
| [`canonicalize-vendors`](skills/canonicalize-vendors/SKILL.md) | Promote Vendor / service-company mentions to canonical Vendor resources. |
| [`extract-events`](skills/extract-events/SKILL.md) | Synthesize one Event resource per dated service / repair / payment / visit, bound to its Subsystem and Vendor. |
| [`track-recurring-services`](skills/track-recurring-services/SKILL.md) | Identify recurring service schedules (quarterly pest control, biannual HVAC); project next-due dates. |
| [`comment-action-items`](skills/comment-action-items/SKILL.md) | Surface follow-up items, missing documentation, unaddressed warranty events. |
| [`assess-house-maintenance`](skills/assess-house-maintenance/SKILL.md) | Backward-looking aggregate — per-Subsystem maintenance score, deferred work, documentation gaps. |
| [`prioritize-house-systems`](skills/prioritize-house-systems/SKILL.md) | Forward-looking aggregate — ranked priority list with cost estimate, cascade risk, warranty-status. |
| [`vendor-track-record`](skills/vendor-track-record/SKILL.md) | Per-Vendor decisional summary — visit history, reliability, costs, last-used recency. |

## Quick Start

Explore this dataset using [Semiont](https://github.com/The-AI-Alliance/semiont). This repo follows the same layout and startup flow as [`semiont-template-kb`](https://github.com/The-AI-Alliance/semiont-household-kb).

### Open in Codespaces

```bash
gh codespace create --repo The-AI-Alliance/semiont-household-kb --machine premiumLinux
gh codespace ports forward 4000:4000
gh codespace ssh -- cat .devcontainer/admin.json
```

> **Privacy.** This synthetic dataset poses no privacy risk; a real personal-property KB deployment with actual addresses, vendor contracts, and mortgage details should use the local-first start path rather than Codespaces. See [`PERSONAL-KB-EXPLORATION.md`](https://github.com/The-AI-Alliance/semiont-household-kb/blob/main/PERSONAL-KB-EXPLORATION.md#privacy-as-a-first-order-design-concern) for the longer discussion.

## License

Apache 2.0 — See [LICENSE](LICENSE) for details.
