/**
 * Industry-typical lifespan ranges for common house subsystems and appliances.
 *
 * Used by `prioritize-house-systems` when no manufacturer-specific lifespan
 * is available in the corpus's External References. Intentionally
 * conservative — many systems exceed these ranges with proper maintenance.
 *
 * Sources for the canonical ranges (cited at deployment time, not API-fetched):
 * - HVAC: ASHRAE service-life data
 * - Roofing: NRCA standard service-life
 * - Plumbing fixtures: International Association of Plumbing & Mechanical Officials
 * - Electrical: NFPA service-life guidance
 * - Appliances: NAR Remodeling Impact Report aggregates
 *
 * Generic across any home — no specific manufacturer or model is referenced.
 */

export interface LifespanRange {
  /** Minimum typical years before replacement. */
  minYears: number;
  /** Maximum typical years before replacement. */
  maxYears: number;
  /** Free-text caveats — environment dependence, climate, usage. */
  caveats?: string;
}

export const LIFESPAN_DEFAULTS: Record<string, LifespanRange> = {
  // HVAC
  'furnace': { minYears: 15, maxYears: 25 },
  'boiler': { minYears: 25, maxYears: 35 },
  'central-air-conditioner': { minYears: 12, maxYears: 17 },
  'heat-pump': { minYears: 10, maxYears: 15 },
  'mini-split': { minYears: 12, maxYears: 18 },

  // Water heating
  'water-heater-tank': {
    minYears: 8,
    maxYears: 12,
    caveats: 'Hard water and high incoming temperatures shorten lifespan.',
  },
  'water-heater-tankless': { minYears: 18, maxYears: 22 },

  // Roofing (composition by material — pick the right one based on roof material)
  'roof-asphalt-shingle-3tab': { minYears: 15, maxYears: 20 },
  'roof-asphalt-shingle-architectural': { minYears: 25, maxYears: 30 },
  'roof-metal': { minYears: 40, maxYears: 70 },
  'roof-tile': { minYears: 50, maxYears: 100 },

  // Plumbing
  'water-main-pvc': { minYears: 50, maxYears: 100 },
  'water-main-copper': { minYears: 50, maxYears: 75 },
  'water-main-galvanized': {
    minYears: 40,
    maxYears: 50,
    caveats: 'Galvanized is at end-of-life on any home built before ~1970.',
  },

  // Electrical
  'electrical-panel': { minYears: 25, maxYears: 60, caveats: 'Replace if FPE, Zinsco, or aluminum-branch wiring.' },
  'aluminum-wiring': { minYears: 40, maxYears: 50, caveats: 'Active fire risk; many insurers will not write a policy without remediation.' },

  // Appliances
  'dishwasher': { minYears: 9, maxYears: 12 },
  'washer': { minYears: 10, maxYears: 13 },
  'dryer': { minYears: 13, maxYears: 15 },
  'refrigerator': { minYears: 13, maxYears: 17 },
  'range-oven': { minYears: 13, maxYears: 17 },
  'microwave': { minYears: 9, maxYears: 11 },
  'garbage-disposal': { minYears: 10, maxYears: 12 },

  // Outdoor / specialty
  'sump-pump': { minYears: 7, maxYears: 10 },
  'water-softener': { minYears: 12, maxYears: 20 },
  'septic-tank-concrete': { minYears: 30, maxYears: 50 },
  'driveway-asphalt': { minYears: 15, maxYears: 25 },
  'driveway-concrete': { minYears: 30, maxYears: 50 },
  'deck-pressure-treated': { minYears: 15, maxYears: 25 },
  'fence-wood': { minYears: 10, maxYears: 15 },

  // Networking / smart-home
  'router-consumer': { minYears: 4, maxYears: 6 },
  'security-system': { minYears: 8, maxYears: 12 },
};

/** Look up a lifespan range by canonical type key, returning a fallback for unknowns. */
export function lookupLifespan(key: string): LifespanRange {
  return LIFESPAN_DEFAULTS[key] ?? { minYears: 10, maxYears: 20, caveats: 'Generic fallback — substitute manufacturer-specific data when available.' };
}

/** Compute years-since-installed and the ratio against the typical max lifespan. */
export function lifespanStatus(installedYear: number, key: string, currentYear: number = new Date().getFullYear()): {
  ageYears: number;
  range: LifespanRange;
  ratio: number;
  flag: 'within' | 'approaching-end' | 'past-end';
} {
  const range = lookupLifespan(key);
  const age = currentYear - installedYear;
  const ratio = age / range.maxYears;
  let flag: 'within' | 'approaching-end' | 'past-end';
  if (ratio >= 1) flag = 'past-end';
  else if (ratio >= 0.85) flag = 'approaching-end';
  else flag = 'within';
  return { ageYears: age, range, ratio, flag };
}
