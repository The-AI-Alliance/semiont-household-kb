/**
 * assess-house-maintenance — synthesize the backward-looking
 * MaintenanceAssessment aggregate. Implements Q1 from PERSONAL-KB-EXPLORATION.md.
 *
 * Usage: tsx skills/assess-house-maintenance/script.ts [--interactive]
 */

import {
  SemiontClient,
  resourceId as ridBrand,
  type GatheredContext,
  type ResourceId,
} from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';

const MAX_GATHER = Number(process.env.MAX_GATHER ?? 15);
const ASSESSMENT_INSTRUCTIONS =
  process.env.ASSESSMENT_INSTRUCTIONS ??
  `Synthesize a Maintenance Assessment in markdown:
- Property summary: number of documented Subsystems, total Events, emergencies, period covered.
- Per-Subsystem section: name, age, manufacturer if known, count of Events by kind, scheduled-vs-actual
  cadence (from ServiceSchedules), warranty status, recent emergencies. Cite every claim with a link
  to the supporting Event resource.
- Maintenance score: a one-line overall rating (well-maintained / mixed / under-maintained / significantly
  under-maintained), explicitly flagged as LLM judgment.
- Documentation gaps: Subsystems with zero Events; periods of the corpus with no records.
Cite every numeric claim by linking to its supporting Event resource (use the resourceId).`;

function getMediaType(r: any): string | undefined {
  const reps = Array.isArray(r.representations)
    ? r.representations
    : r.representations
      ? [r.representations]
      : [];
  return reps[0]?.mediaType;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

async function main(): Promise<void> {
  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  const all = await semiont.browse.resources({ limit: 5000 });
  const subsystems = all.filter((r) => {
    const types: string[] = (r as any).entityTypes ?? [];
    return types.includes('Subsystem');
  });
  const events = all.filter((r) => {
    const types: string[] = (r as any).entityTypes ?? [];
    return types.includes('Event');
  });
  const schedules = all.filter((r) => {
    const types: string[] = (r as any).entityTypes ?? [];
    return types.includes('ServiceSchedule');
  });

  if (subsystems.length === 0) {
    console.log('No canonical Subsystem resources. Run skills/canonicalize-subsystems first.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  console.log(
    `Found ${subsystems.length} Subsystem(s), ${events.length} Event(s), ${schedules.length} ServiceSchedule(s).`,
  );
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    semiont.dispose();
    closeInteractive();
    return;
  }

  // For each subsystem, find the events that point at it (via descriptor binding)
  const eventsBySubsystem = new Map<string, typeof events>();
  for (const ev of events) {
    const evId = ridBrand(ev['@id']);
    const evAnnos = await semiont.browse.annotations(evId);
    for (const a of evAnnos) {
      const bodies = Array.isArray(a.body) ? a.body : a.body ? [a.body] : [];
      const targets = bodies.filter(
        (b: any) => b.type === 'SpecificResource' && b.purpose === 'linking',
      );
      for (const t of targets) {
        const targetId = (t as any).source as string;
        const target = all.find((x) => x['@id'] === targetId);
        const types: string[] = (target as any)?.entityTypes ?? [];
        if (!types.includes('Subsystem')) continue;
        if (!eventsBySubsystem.has(targetId)) eventsBySubsystem.set(targetId, []);
        eventsBySubsystem.get(targetId)!.push(ev);
      }
    }
  }

  // Pick a seed: subsystem with the most events
  const sortedSubsystems = [...subsystems].sort(
    (a, b) =>
      (eventsBySubsystem.get(b['@id'])?.length ?? 0) -
      (eventsBySubsystem.get(a['@id'])?.length ?? 0),
  );
  const seedSubsystem = sortedSubsystems[0];
  if (!seedSubsystem) {
    console.error('No Subsystem resources to seed from.');
    semiont.dispose();
    closeInteractive();
    return;
  }
  const seedSubsystemId = ridBrand(seedSubsystem['@id']);
  const seedAnnos = await semiont.browse.annotations(seedSubsystemId);
  const seedAnno = seedAnnos[0];

  if (!seedAnno) {
    console.error('Seed Subsystem has no annotations to gather from.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  const gather = await semiont.gather.annotation(seedSubsystemId, seedAnno.id, { contextWindow: 2000 });
  if (!('response' in gather)) {
    console.error('gather.annotation did not return a Complete event');
    semiont.dispose();
    closeInteractive();
    return;
  }
  const context = gather.response as GatheredContext;

  // Build a manifest of subsystems + their event counts for the prompt
  const manifest = sortedSubsystems
    .slice(0, 30)
    .map((s) => {
      const n = eventsBySubsystem.get(s['@id'])?.length ?? 0;
      return `- ${(s as any).name} (\`${s['@id']}\`) — ${n} events`;
    })
    .join('\n');

  const scheduleManifest = schedules
    .map((sc) => `- ${(sc as any).name} (\`${sc['@id']}\`)`)
    .join('\n');

  const prepend =
    `# Maintenance Assessment\n\n*Generated against the current corpus state.*\n\n` +
    `## Subsystems considered (showing first 30 of ${subsystems.length})\n\n${manifest}\n\n` +
    `## Service schedules\n\n${scheduleManifest || '(none)'}\n\n---\n\n`;

  const yieldEvent = await semiont.yield.fromAnnotation(seedSubsystemId, seedAnno.id, {
    title: `Maintenance Assessment`,
    storageUri: `file://generated/maintenance-assessment.md`,
    context,
    entityTypes: ['MaintenanceAssessment', 'Aggregate'],
    prompt: `${ASSESSMENT_INSTRUCTIONS}\n\nBegin the body with this preamble verbatim:\n\n${prepend}`,
  });
  if (yieldEvent.kind !== 'complete') {
    console.error(`yield.fromAnnotation did not complete: ${yieldEvent.kind}`);
    semiont.dispose();
    closeInteractive();
    return;
  }
  const resourceId = (yieldEvent.data.result as { resourceId?: string } | undefined)?.resourceId;
  console.log(`\n✓ MaintenanceAssessment synthesized: ${resourceId}`);

  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
