/**
 * mark-house-entities — detect Person, Room, Subsystem, Appliance, Vendor,
 * Utility, Service, Date, MonetaryValue, Address spans across the markdown
 * corpus.
 *
 * mark.delegate with motivation 'linking'. Default behavior surfaces both
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

import { SemiontSession, InMemorySessionStorage, httpKb, entityType, resourceId as ridBrand, type ResourceId } from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';
import { getMediaType } from '../../src/media-type.js';

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


async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const explicitResourceId = args[0];

  const gateway = new URL(process.env.SEMIONT_API_URL ?? 'http://localhost:4000');
  const opened = await SemiontSession.signInDevice({
    kb: httpKb({
      id: 'household-mark-house-entities',
      label: 'household mark-house-entities',
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
  const semiont = opened.session.client;

  try {
    let targets: ResourceId[];
    if (explicitResourceId) {
      targets = [ridBrand(explicitResourceId)];
    } else {
      const all = (await semiont.browse.resources({ limit: 1000 }).fresh()).resources;
      targets = all
        .filter((r) => {
          const mt = getMediaType(r);
          return mt === 'text/markdown' || mt === 'text/plain';
        })
        .map((r) => r['@id']);
    }

    if (targets.length === 0) {
      console.log('No markdown corpus resources found. Run skills/ingest-corpus/script.ts first.');
      closeInteractive();
      return;
    }

    console.log(
      `Will run mark.delegate (motivation: linking, ${ENTITY_TYPES.length} entity types, ` +
        `descriptive references ${INCLUDE_DESCRIPTIVE_REFERENCES ? 'on' : 'off'}) ` +
        `against ${targets.length} markdown resource(s).`,
    );
    console.log(`  Entity types: ${ENTITY_TYPES.join(', ')}`);

    const proceed = await confirm('Proceed?', true);
    if (!proceed) {
      closeInteractive();
      return;
    }

    let totalCreated = 0;
    for (const rId of targets) {
      const done = await semiont.mark.delegate(rId, {
        motivation: 'linking',
        entityTypes: ENTITY_TYPES,
        includeDescriptiveReferences: INCLUDE_DESCRIPTIVE_REFERENCES,
      });
      const n = done.result && 'persisted' in done.result ? done.result.persisted : 0;
      totalCreated += n;
      console.log(`  ${rId}: ${n} new annotations`);
    }

    console.log(`\nDone. Created ${totalCreated} house-entity annotations.`);
    closeInteractive();
  } finally {
    opened.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
