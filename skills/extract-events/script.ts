/**
 * extract-events — turn every dated household event into an Event resource.
 *
 * Usage: tsx skills/extract-events/script.ts [--interactive]
 */

import {
  SemiontClient,
  resourceId as ridBrand,
  type AnnotationId,
  type GatheredContext,
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
  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  const all = await semiont.browse.resources({ limit: 1000 });
  const markdown = all.filter((r) => {
    const mt = getMediaType(r);
    return mt === 'text/markdown' || mt === 'text/plain';
  });

  const dateAnnos: DateAnno[] = [];
  for (const r of markdown) {
    const rId = ridBrand(r['@id']);
    const annotations = await semiont.browse.annotations(rId);
    for (const ann of annotations) {
      if (ann.motivation !== 'linking') continue;
      const tags = (ann.body ?? [])
        .filter((b: any) => b.type === 'TextualBody' && b.purpose === 'tagging')
        .flatMap((b: any) => (Array.isArray(b.value) ? b.value : [b.value]));
      if (!tags.includes('Date')) continue;

      const sel = ann.target?.selector;
      const exact = (sel?.exact ?? '') as string;
      const span = sel && typeof sel.start === 'number' && typeof sel.end === 'number'
        ? sel.end - sel.start
        : exact.length;
      // Date span itself is short; the test of "context length" comes when we gather
      dateAnnos.push({ rId, annId: ann.id, text: exact, contextLength: span });
    }
  }

  if (dateAnnos.length === 0) {
    console.log('No Date annotations found. Run skills/mark-house-entities/script.ts first.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  console.log(`Found ${dateAnnos.length} Date annotation(s) to consider for Event extraction.`);
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    semiont.dispose();
    closeInteractive();
    return;
  }

  let synthesized = 0;
  let skipped = 0;
  for (const d of dateAnnos) {
    const gather = await semiont.gather.annotation(d.annId, d.rId, { contextWindow: 1200 });
    const context = gather.response as GatheredContext;
    const ctxText = (context as any).text ?? (context as any).content ?? '';
    if (typeof ctxText === 'string' && ctxText.length < MIN_DATE_CONTEXT) {
      skipped++;
      continue;
    }

    const yieldEvent = await semiont.yield.fromAnnotation(d.rId, d.annId, {
      title: `Event: ${d.text}`,
      storageUri: `file://generated/event-${slugify(d.text)}-${d.annId.slice(-6)}.md`,
      context,
      entityTypes: ['Event', 'Aggregate'],
      instructions: EVENT_INSTRUCTIONS,
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
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
