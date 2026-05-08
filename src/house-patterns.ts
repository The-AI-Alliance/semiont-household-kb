/**
 * Pattern-based pre-filters for home-property entities.
 *
 * Surfaces candidate spans for `mark.assist` to confirm or reject. Generic
 * across any home-property corpus — no specific vendor names, addresses,
 * or model numbers are referenced.
 */

/** Dollar-amount patterns. */
const DOLLAR_RE = /\$\s?[\d,]+(?:\.\d{2})?/g;

/** Date patterns: mostly US-format (M/D/Y, Mon D YYYY, YYYY-MM-DD). */
const DATE_RE =
  /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;

/** Model-number patterns (heuristic). */
const MODEL_NUMBER_RE = /\b(?:Model|Mod|Mdl|S\/N|SN|Serial)[:\s]?[A-Z0-9-]{4,}\b/gi;

/** Subsystem reference patterns. */
const SUBSYSTEM_RE =
  /\b(?:HVAC|furnace|boiler|air[\s-]?conditioning|AC unit|heat pump|water heater|sump pump|septic system|plumbing|electrical panel|breaker|circuit|roof|gutters?|chimney|foundation|basement|attic|insulation|smoke detector|alarm system|security system|sprinkler|irrigation|water softener|dehumidifier|humidifier|range hood|garbage disposal|water main|gas line|driveway|deck|fence)\b/gi;

/** Room reference patterns. */
const ROOM_RE =
  /\b(?:kitchen|master bath(?:room)?|main bath(?:room)?|guest bath(?:room)?|powder room|master (?:bed)?room|guest (?:bed)?room|kid(?:'s)? (?:bed)?room|nursery|family room|living room|dining room|den|study|office|laundry room|mudroom|garage|basement|attic|foyer|sunroom|porch|patio|deck|yard|backyard|front yard|driveway)\b/gi;

/** Service / vendor-type patterns. */
const SERVICE_TYPE_RE =
  /\b(?:plumber|electrician|HVAC tech(?:nician)?|roofer|exterminator|pest control|lawn (?:care|service)|landscaper|tree (?:service|trimmer)|painter|cleaner|maid service|gutter cleaning|chimney sweep|window washer|insulation contractor|appliance repair|locksmith|handyman|general contractor|inspector|appraiser|moving company)\b/gi;

/** Recurring-cadence keywords. */
const CADENCE_RE =
  /\b(?:monthly|every month|quarterly|every quarter|every \d+ months?|biannual(?:ly)?|every six months?|annual(?:ly)?|every year|every spring|every fall|every summer|every winter|seasonally|biweekly|every two weeks)\b/gi;

export type HitKind =
  | 'dollar'
  | 'date'
  | 'model'
  | 'subsystem'
  | 'room'
  | 'service-type'
  | 'cadence';

export interface PatternHit {
  kind: HitKind;
  text: string;
  start: number;
  end: number;
}

export function findPatterns(text: string): PatternHit[] {
  const hits: PatternHit[] = [];
  const push = (kind: HitKind, re: RegExp): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ kind, text: m[0], start: m.index, end: m.index + m[0].length });
    }
  };
  push('dollar', DOLLAR_RE);
  push('date', DATE_RE);
  push('model', MODEL_NUMBER_RE);
  push('subsystem', SUBSYSTEM_RE);
  push('room', ROOM_RE);
  push('service-type', SERVICE_TYPE_RE);
  push('cadence', CADENCE_RE);
  return hits.sort((a, b) => a.start - b.start);
}

export function summarizeHits(hits: PatternHit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const h of hits) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
  return counts;
}
