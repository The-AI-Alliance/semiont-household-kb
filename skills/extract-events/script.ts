/**
 * extract-events — turn every dated household event into an Event resource.
 *
 * Usage: tsx skills/extract-events/script.ts [--interactive]
 */

import {
  SemiontSession,
  InMemorySessionStorage,
  resourceId as ridBrand,
  type AnnotationId,
  type GatheredContext,
  type KbTarget,
  type ResourceId,
} from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';

const MIN_DATE_CONTEXT = Number(process.env.MIN_DATE_CONTEXT ?? 40);
const EVENT_INSTRUCTIONS =
  process.env.EVENT_INSTRUCTIONS ??
  `From the gathered context surrounding this Date, produce a structured Event:
- Date: the date itself, normalized to YYYY-MM-DD where possible
- Kind: one of {service, repair, inspection, payment, visit, utility-bill, episodic}
- Subsystem: which canonical Subsystem the event concerns (HVAC, Plumbing, Electrical, etc.)
- Vendor: which canonical Vendor performed the work, if any
- Cost: dollar amount if reported
- Notes: brief description (1–2 sentences) of what happened
- Outcome: any reported result (worked / failed / deferred)
Only synthesize an Event if the surrounding context actually describes a discrete event. If the
date is just a header timestamp with no event content, return an empty body and the harness will
skip it.`;

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

interface DateAnno {
  rId: ResourceId;
  annId: AnnotationId;
  text: string;
  contextLength: number;
}

async function main(): Promise<void> {
  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KbTarget = {
    id: 'household-extract-events',
    label: 'household extract-events',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  try {
    const all = (await semiont.browse.resources({ limit: 1000 }).fresh()).resources;
    const markdown = all.filter((r) => {
      const mt = getMediaType(r);
      return mt === 'text/markdown' || mt === 'text/plain';
    });

    const dateAnnos: DateAnno[] = [];
    for (const r of markdown) {
      const rId = ridBrand(r['@id']);
      const annotations = await semiont.browse.annotations(rId).fresh();
      for (const ann of annotations) {
        if (ann.motivation !== 'linking') continue;
        const bodies = Array.isArray(ann.body) ? ann.body : ann.body ? [ann.body] : [];
        const tags = bodies
          .filter((b: any) => b.type === 'TextualBody' && b.purpose === 'tagging')
          .flatMap((b: any) => (Array.isArray(b.value) ? b.value : [b.value]));
        if (!tags.includes('Date')) continue;

        const target = ann.target;
        const selectors =
          typeof target === 'string' || !target.selector
            ? []
            : Array.isArray(target.selector)
              ? target.selector
              : [target.selector];
        let exact = '';
        let span = 0;
        for (const s of selectors) {
          if (s.type === 'TextQuoteSelector') { exact = s.exact; }
          if (s.type === 'TextPositionSelector') { span = s.end - s.start; }
        }
        if (!span) span = exact.length;
        // Date span itself is short; the test of "context length" comes when we gather
        dateAnnos.push({ rId, annId: ann.id, text: exact, contextLength: span });
      }
    }

    if (dateAnnos.length === 0) {
      console.log('No Date annotations found. Run skills/mark-house-entities/script.ts first.');
      closeInteractive();
      return;
    }

    console.log(`Found ${dateAnnos.length} Date annotation(s) to consider for Event extraction.`);
    const proceed = await confirm('Proceed?', true);
    if (!proceed) {
      closeInteractive();
      return;
    }

    let synthesized = 0;
    let skipped = 0;
    for (const d of dateAnnos) {
      const gather = await semiont.gather.annotation(d.rId, d.annId, { contextWindow: 1200 });
      if (!('response' in gather)) continue;
      const context = gather.response as GatheredContext;
      const ctxText = (context as any).text ?? (context as any).content ?? '';
      if (typeof ctxText === 'string' && ctxText.length < MIN_DATE_CONTEXT) {
        skipped++;
        continue;
      }

      const yieldEvent = await semiont.yield.fromContext(context, {
        title: `Event: ${d.text}`,
        storageUri: `file://generated/event-${slugify(d.text)}-${d.annId.slice(-6)}.md`,
        entityTypes: ['Event', 'Aggregate'],
        prompt: EVENT_INSTRUCTIONS,
      });
      if (yieldEvent.kind !== 'complete') continue;
      const newResourceId = (yieldEvent.data.result as { resourceId?: string } | undefined)?.resourceId;
      if (!newResourceId) continue;

      await semiont.bind.body(d.rId, d.annId, [
        { op: 'add', item: { type: 'SpecificResource', source: newResourceId, purpose: 'linking' } },
      ]);
      synthesized++;
      console.log(`  + ${newResourceId} (date "${d.text}")`);
    }

    console.log(`\nDone. Synthesized ${synthesized} Event resources; ${skipped} dates skipped (insufficient context).`);
    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
