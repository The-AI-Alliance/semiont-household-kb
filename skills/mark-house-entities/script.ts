/**
 * mark-house-entities — detect Person, Room, Subsystem, Appliance, Vendor,
 * Utility, Service, Date, MonetaryValue, Address spans across the markdown
 * corpus.
 *
 * mark.assist with motivation 'linking'. Default behavior surfaces both
 * formally-named entities (people, rooms, subsystems, dates, …) AND
 * anaphoric / descriptive references that point at those entity types
 * ("the contractor", "the AC", "the master bath"). Tier-2 canonicalize-*
 * skills resolve them.
 *
 * Set INCLUDE_DESCRIPTIVE_REFERENCES=0 to restrict the pass to named
 * entities only.
 *
 * Usage: tsx skills/mark-house-entities/script.ts [<resourceId>] [--interactive]
 */

import { SemiontSession, InMemorySessionStorage, entityType, resourceId as ridBrand, type KnowledgeBase, type ResourceId } from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';
import { createdCount } from '../../src/mark-result.js';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Person,Vendor,Room,Subsystem,Appliance,Utility,Service,Date,MonetaryValue,Address'
)
  .split(',')
  .map((t) => entityType(t.trim()));

// Default true. The worker prompt under includeDescriptiveReferences:true
// asks for BOTH direct mentions and anaphora — strict superset of the
// named-entity-only pass. Off only when callers explicitly want the
// narrower set.
const INCLUDE_DESCRIPTIVE_REFERENCES =
  (process.env.INCLUDE_DESCRIPTIVE_REFERENCES ?? '1') !== '0';

function getMediaType(r: any): string | undefined {
  const reps = Array.isArray(r.representations)
    ? r.representations
    : r.representations
      ? [r.representations]
      : [];
  return reps[0]?.mediaType;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const explicitResourceId = args[0];

  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'household-mark-house-entities',
    label: 'household mark-house-entities',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  let targets: ResourceId[];
  if (explicitResourceId) {
    targets = [ridBrand(explicitResourceId)];
  } else {
    const all = await semiont.browse.resources({ limit: 1000 });
    targets = all
      .filter((r) => {
        const mt = getMediaType(r);
        return mt === 'text/markdown' || mt === 'text/plain';
      })
      .map((r) => ridBrand(r['@id']));
  }

  if (targets.length === 0) {
    console.log('No markdown corpus resources found. Run skills/ingest-corpus/script.ts first.');
    await session.dispose();
    closeInteractive();
    return;
  }

  console.log(
    `Will run mark.assist (motivation: linking, ${ENTITY_TYPES.length} entity types, ` +
      `descriptive references ${INCLUDE_DESCRIPTIVE_REFERENCES ? 'on' : 'off'}) ` +
      `against ${targets.length} markdown resource(s).`,
  );
  console.log(`  Entity types: ${ENTITY_TYPES.join(', ')}`);

  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    await session.dispose();
    closeInteractive();
    return;
  }

  let totalCreated = 0;
  for (const rId of targets) {
    const progress = await semiont.mark.assist(rId, 'linking', {
      entityTypes: ENTITY_TYPES,
      includeDescriptiveReferences: INCLUDE_DESCRIPTIVE_REFERENCES,
    });
    const n = createdCount(progress);
    totalCreated += n;
    console.log(`  ${rId}: ${n} new annotations`);
  }

  console.log(`\nDone. Created ${totalCreated} house-entity annotations.`);
  await session.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
