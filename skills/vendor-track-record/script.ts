/**
 * vendor-track-record — per-Vendor decisional aggregate.
 *
 * Usage: tsx skills/vendor-track-record/script.ts [--vendor <resourceId>]
 */

import {
  SemiontSession,
  InMemorySessionStorage,
  httpKb,
  resourceId as ridBrand,
} from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';

const TRACK_RECORD_INSTRUCTIONS =
  process.env.TRACK_RECORD_INSTRUCTIONS ??
  `Synthesize a Vendor Track Record:
- Vendor: name + canonical resourceId.
- Service categories: which subsystems / event kinds did this vendor handle?
- Visit history: chronological list with date, subsystem, cost where present, link to Event resourceId.
- Total spend: sum of parseable costs (clearly mark estimates if costs are missing for some events).
- Last-used recency: how long since the homeowner used this vendor.
- Repeat pattern: how many distinct visits, how many distinct subsystems served.
- Outstanding concerns: any commenting annotations on the source documents.
- Decisional note: 1–2 sentences on whether the homeowner should call this vendor again, with the rationale grounded in the visit history. Mark explicitly as LLM judgment.`;

function parseVendorArg(): string | undefined {
  const i = process.argv.indexOf('--vendor');
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

async function main(): Promise<void> {
  const vendorArg = parseVendorArg();

  const gateway = new URL(process.env.SEMIONT_API_URL ?? 'http://localhost:4000');
  const session = await SemiontSession.signInDevice({
    kb: httpKb({
      id: 'household-vendor-track-record',
      label: 'household vendor-track-record',
      host: gateway.hostname,
      port: Number(gateway.port) || 4000,
      protocol: gateway.protocol === 'https:' ? 'https' : 'http',
    }),
    storage: new InMemorySessionStorage(),
    onCode: ({ verificationUri, verificationUriComplete, userCode }) => {
      console.error(`Approve this script at ${verificationUriComplete ?? verificationUri}`);
      if (!verificationUriComplete) console.error(`Code: ${userCode}`);
    },
  });
  const semiont = session.client;

  try {
    const all = (await semiont.browse.resources({ limit: 5000 }).fresh()).resources;
    const vendors = vendorArg
      ? all.filter((r) => r['@id'] === vendorArg)
      : all.filter((r) => {
          const types: string[] = r.entityTypes ?? [];
          return types.includes('Vendor');
        });
    const events = all.filter((r) => {
      const types: string[] = r.entityTypes ?? [];
      return types.includes('Event');
    });

    if (vendors.length === 0) {
      console.log('No canonical Vendor resources. Run skills/canonicalize-vendors first.');
      closeInteractive();
      return;
    }

    console.log(`Will synthesize VendorTrackRecord for ${vendors.length} Vendor(s).`);
    const proceed = await confirm('Proceed?', true);
    if (!proceed) {
      closeInteractive();
      return;
    }

    // Build a map of events per vendor by walking event-annotation bodies
    const eventsByVendor = new Map<string, typeof events>();
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
          const target = all.find((x) => x['@id'] === targetId);
          const types: string[] = target?.entityTypes ?? [];
          if (!types.includes('Vendor')) continue;
          if (!eventsByVendor.has(targetId)) eventsByVendor.set(targetId, []);
          eventsByVendor.get(targetId)!.push(ev);
        }
      }
    }

    let synthesized = 0;
    for (const vendor of vendors) {
      const vendorId = ridBrand(vendor['@id']);
      const vendorName = vendor.name ?? 'Unknown Vendor';
      const vendorEvents = eventsByVendor.get(vendor['@id']) ?? [];

      if (vendorEvents.length === 0) {
        // Still produce a thin track-record for the vendor; the aggregate will note no events
        console.log(`  - ${vendorName}: 0 events bound — generating thin track-record`);
      }

      // Seed gather: prefer the vendor canonical's own annotations, fall back to first event
      let seedRId = vendorId;
      let seedAnnos = await semiont.browse.annotations(vendorId).fresh();
      if (seedAnnos.length === 0 && vendorEvents.length > 0) {
        const firstEvent = vendorEvents[0];
        if (firstEvent) {
          seedRId = ridBrand(firstEvent['@id']);
          seedAnnos = await semiont.browse.annotations(seedRId).fresh();
        }
      }
      const seedAnno = seedAnnos[0];
      if (!seedAnno) {
        console.warn(`    skip — no seed annotation for ${vendorName}`);
        continue;
      }

      const { response: context } = await semiont.gather.annotation(seedRId, seedAnno.id, { contextWindow: 1500 });

      const eventList = vendorEvents
        .map((e) => `- ${e.name} (\`${e['@id']}\`)`)
        .join('\n');

      const prepend =
        `# Vendor Track Record: ${vendorName}\n\n` +
        `## Bound events (${vendorEvents.length})\n\n${eventList || '(none — vendor canonical exists but no Events have been bound to it yet)'}\n\n---\n\n`;

      const yieldEvent = await semiont.yield.delegate({
        context,
        title: `Vendor Track Record: ${vendorName}`,
        storageUri: `file://generated/vendor-track-${slugify(vendorName)}.md`,
        entityTypes: ['VendorTrackRecord', 'Aggregate'],
        prompt: `${TRACK_RECORD_INSTRUCTIONS}\n\nBegin the body with this preamble verbatim:\n\n${prepend}`,
      });
      if (!yieldEvent.result || !('resourceId' in yieldEvent.result)) continue;
      const newResourceId = yieldEvent.result && 'resourceId' in yieldEvent.result ? yieldEvent.result.resourceId : undefined;
      if (!newResourceId) continue;

      synthesized++;
      console.log(`  + ${newResourceId}: ${vendorName} (${vendorEvents.length} events)`);
    }

    console.log(`\nDone. Synthesized ${synthesized} VendorTrackRecord resource(s).`);
    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
