/**
 * canonicalize-subsystems — promote Subsystem / Appliance mentions to
 * canonical Subsystem resources with ManufacturerManual / industry-standard
 * External References.
 *
 * Usage: tsx skills/canonicalize-subsystems/script.ts [--interactive]
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
import {
  lookupManufacturerStub,
  lookupAshraeStub,
  lookupNfpaStub,
  lookupNrcaStub,
  formatReferenceSection,
  type ExternalReference,
} from '../../src/external-authorities.js';

const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 30);
const TARGET_TAGS = new Set([
  'Subsystem',
  'Appliance',
  'HVAC',
  'Plumbing',
  'Electrical',
  'RoofingSystem',
  'Foundation',
  'Networking',
  'Security',
  'Entertainment',
  'WaterHeater',
  'Pump',
]);

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

interface SubAnno {
  rId: ResourceId;
  annId: AnnotationId;
  text: string;
  tags: string[];
  alreadyBound: boolean;
}

/** Pick the right industry-standard reference for a Subsystem based on its tags. */
function pickStandardRefs(tags: string[], surfaceText: string): ExternalReference[] {
  const refs: ExternalReference[] = [];
  const lc = surfaceText.toLowerCase();
  if (tags.includes('HVAC') || /\b(furnace|boiler|hvac|air[\s-]?conditioning|heat pump)\b/.test(lc)) {
    refs.push(lookupAshraeStub('HVAC inspection schedule'));
  }
  if (tags.includes('Electrical') || /\b(electrical|panel|breaker|circuit|wiring)\b/.test(lc)) {
    refs.push(lookupNfpaStub('electrical safety'));
  }
  if (tags.includes('RoofingSystem') || /\b(roof|shingles?|gutter)\b/.test(lc)) {
    refs.push(lookupNrcaStub('roofing inspection'));
  }
  return refs;
}

async function main(): Promise<void> {
  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'household-canonicalize-subsystems',
    label: 'household canonicalize-subsystems',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  try {
    const all = await semiont.browse.resources({ limit: 1000 });
    const markdown = all.filter((r) => {
      const mt = getMediaType(r);
      return mt === 'text/markdown' || mt === 'text/plain';
    });

    const subAnnos: SubAnno[] = [];
    for (const r of markdown) {
      const rId = ridBrand(r['@id']);
      const annotations = await semiont.browse.annotations(rId);
      for (const ann of annotations) {
        if (ann.motivation !== 'linking') continue;
        const bodies = Array.isArray(ann.body) ? ann.body : ann.body ? [ann.body] : [];
        const tags = bodies
          .filter((b: any) => b.type === 'TextualBody' && b.purpose === 'tagging')
          .flatMap((b: any) => (Array.isArray(b.value) ? b.value : [b.value])) as string[];
        if (!tags.some((t) => TARGET_TAGS.has(t))) continue;
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
        subAnnos.push({
          rId,
          annId: ann.id,
          text,
          tags: tags.filter((t) => TARGET_TAGS.has(t)),
          alreadyBound,
        });
      }
    }

    if (subAnnos.length === 0) {
      console.log('No Subsystem/Appliance annotations found. Run skills/mark-house-entities/script.ts first.');
      closeInteractive();
      return;
    }

    const clusters = new Map<string, SubAnno[]>();
    let alreadyBound = 0;
    for (const a of subAnnos) {
      if (a.alreadyBound) {
        alreadyBound++;
        continue;
      }
      const key = a.text.toLowerCase().replace(/^the\s+/, '').trim();
      if (!key) continue;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(a);
    }

    console.log(
      `${subAnnos.length} Subsystem annotations; ${alreadyBound} already bound; ${clusters.size} clusters.`,
    );
    const proceed = await confirm('Proceed?', true);
    if (!proceed) {
      closeInteractive();
      return;
    }

    let bound = 0;
    let synthesized = 0;
    for (const [key, anns] of clusters) {
      const sample = anns[0];
      if (!sample) continue;
      const gather = await semiont.gather.annotation(sample.rId, sample.annId, { contextWindow: 1500 });
      if (!('response' in gather)) continue;
      const context = gather.response as GatheredContext;
      const matchResult = await semiont.match.search(sample.rId, sample.annId, context, {
        limit: 5,
        useSemanticScoring: true,
      });
      const top = matchResult.response[0];

      let targetResourceId: string;
      if (top && (top.score ?? 0) >= MATCH_THRESHOLD && top.entityTypes?.includes('Subsystem')) {
        targetResourceId = top['@id'];
        console.log(`  ↪ "${sample.text}" → ${top.name} (existing, score ${top.score})`);
      } else {
        const proceedYield = isInteractive()
          ? await confirm(`Synthesize new Subsystem for "${sample.text}"?`, true)
          : true;
        if (!proceedYield) continue;

        // Pick relevant standard references based on tags + surface text
        const refs: ExternalReference[] = [];
        // Manufacturer manual stub — the LLM body will fill in manufacturer/model from gathered context
        refs.push(lookupManufacturerStub(key));
        refs.push(...pickStandardRefs(sample.tags, sample.text));
        const externalRefs = formatReferenceSection(refs);

        // Pull the most-specific entity type from sample tags as the leading type
        const leadTag = sample.tags.find((t) => t !== 'Subsystem') ?? 'Subsystem';
        const entityTypes = leadTag === 'Subsystem' ? ['Subsystem'] : ['Subsystem', leadTag];

        const yieldEvent = await semiont.yield.fromContext(context, {
          title: key,
          storageUri: `file://generated/subsystem-${slugify(key)}.md`,
          entityTypes,
          prompt: externalRefs
            ? `Include this references section at the end of the body verbatim:\n\n${externalRefs}`
            : undefined,
          });
        if (yieldEvent.kind !== 'complete') continue;
        const newResourceId = (yieldEvent.data.result as { resourceId?: string } | undefined)?.resourceId;
        if (!newResourceId) continue;
        targetResourceId = newResourceId;
        synthesized++;
        console.log(`  + "${sample.text}" → ${newResourceId} (${entityTypes.join(', ')}; ${refs.length} refs)`);
      }

      for (const a of anns) {
        await semiont.bind.body(a.rId, a.annId, [
          { op: 'add', item: { type: 'SpecificResource', source: targetResourceId, purpose: 'linking' } },
        ]);
        bound++;
      }
    }

    console.log(`\nDone. Bound ${bound} annotations; ${synthesized} new Subsystem resources.`);
    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
