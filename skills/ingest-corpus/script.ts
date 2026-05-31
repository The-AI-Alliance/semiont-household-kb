/**
 * ingest-corpus — walk the repo, create one resource per home-property file.
 *
 * Usage: tsx skills/ingest-corpus/script.ts [--interactive]
 */

import { SemiontSession, InMemorySessionStorage, type KnowledgeBase } from '@semiont/sdk';
import { discoverCorpus, readForUpload } from '../../src/files.js';
import { confirm, close as closeInteractive } from '../../src/interactive.js';

/**
 * The full entity-type vocabulary this KB uses across all eleven skills.
 * Declared via `frame.addEntityTypes` once on each ingest run — idempotent.
 */
const KB_ENTITY_TYPES = [
  // Document types from src/files.ts filename heuristics
  'Receipt',
  'Invoice',
  'Email',
  'ManualExcerpt',
  'InspectionReport',
  'WarrantyNotice',
  'MortgageStatement',
  'InsurancePolicy',
  'PropertyTaxBill',
  'HOANotice',
  'NeighborhoodNotice',
  'HouseholdDocument',
  // Curated-context markers
  'HouseholdContext',
  'Curated',
  // mark-house-entities entity types
  'Person',
  'HouseholdMember',
  'Vendor',
  'ServiceProvider',
  'Room',
  'Yard',
  'Garage',
  'Basement',
  'Attic',
  'Subsystem',
  'HVAC',
  'Plumbing',
  'Electrical',
  'RoofingSystem',
  'Foundation',
  'Networking',
  'Security',
  'Entertainment',
  'Appliance',
  'WaterHeater',
  'Pump',
  'Filter',
  'Service',
  'RecurringService',
  'EpisodicService',
  'Utility',
  'PestControl',
  'LawnCare',
  'Cleaning',
  'Address',
  'Date',
  'MonetaryValue',
  // External-authority shadow types
  'ManufacturerManual',
  'ASHRAE_Schedule',
  'NFPA_Standard',
  'NRCA_Standard',
  'USDAZone',
  'BuildingCode',
  // Synthesized aggregates
  'Event',
  'ServiceSchedule',
  'MaintenanceAssessment',
  'SystemPriorities',
  'VendorTrackRecord',
  'Aggregate',
];

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const files = discoverCorpus(repoRoot);

  console.log(`Discovered ${files.length} corpus files:`);
  const bySubdir: Record<string, number> = {};
  const byFormat: Record<string, number> = {};
  for (const f of files) {
    bySubdir[f.subdir] = (bySubdir[f.subdir] ?? 0) + 1;
    byFormat[f.format] = (byFormat[f.format] ?? 0) + 1;
  }
  console.log('  by subdirectory:');
  for (const [subdir, n] of Object.entries(bySubdir).sort()) {
    console.log(`    ${subdir}: ${n}`);
  }
  console.log('  by format:');
  for (const [fmt, n] of Object.entries(byFormat).sort()) {
    console.log(`    ${fmt}: ${n}`);
  }
  console.log();

  if (files.length === 0) {
    console.log('No ingestable files found. Exiting.');
    closeInteractive();
    return;
  }

  const proceed = await confirm(
    `About to create ${files.length} resources via yield.resource. Proceed?`,
    true,
  );
  if (!proceed) {
    closeInteractive();
    return;
  }

  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'household-ingest-corpus',
    label: 'household ingest-corpus',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  try {
    console.log(`Declaring ${KB_ENTITY_TYPES.length} entity types via frame...`);
    await semiont.frame.addEntityTypes(KB_ENTITY_TYPES);

    let created = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const buffer = readForUpload(file, repoRoot);
        const { resourceId } = await semiont.yield.resource({
          name: file.name,
          file: buffer,
          format: file.format,
          entityTypes: file.entityTypes,
          storageUri: file.storageUri,
        });
        created++;
        console.log(`  + ${file.path} → ${resourceId} [${file.entityTypes.join(', ')}]`);
      } catch (e) {
        failed++;
        console.warn(`  ! ${file.path} failed: ${(e as Error).message}`);
      }
    }

    console.log(`\nDone. ${created} resources created, ${failed} failed.`);
    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
