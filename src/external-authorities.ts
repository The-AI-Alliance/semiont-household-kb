/**
 * Adapter stubs for home-property external-authority lookups.
 *
 * External authorities live as a peer layer to in-corpus canonical nodes:
 * - Manufacturer manuals (per-appliance / per-equipment lookups)
 * - ASHRAE schedules (HVAC inspection cadence)
 * - NFPA standards (electrical / fire safety)
 * - NRCA standards (roofing-system inspection cadence)
 * - USDA hardiness zones (for landscape / yard skills)
 * - Municipal building-code search
 *
 * For demonstration purposes the lookups are URL-construction only (no live
 * API calls). A production deployment would replace stubs with actual
 * manufacturer-API or building-code lookups where available.
 */

export type Authority =
  | 'ManufacturerManual'
  | 'ASHRAE'
  | 'NFPA'
  | 'NRCA'
  | 'USDAZone'
  | 'BuildingCode'
  | 'HOA';

export interface ExternalReference {
  authority: Authority;
  identifier: string;
  url: string;
  label: string;
}

/** Manufacturer-manual stub: Google search constrained to manualslib.com plus the manufacturer site. */
export function lookupManufacturerStub(manufacturer: string, model?: string): ExternalReference {
  const query = model ? `${manufacturer} ${model} manual` : `${manufacturer} manual`;
  return {
    authority: 'ManufacturerManual',
    identifier: model ? `${manufacturer}/${model}` : manufacturer,
    url: `https://www.manualslib.com/search/?qs=${encodeURIComponent(query)}`,
    label: `Manual: ${query}`,
  };
}

export function lookupAshraeStub(topic: string): ExternalReference {
  return {
    authority: 'ASHRAE',
    identifier: topic,
    url: `https://www.ashrae.org/search-results?searchtext=${encodeURIComponent(topic)}`,
    label: `ASHRAE: ${topic}`,
  };
}

export function lookupNfpaStub(topic: string): ExternalReference {
  return {
    authority: 'NFPA',
    identifier: topic,
    url: `https://www.nfpa.org/codes-and-standards/all-codes-and-standards/list-of-codes-and-standards?query=${encodeURIComponent(topic)}`,
    label: `NFPA: ${topic}`,
  };
}

export function lookupNrcaStub(topic: string): ExternalReference {
  return {
    authority: 'NRCA',
    identifier: topic,
    url: `https://www.nrca.net/Search?searchTerm=${encodeURIComponent(topic)}`,
    label: `NRCA: ${topic}`,
  };
}

export function lookupUsdaZoneStub(zipOrPlace: string): ExternalReference {
  return {
    authority: 'USDAZone',
    identifier: zipOrPlace,
    url: `https://planthardiness.ars.usda.gov/?zipcode=${encodeURIComponent(zipOrPlace)}`,
    label: `USDA Hardiness Zone: ${zipOrPlace}`,
  };
}

export function lookupBuildingCodeStub(jurisdiction: string, topic: string): ExternalReference {
  return {
    authority: 'BuildingCode',
    identifier: `${jurisdiction}/${topic}`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${jurisdiction} building code ${topic}`)}`,
    label: `Building code (${jurisdiction}): ${topic}`,
  };
}

export function formatReference(ref: ExternalReference): string {
  return `- [${ref.label}](${ref.url})`;
}

export function formatReferenceSection(refs: ExternalReference[]): string {
  if (refs.length === 0) return '';
  return `## External References\n\n${refs.map(formatReference).join('\n')}\n`;
}
