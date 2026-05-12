/**
 * mark-descriptive-references — detect anaphoric mentions of household
 * entities ("the contractor", "the AC unit", "the basement").
 *
 * Usage: tsx skills/mark-descriptive-references/script.ts [<resourceId>] [--interactive]
 */

import { SemiontClient, entityType, resourceId as ridBrand, type ResourceId } from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';
import { createdCount } from '../../src/mark-result.js';

// mark.assist with motivation 'linking' requires a non-empty entityTypes
// array (SDK validation). The descriptive-reference pass scopes detection
// to the same household vocabulary `mark-house-entities` uses. Override
// with the ENTITY_TYPES env var.
const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Person,Vendor,Room,Subsystem,Appliance,Utility,Service,Date,MonetaryValue,Address'
)
  .split(',')
  .map((t) => entityType(t.trim()));

const REFERENCE_INSTRUCTIONS = `
Identify anaphoric / descriptive references to household entities — definite-article references
that refer to a Subsystem, Vendor, Appliance, or Room that's been named formally elsewhere in this
or another document. Common targets:
  - "the contractor", "the plumber", "the electrician", "the cleaner"
  - "the AC", "the furnace", "the boiler", "the heat pump"
  - "the roof", "the basement", "the master bath", "the kitchen"
  - "the panel", "the breaker", "the water heater", "the sump pump"
Tag each span and add a short tag value naming what kind of entity it points to (the entity-type
the resolution will target, e.g., 'descriptive-Subsystem', 'descriptive-Vendor', 'descriptive-Room').
Do not tag generic nouns where there's no implied prior antecedent (e.g., "we had a contractor over"
without context isn't a descriptive reference yet).
`.trim();

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

  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

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
    console.log('No markdown corpus resources found.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  console.log(`Will detect descriptive references across ${targets.length} resource(s).`);
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    semiont.dispose();
    closeInteractive();
    return;
  }

  let total = 0;
  for (const rId of targets) {
    const progress = await semiont.mark.assist(rId, 'linking', {
      entityTypes: ENTITY_TYPES,
      includeDescriptiveReferences: true,
      instructions: REFERENCE_INSTRUCTIONS,
    });
    const n = createdCount(progress);
    total += n;
    console.log(`  ${rId}: ${n} descriptive-reference annotations`);
  }

  console.log(`\nDone. Created ${total} descriptive-reference annotations.`);
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
