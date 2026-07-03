// visionscarto-world-atlas's 110m.json (used as our map geometry) identifies
// each country by its ISO 3166-1 numeric code in the topojson `id` field.
// This map converts those numeric IDs to our DB's alpha-2 codes for matching.
//
// Source: https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@1/world/110m.json
// This dataset reflects UN-recognised international borders (Crimea = Ukraine,
// Western Sahara per UN position), unlike the upstream world-atlas which uses
// de-facto control boundaries. All numeric codes verified against ISO 3166-1.
// Covers only the 20 countries currently seeded.
export const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '804': 'UA', // Ukraine
  '643': 'RU', // Russia
  '275': 'PS', // Palestine
  '729': 'SD', // Sudan (numeric code changed from 736 after South Sudan split in 2011)
  '104': 'MM', // Myanmar (numeric code unchanged since the 1989 Burma rename)
  '887': 'YE', // Yemen
  '792': 'TR', // Turkey / Türkiye
  '32': 'AR', // Argentina
  '818': 'EG', // Egypt
  '586': 'PK', // Pakistan
  '862': 'VE', // Venezuela
  '231': 'ET', // Ethiopia
  '704': 'VN', // Vietnam
  '484': 'MX', // Mexico
  '356': 'IN', // India
  '156': 'CN', // China
  '76': 'BR', // Brazil
  '840': 'US', // United States
  '276': 'DE', // Germany
  '392': 'JP', // Japan

  // Europe + Caucasus (added alongside EUROPE_COUNTRIES in seed.ts)
  '8': 'AL', // Albania
  '20': 'AD', // Andorra
  '40': 'AT', // Austria
  '112': 'BY', // Belarus
  '56': 'BE', // Belgium
  '70': 'BA', // Bosnia and Herzegovina
  '100': 'BG', // Bulgaria
  '191': 'HR', // Croatia
  '196': 'CY', // Cyprus
  '203': 'CZ', // Czechia
  '208': 'DK', // Denmark
  '233': 'EE', // Estonia
  '246': 'FI', // Finland
  '250': 'FR', // France
  '268': 'GE', // Georgia
  '300': 'GR', // Greece
  '348': 'HU', // Hungary
  '352': 'IS', // Iceland
  '372': 'IE', // Ireland
  '380': 'IT', // Italy
  '428': 'LV', // Latvia
  '438': 'LI', // Liechtenstein
  '440': 'LT', // Lithuania
  '442': 'LU', // Luxembourg
  '470': 'MT', // Malta
  '498': 'MD', // Moldova
  '492': 'MC', // Monaco
  '499': 'ME', // Montenegro
  '528': 'NL', // Netherlands
  '807': 'MK', // North Macedonia
  '578': 'NO', // Norway
  '616': 'PL', // Poland
  '620': 'PT', // Portugal
  '642': 'RO', // Romania
  '674': 'SM', // San Marino
  '688': 'RS', // Serbia
  '703': 'SK', // Slovakia
  '705': 'SI', // Slovenia
  '724': 'ES', // Spain
  '752': 'SE', // Sweden
  '756': 'CH', // Switzerland
  '826': 'GB', // United Kingdom
  '51': 'AM', // Armenia
  '31': 'AZ', // Azerbaijan
};
