/**
 * track-recurring-services — infer service cadences from the Event log;
 * produce ServiceSchedule resources with projected next-due dates.
 *
 * Usage: tsx skills/track-recurring-services/script.ts [--interactive]
 */

import { SemiontSession, InMemorySessionStorage, resourceId as ridBrand, type KnowledgeBase } from '@semiont/sdk';
import { confirm, close as closeInteractive } from '../../src/interactive.js';

const MIN_OCCURRENCES = Number(process.env.MIN_OCCURRENCES ?? 3);
const IRREGULAR_TOLERANCE = Number(process.env.IRREGULAR_TOLERANCE ?? 0.4);

interface EventRecord {
  resourceId: string;
  date: Date;
  subsystem: string | null;
  vendor: string | null;
  kind: string | null;
  raw: any;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const a = sorted[mid - 1] ?? 0;
    const b = sorted[mid] ?? 0;
    return (a + b) / 2;
  }
  return sorted[mid] ?? 0;
}

function coefficientOfVariation(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean === 0) return 0;
  const variance = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance) / mean;
}

function classifyCadence(medianDays: number): string {
  if (medianDays < 45) return 'monthly';
  if (medianDays < 120) return 'quarterly';
  if (medianDays < 250) return 'biannual';
  if (medianDays < 450) return 'annual';
  return 'biennial-or-rarer';
}

/** Heuristic event-body parser — pulls structured fields from yield.fromAnnotation prose. */
function parseEventBody(body: string): { date: Date | null; subsystem: string | null; vendor: string | null; kind: string | null } {
  const out = { date: null as Date | null, subsystem: null as string | null, vendor: null as string | null, kind: null as string | null };
  const dateMatch = body.match(/(?:Date|date)[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4})/);
  if (dateMatch && dateMatch[1]) {
    const parsed = new Date(dateMatch[1]);
    if (!isNaN(parsed.getTime())) out.date = parsed;
  }
  const subsystemMatch = body.match(/(?:Subsystem|System|subsystem)[:\s]+([^\n]+)/i);
  if (subsystemMatch && subsystemMatch[1]) out.subsystem = subsystemMatch[1].trim().toLowerCase();
  const vendorMatch = body.match(/(?:Vendor|vendor)[:\s]+([^\n]+)/i);
  if (vendorMatch && vendorMatch[1]) out.vendor = vendorMatch[1].trim().toLowerCase();
  const kindMatch = body.match(/(?:Kind|kind|Type|type)[:\s]+([^\n]+)/i);
  if (kindMatch && kindMatch[1]) out.kind = kindMatch[1].trim().toLowerCase();
  return out;
}

async function main(): Promise<void> {
  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'household-track-recurring-services',
    label: 'household track-recurring-services',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  try {
    const all = await semiont.browse.resources({ limit: 5000 });
    const events = all.filter((r) => {
      const types: string[] = (r as any).entityTypes ?? [];
      return types.includes('Event');
    });

    if (events.length === 0) {
      console.log('No Event resources. Run skills/extract-events/script.ts first.');
      closeInteractive();
      return;
    }

    console.log(`Found ${events.length} Event resource(s).`);

    // Parse each Event
    const records: EventRecord[] = [];
    for (const e of events) {
      const body = ((e as any).body ?? (e as any).text ?? '').toString();
      const fields = parseEventBody(body);
      if (!fields.date) continue;
      records.push({
        resourceId: e['@id'],
        date: fields.date,
        subsystem: fields.subsystem,
        vendor: fields.vendor,
        kind: fields.kind,
        raw: e,
      });
    }

    // Group by (subsystem || 'unspecified', vendor || 'unspecified', kind || 'service')
    const groups = new Map<string, EventRecord[]>();
    for (const r of records) {
      const key = `${r.subsystem ?? 'unspecified-system'} | ${r.vendor ?? 'unspecified-vendor'} | ${r.kind ?? 'service'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    console.log(`Grouped into ${groups.size} potential schedule(s) (min ${MIN_OCCURRENCES} occurrences to count).`);
    const proceed = await confirm('Proceed?', true);
    if (!proceed) {
      closeInteractive();
      return;
    }

    let schedules = 0;
    let overdue = 0;

    for (const [groupKey, gEvents] of groups) {
      if (gEvents.length < MIN_OCCURRENCES) continue;

      const sorted = [...gEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        const prev = sorted[i - 1];
        if (!curr || !prev) continue;
        const days = (curr.date.getTime() - prev.date.getTime()) / 86400000;
        intervals.push(days);
      }
      const med = median(intervals);
      const cv = coefficientOfVariation(intervals);
      const cadence = cv > IRREGULAR_TOLERANCE ? 'irregular' : classifyCadence(med);

      const lastEvent = sorted[sorted.length - 1];
      if (!lastEvent) continue;
      const last = lastEvent.date;
      const projectedNext = new Date(last.getTime() + med * 86400000);
      const today = new Date();
      const isOverdue = projectedNext.getTime() < today.getTime();
      if (isOverdue) overdue++;

      const eventLinks = sorted.map((e) => `- [${e.date.toISOString().slice(0, 10)}](${e.resourceId})`).join('\n');

      const body =
        `# Service Schedule\n\n*${groupKey}*\n\n` +
        `## Inferred cadence\n\n` +
        `- Cadence: **${cadence}**\n` +
        `- Median interval: ${med.toFixed(0)} days\n` +
        `- Coefficient of variation: ${cv.toFixed(2)}${cv > IRREGULAR_TOLERANCE ? ' (high — schedule is irregular)' : ''}\n` +
        `- Number of occurrences: ${sorted.length}\n\n` +
        `## Last and next\n\n` +
        `- Last occurrence: ${last.toISOString().slice(0, 10)}\n` +
        `- Projected next: ${projectedNext.toISOString().slice(0, 10)}${isOverdue ? ' **OVERDUE**' : ''}\n\n` +
        `## Event history\n\n${eventLinks}\n`;

      const yieldResult = await semiont.yield.resource({
        name: `Schedule: ${groupKey}`,
        file: Buffer.from(body, 'utf-8'),
        format: 'text/markdown',
        entityTypes: ['ServiceSchedule', 'Aggregate'],
        storageUri: `file://generated/schedule-${groupKey.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`,
      });
      schedules++;
      console.log(`  + ${yieldResult.resourceId}: ${groupKey} — ${cadence} (${sorted.length} events, ${isOverdue ? 'OVERDUE' : 'on track'})`);
    }

    console.log(`\nDone. Synthesized ${schedules} ServiceSchedule resources; ${overdue} overdue.`);
    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
