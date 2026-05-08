/**
 * Corpus file discovery and ingest input preparation.
 *
 * Walks the repo's top-level subdirectories and produces CorpusFile records
 * ready for `yield.resource`. Subdirectory names are convenient organization
 * (e.g., `hvac/`, `plumbing/`, `pest-control/`) but classification is
 * filename-driven so the skills work on any home-property corpus regardless
 * of how it's organized.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export type CorpusFileSource = 'document' | 'curated-context' | 'other';

export interface CorpusFile {
  path: string;
  name: string;
  format: string;
  entityTypes: string[];
  storageUri: string;
  source: CorpusFileSource;
  subdir: string;
}

const FORMAT_BY_EXT: Record<string, string> = {
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

const SKIP_FILENAMES = new Set([
  'README.md',
  'readme.md',
  'README',
  '.DS_Store',
  'LICENSE',
  'AGENTS.md',
]);

const SKIP_DIRS = new Set([
  '.git',
  '.github',
  '.devcontainer',
  '.semiont',
  '.plans',
  '.cache',
  'src',
  'skills',
  'node_modules',
  'tests',
  'docs',
]);

const CURATED_SUBDIRS = new Set(['context', 'curated', 'generated']);

function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base.replace(/^\d+[_-]/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pick entity types based on filename + parent-directory substrings common
 * to homeowner records. Conservative: every file gets at least one entity
 * type. Subsequent skills will canonicalize Subsystem / Vendor mentions
 * regardless of these coarse labels.
 */
function entityTypesForFile(filename: string, subdir: string): string[] {
  const lc = filename.toLowerCase();
  const sd = subdir.toLowerCase();
  const both = `${sd}/${lc}`;

  // Document-type heuristics from filename
  if (/receipt|invoice/.test(lc)) return ['Receipt'];
  if (/email|message|text/.test(lc)) return ['Email'];
  if (/manual|spec(?:s|ification)?/.test(lc)) return ['ManualExcerpt'];
  if (/inspection|appraisal|assessment[\s_-]?report/.test(lc)) return ['InspectionReport'];
  if (/warranty/.test(lc)) return ['WarrantyNotice'];
  if (/mortgage|escrow|principal|loan[\s_-]?statement/.test(lc)) return ['MortgageStatement'];
  if (/insurance[\s_-]?(policy|declaration|renewal)/.test(lc)) return ['InsurancePolicy'];
  if (/property[\s_-]?tax|assessment[\s_-]?notice/.test(lc)) return ['PropertyTaxBill'];
  if (/hoa|home[\s_-]?owner.*assoc/.test(both)) return ['HOANotice'];
  if (/neighborhood|listserv|nextdoor/.test(both)) return ['NeighborhoodNotice'];
  if (/utility[\s_-]?bill|electric[\s_-]?bill|gas[\s_-]?bill|water[\s_-]?bill|internet[\s_-]?bill/.test(both)) {
    return ['Receipt', 'Utility'];
  }
  if (/permit|code[\s_-]?compliance/.test(lc)) return ['HouseholdDocument'];

  // Subsystem-by-subdir hints — even when filename is generic
  if (/hvac|furnace|air[\s_-]?conditioning/.test(sd)) return ['HouseholdDocument'];
  if (/plumbing/.test(sd)) return ['HouseholdDocument'];
  if (/electrical/.test(sd)) return ['HouseholdDocument'];
  if (/roof/.test(sd)) return ['HouseholdDocument'];
  if (/pest|exterminat/.test(sd)) return ['HouseholdDocument'];
  if (/landscape|yard|lawn/.test(sd)) return ['HouseholdDocument'];

  return ['HouseholdDocument'];
}

export function discoverCorpus(repoRoot: string = process.cwd()): CorpusFile[] {
  const out: CorpusFile[] = [];

  for (const subdir of readdirSync(repoRoot)) {
    if (subdir.startsWith('.') && !CURATED_SUBDIRS.has(subdir)) continue;
    if (SKIP_DIRS.has(subdir)) continue;
    const subdirPath = join(repoRoot, subdir);
    if (!existsSync(subdirPath) || !statSync(subdirPath).isDirectory()) continue;

    walkSubdir(subdir, subdirPath, repoRoot, out);
  }

  return out;
}

function walkSubdir(subdir: string, dirPath: string, repoRoot: string, out: CorpusFile[]): void {
  const isCurated = CURATED_SUBDIRS.has(subdir);

  for (const entry of readdirSync(dirPath)) {
    if (SKIP_FILENAMES.has(entry)) continue;
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      walkSubdir(subdir, entryPath, repoRoot, out);
      continue;
    }
    if (!stat.isFile()) continue;

    const ext = extname(entry).toLowerCase();
    const format = FORMAT_BY_EXT[ext];
    if (!format) continue;

    const relPath = relative(repoRoot, entryPath);
    const baseTypes = entityTypesForFile(entry, subdir);
    const entityTypes = isCurated ? ['HouseholdContext', 'Curated', ...baseTypes] : baseTypes;

    out.push({
      path: relPath,
      name: nameFromFilename(entry),
      format,
      entityTypes,
      storageUri: `file://${relPath}`,
      source: isCurated ? 'curated-context' : 'document',
      subdir,
    });
  }
}

export function readForUpload(file: CorpusFile, repoRoot: string = process.cwd()): Buffer {
  return readFileSync(join(repoRoot, file.path));
}
