/**
 * canonicalize-rooms — promote Room mentions to canonical Room resources.
 *
 * Usage: tsx skills/canonicalize-rooms/script.ts [--interactive]
 */

import {
  SemiontClient,
  resourceId as ridBrand,
  type AnnotationId,
  type GatheredContext,
  type ResourceId,
} from '@semiont/sdk';
import { confirm, isInteractive, close as closeInteractive } from '../../src/interactive.js';

const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 30);

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

interface RoomAnno {
  rId: ResourceId;
  annId: AnnotationId;
  text: string;
  alreadyBound: boolean;
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

  const roomAnnos: RoomAnno[] = [];
  for (const r of markdown) {
    const rId = ridBrand(r['@id']);
    const annotations = await semiont.browse.annotations(rId);
    for (const ann of annotations) {
      if (ann.motivation !== 'linking') continue;
      const tags = (ann.body ?? [])
        .filter((b: any) => b.type === 'TextualBody' && b.purpose === 'tagging')
        .flatMap((b: any) => (Array.isArray(b.value) ? b.value : [b.value]));
      if (!tags.includes('Room')) continue;
      const alreadyBound = (ann.body ?? []).some(
        (b: any) => b.type === 'SpecificResource' && b.purpose === 'linking',
      );
      roomAnnos.push({
        rId,
        annId: ann.id,
        text: ann.target?.selector?.exact ?? '',
        alreadyBound,
      });
    }
  }

  if (roomAnnos.length === 0) {
    console.log('No Room annotations found. Run skills/mark-house-entities/script.ts first.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  const clusters = new Map<string, RoomAnno[]>();
  let alreadyBound = 0;
  for (const a of roomAnnos) {
    if (a.alreadyBound) {
      alreadyBound++;
      continue;
    }
    const key = a.text.toLowerCase().replace(/^the\s+/, '').trim();
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(a);
  }

  console.log(`${roomAnnos.length} Room annotations; ${alreadyBound} already bound; ${clusters.size} clusters.`);
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    semiont.dispose();
    closeInteractive();
    return;
  }

  let bound = 0;
  let synthesized = 0;
  for (const [key, anns] of clusters) {
    const sample = anns[0];
    const gather = await semiont.gather.annotation(sample.rId, sample.annId, { contextWindow: 800 });
    const context = gather.response as GatheredContext;
    const matchResult = await semiont.match.search(sample.rId, sample.annId, context, {
      limit: 5,
      useSemanticScoring: true,
    });
    const top = matchResult.response[0];

    let targetResourceId: string;
    if (top && (top.score ?? 0) >= MATCH_THRESHOLD && top.entityTypes?.includes('Room')) {
      targetResourceId = top['@id'];
      console.log(`  ↪ "${sample.text}" → ${top.name} (existing, score ${top.score})`);
    } else {
      const proceedYield = isInteractive()
        ? await confirm(`Synthesize new Room for "${sample.text}"?`, true)
        : true;
      if (!proceedYield) continue;

      const yieldEvent = await semiont.yield.fromAnnotation(sample.rId, sample.annId, {
        title: key,
        storageUri: `file://generated/room-${slugify(key)}.md`,
        context,
        entityTypes: ['Room'],
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

  console.log(`\nDone. Bound ${bound} annotations; ${synthesized} new Room resources.`);
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
