/**
 * comment-action-items — flag passages requiring follow-up across the corpus.
 *
 * Usage: tsx skills/comment-action-items/script.ts [--interactive]
 */

import { SemiontClient, resourceId as ridBrand, type ResourceId } from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';
import { createdCount } from '../../src/mark-result.js';

const COMMENT_INSTRUCTIONS =
  process.env.COMMENT_INSTRUCTIONS ??
  `Identify passages in this household document that warrant follow-up:
open warranty claims, missing manuals, deferred repairs, promised follow-ups not yet made,
ambiguous contractor-estimate scope, unresolved utility billing disputes, expiring contracts,
HOA violations or notices that need response, neighbor-affecting maintenance items.
For each, tag the span and write a brief comment (1–2 sentences) explaining what needs to happen.`;

function getMediaType(r: any): string | undefined {
  const reps = Array.isArray(r.representations)
    ? r.representations
    : r.representations
      ? [r.representations]
      : [];
  return reps[0]?.mediaType;
}

async function main(): Promise<void> {
  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  const all = await semiont.browse.resources({ limit: 1000 });
  const targets: ResourceId[] = all
    .filter((r) => {
      const mt = getMediaType(r);
      return mt === 'text/markdown' || mt === 'text/plain';
    })
    .map((r) => ridBrand(r['@id']));

  if (targets.length === 0) {
    console.log('No markdown corpus resources found.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  console.log(`Will comment ${targets.length} resource(s) for follow-up.`);
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    semiont.dispose();
    closeInteractive();
    return;
  }

  let total = 0;
  for (const rId of targets) {
    const progress = await semiont.mark.assist(rId, 'commenting', {
      instructions: COMMENT_INSTRUCTIONS,
    });
    const n = createdCount(progress);
    total += n;
    console.log(`  ${rId}: ${n} commenting annotations`);
  }

  console.log(`\nDone. Created ${total} commenting annotations.`);
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
