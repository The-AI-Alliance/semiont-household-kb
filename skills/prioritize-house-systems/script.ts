/**
 * prioritize-house-systems — synthesize the forward-looking
 * SystemPriorities aggregate. Implements Q2 from PERSONAL-KB-EXPLORATION.md.
 *
 * Usage: tsx skills/prioritize-house-systems/script.ts [--interactive]
 */

import {
  SemiontSession,
  InMemorySessionStorage,
  resourceId as ridBrand,
  type GatheredContext,
  type KbTarget,
} from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';
import { lookupLifespan } from '../../src/lifespan-data.js';
import { getMediaType } from '../../src/media-type.js';

const LOOKBACK_MONTHS = Number(process.env.LOOKBACK_MONTHS ?? 24);
const PRIORITIES_INSTRUCTIONS =
  process.env.PRIORITIES_INSTRUCTIONS ??
  `Synthesize a System Priorities document — a ranked list of subsystems that should be addressed
in the next 12 months.

For each priority entry produce:
- Subsystem name + canonical resourceId link
- Status (age vs. expected lifespan, recent issue frequency, warranty status)
- Recommended action (replace / repair / inspect / continue routine)
- Estimated cost from corpus, or industry-typical if no corpus quote exists
- Cascade risk (LLM judgment from subsystem description, marked as such)
- Seasonality (HVAC before summer, roof before winter, pool before opening, etc.)
- Cite supporting Event resources via resourceId links

Then add:
- Budget context section: total recommended cost, prompting the homeowner to compare with their annual capital-improvement budget.
- Comparison with prior year if a previous SystemPriorities resource is available.

Mark synthesis explicitly as LLM judgment, not a substitute for a contractor's site-walk.`;


function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

async function main(): Promise<void> {
  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KbTarget = {
    id: 'household-prioritize-house-systems',
    label: 'household prioritize-house-systems',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  try {
    const all = (await semiont.browse.resources({ limit: 5000 }).fresh()).resources;
    const subsystems = all.filter((r) => {
      const types: string[] = r.entityTypes ?? [];
      return types.includes('Subsystem');
    });
    const events = all.filter((r) => {
      const types: string[] = r.entityTypes ?? [];
      return types.includes('Event');
    });
    const schedules = all.filter((r) => {
      const types: string[] = r.entityTypes ?? [];
      return types.includes('ServiceSchedule');
    });

    if (subsystems.length === 0) {
      console.log('No canonical Subsystem resources. Run skills/canonicalize-subsystems first.');
      closeInteractive();
      return;
    }

    console.log(
      `Considering ${subsystems.length} Subsystem(s), ${events.length} Event(s), ${schedules.length} schedule(s).`,
    );
    const proceed = await confirm('Proceed?', true);
    if (!proceed) {
      closeInteractive();
      return;
    }

    // Build a lifespan-default manifest the LLM can use as a prior
    const lifespanLines = subsystems
      .slice(0, 30)
      .map((s) => {
        const name = (s.name ?? '').toString().toLowerCase();
        const types: string[] = s.entityTypes ?? [];
        const guessKey = name.includes('water heater')
          ? 'water-heater-tank'
          : name.includes('furnace')
            ? 'furnace'
            : name.includes('roof')
              ? 'roof-asphalt-shingle-architectural'
              : name.includes('panel') || types.includes('Electrical')
                ? 'electrical-panel'
                : name.includes('water main')
                  ? 'water-main-copper'
                  : name.includes('washer') || name.includes('dryer') || name.includes('dishwasher')
                    ? 'dishwasher'
                    : 'unknown';
        const range = lookupLifespan(guessKey);
        return `- ${s.name} (\`${s['@id']}\`) — typical lifespan ${range.minYears}–${range.maxYears} years`;
      })
      .join('\n');

    // Pick a seed: subsystem with the most events
    const eventsBySubsystem = new Map<string, number>();
    for (const ev of events) {
      const evAnnos = await semiont.browse.annotations(ridBrand(ev['@id'])).fresh();
      for (const a of evAnnos) {
        const bodies = Array.isArray(a.body) ? a.body : a.body ? [a.body] : [];
        // AnnotationBody is discriminated on `type`; a control-flow guard narrows
        // it to SpecificResource so `.source` is typed. The old `(b: any)` filter
        // callback erased that narrowing, which is why `.source` needed a cast.
        for (const b of bodies) {
          if (b.type !== 'SpecificResource' || b.purpose !== 'linking') continue;
          const targetId = b.source;
          eventsBySubsystem.set(targetId, (eventsBySubsystem.get(targetId) ?? 0) + 1);
        }
      }
    }
    const seedSubsystem =
      [...subsystems].sort((a, b) =>
        (eventsBySubsystem.get(b['@id']) ?? 0) - (eventsBySubsystem.get(a['@id']) ?? 0),
      )[0];
    if (!seedSubsystem) {
      console.error('No Subsystem resources to seed from.');
      closeInteractive();
      return;
    }
    const seedSubsystemId = ridBrand(seedSubsystem['@id']);
    const seedAnnos = await semiont.browse.annotations(seedSubsystemId).fresh();
    const seedAnno = seedAnnos[0];
    if (!seedAnno) {
      console.error('Seed Subsystem has no annotations.');
      closeInteractive();
      return;
    }

    const gather = await semiont.gather.annotation(seedSubsystemId, seedAnno.id, { contextWindow: 2000 });
    if (!('response' in gather)) {
      console.error('gather.annotation did not return a Complete event');
      closeInteractive();
      return;
    }
    const context = gather.response as GatheredContext;

    // "OVERDUE" lives in the schedule's CONTENT, which a ResourceDescriptor does
    // not carry — the previous `(s as any).body` was always undefined, so this
    // filter never matched and the section below was permanently "(none
    // surfaced)". Content must be fetched, so the filter cannot stay synchronous.
    const overdueEntries: string[] = [];
    for (const s of schedules) {
      const content = await semiont.browse.resourceContent(ridBrand(s['@id']));
      if (content.includes('OVERDUE')) {
        overdueEntries.push(`- ${s.name} (\`${s['@id']}\`)`);
      }
    }
    const overdueSchedules = overdueEntries.join('\n');

    const prepend =
      `# System Priorities\n\n*Forward-looking 12-month priority ranking. Generated against the current corpus state.*\n\n` +
      `Lookback window for recent-event signal: ${LOOKBACK_MONTHS} months.\n\n` +
      `## Subsystems with industry-typical lifespan ranges (showing first 30 of ${subsystems.length})\n\n${lifespanLines}\n\n` +
      `## Overdue service schedules\n\n${overdueSchedules || '(none surfaced — schedule cadence is on track or insufficient data)'}\n\n` +
      `---\n\n`;

    const yieldEvent = await semiont.yield.fromContext(context, {
      title: `System Priorities`,
      storageUri: `file://generated/system-priorities-${new Date().toISOString().slice(0, 10)}.md`,
      entityTypes: ['SystemPriorities', 'Aggregate'],
      prompt: `${PRIORITIES_INSTRUCTIONS}\n\nBegin the body with this preamble verbatim:\n\n${prepend}`,
    });
    if (yieldEvent.kind !== 'complete') {
      console.error(`yield.fromContext did not complete: ${yieldEvent.kind}`);
      closeInteractive();
      return;
    }
    const resourceId = (yieldEvent.data.result as { resourceId?: string } | undefined)?.resourceId;
    console.log(`\n✓ SystemPriorities synthesized: ${resourceId}`);

    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
