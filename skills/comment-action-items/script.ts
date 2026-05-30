/**
 * comment-action-items — flag passages requiring follow-up across the corpus.
 *
 * Usage: tsx skills/comment-action-items/script.ts [--interactive]
 */

import { SemiontSession, InMemorySessionStorage, resourceId as ridBrand, type KnowledgeBase, type ResourceId } from '@semiont/sdk';
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
  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'household-comment-action-items',
    label: 'household comment-action-items',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  const all = await semiont.browse.resources({ limit: 1000 });
  const targets: ResourceId[] = all
    .filter((r) => {
      const mt = getMediaType(r);
      return mt === 'text/markdown' || mt === 'text/plain';
    })
    .map((r) => ridBrand(r['@id']));

  if (targets.length === 0) {
    console.log('No markdown corpus resources found.');
    await session.dispose();
    closeInteractive();
    return;
  }

  console.log(`Will comment ${targets.length} resource(s) for follow-up.`);
  const proceed = await confirm('Proceed?', true);
  if (!proceed) {
    await session.dispose();
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
  await session.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
