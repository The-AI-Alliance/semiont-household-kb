/**
 * canonicalize-vendors — promote Vendor mentions to canonical Vendor
 * resources.
 *
 * Usage: tsx skills/canonicalize-vendors/script.ts [--interactive]
 */

import {
  SemiontSession,
  InMemorySessionStorage,
  resourceId as ridBrand,
  type AnnotationId,
  type GatheredContext,
  type KnowledgeBase,
  type ResourceId,
} from '@semiont/sdk';
import { confirm, isInteractive, close as closeInteractive } from '../../src/interactive.js';

const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 30);
const TARGET_TAGS = new Set(['Vendor', 'ServiceProvider']);

function getMediaType(r: any): string | undefined {
  const reps = Array.isArray(r.representations)
    ? r.representations
    : r.representations
      ? [r.representations]
      : [];
  return reps[0]?.mediaType;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

interface VendorAnno {
  rId: ResourceId;
  annId: AnnotationId;
  text: string;
  alreadyBound: boolean;
}

async function main(): Promise<void> {
  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'household-canonicalize-vendors',
    label: 'household canonicalize-vendors',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  const all = await semiont.browse.resources({ limit: 1000 });
  const markdown = all.filter((r) => {
    const mt = getMediaType(r);
    return mt === 'text/markdown' || mt === 'text/plain';
  });

  const vendorAnnos: VendorAnno[] = [];
  for (const r of markdown) {
    const rId = ridBrand(r['@id']);
    const annotations = await semiont.browse.annotations(rId);
    for (const ann of annotations) {
      if (ann.motivation !== 'linking') continue;
      const bodies = Array.isArray(ann.body) ? ann.body : ann.body ? [ann.body] : [];
      const tags = bodies
        .filter((b: any) => b.type === 'TextualBody' && b.purpose === 'tagging')
        .flatMap((b: any) => (Array.isArray(b.value) ? b.value : [b.value]));
      if (!tags.some((t: string) => TARGET_TAGS.has(t))) continue;
      const alreadyBound = bodies.some(
        (b: any) => b.type === 'SpecificResource' && b.purpose === 'linking',
      );
      const target = ann.target;
      const selectors =
        typeof target === 'string' || !target.selector
          ? []
          : Array.isArray(target.selector)
            ? target.selector
            : [target.selector];
      let text = '';
      for (const s of selectors) {
        if (s.type === 'TextQuoteSelector') { text = s.exact; break; }
      }
      vendorAnnos.push({
        rId,
        annId: ann.id,
        text,
        alreadyBound,
      });
    }
  }

  if (vendorAnnos.length === 0) {
    console.log('No Vendor annotations found. Run skills/mark-house-entities/script.ts first.');
    await session.dispose();
    closeInteractive();
    return;
  }

  const clusters = new Map<string, VendorAnno[]>();
  let alreadyBound = 0;
  for (const a of vendorAnnos) {
    if (a.alreadyBound) {
      alreadyBound++;
      continue;
    }
    const key = a.text
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/,?\s+(inc|llc|llp|co|corp|company|services|service)\.?$/i, '')
      .trim();
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(a);
  }

  console.log(`${vendorAnnos.length} Vendor annotations; ${alreadyBound} already bound; ${clusters.size} clusters.`);
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    await session.dispose();
    closeInteractive();
    return;
  }

  let bound = 0;
  let synthesized = 0;
  for (const [key, anns] of clusters) {
    const sample = anns[0];
    if (!sample) continue;
    const gather = await semiont.gather.annotation(sample.rId, sample.annId, { contextWindow: 1200 });
    if (!('response' in gather)) continue;
    const context = gather.response as GatheredContext;
    const matchResult = await semiont.match.search(sample.rId, sample.annId, context, {
      limit: 5,
      useSemanticScoring: true,
    });
    const top = matchResult.response[0];

    let targetResourceId: string;
    if (top && (top.score ?? 0) >= MATCH_THRESHOLD && top.entityTypes?.includes('Vendor')) {
      targetResourceId = top['@id'];
      console.log(`  ↪ "${sample.text}" → ${top.name} (existing, score ${top.score})`);
    } else {
      const proceedYield = isInteractive()
        ? await confirm(`Synthesize new Vendor for "${sample.text}"?`, true)
        : true;
      if (!proceedYield) continue;

      const yieldEvent = await semiont.yield.fromAnnotation(sample.rId, sample.annId, {
        title: sample.text,
        storageUri: `file://generated/vendor-${slugify(key)}.md`,
        context,
        entityTypes: ['Vendor'],
      });
      if (yieldEvent.kind !== 'complete') continue;
      const newResourceId = (yieldEvent.data.result as { resourceId?: string } | undefined)?.resourceId;
      if (!newResourceId) continue;
      targetResourceId = newResourceId;
      synthesized++;
      console.log(`  + "${sample.text}" → ${newResourceId} (synthesized)`);
    }

    for (const a of anns) {
      await semiont.bind.body(a.rId, a.annId, [
        { op: 'add', item: { type: 'SpecificResource', source: targetResourceId, purpose: 'linking' } },
      ]);
      bound++;
    }
  }

  console.log(`\nDone. Bound ${bound} annotations; ${synthesized} new Vendor resources.`);
  await session.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
