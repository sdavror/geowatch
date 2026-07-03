// The MapLibre demotiles basemap keys each country feature on its alpha-3
// ISO code (the `ADM0_A3` property), whereas our DB uses alpha-2 codes as
// Country.id. This map converts our alpha-2 ids to the alpha-3 codes the
// basemap expects, so we can build a `match` fill expression against
// ADM0_A3. Covers the same countries as isoNumericMap.ts (the react-simple-
// maps path); both files must stay in sync as seeded countries change.
export const ALPHA2_TO_ALPHA3: Record<string, string> = {
  UA: 'UKR', // Ukraine
  RU: 'RUS', // Russia
  PS: 'PSE', // Palestine
  SD: 'SDN', // Sudan
  MM: 'MMR', // Myanmar
  YE: 'YEM', // Yemen
  TR: 'TUR', // Turkey / Türkiye
  AR: 'ARG', // Argentina
  EG: 'EGY', // Egypt
  PK: 'PAK', // Pakistan
  VE: 'VEN', // Venezuela
  ET: 'ETH', // Ethiopia
  VN: 'VNM', // Vietnam
  MX: 'MEX', // Mexico
  IN: 'IND', // India
  CN: 'CHN', // China
  BR: 'BRA', // Brazil
  US: 'USA', // United States
  DE: 'DEU', // Germany
  JP: 'JPN', // Japan

  // Europe + Caucasus
  AL: 'ALB', // Albania
  AD: 'AND', // Andorra
  AT: 'AUT', // Austria
  BY: 'BLR', // Belarus
  BE: 'BEL', // Belgium
  BA: 'BIH', // Bosnia and Herzegovina
  BG: 'BGR', // Bulgaria
  HR: 'HRV', // Croatia
  CY: 'CYP', // Cyprus
  CZ: 'CZE', // Czechia
  DK: 'DNK', // Denmark
  EE: 'EST', // Estonia
  FI: 'FIN', // Finland
  FR: 'FRA', // France
  GE: 'GEO', // Georgia
  GR: 'GRC', // Greece
  HU: 'HUN', // Hungary
  IS: 'ISL', // Iceland
  IE: 'IRL', // Ireland
  IT: 'ITA', // Italy
  LV: 'LVA', // Latvia
  LI: 'LIE', // Liechtenstein
  LT: 'LTU', // Lithuania
  LU: 'LUX', // Luxembourg
  MT: 'MLT', // Malta
  MD: 'MDA', // Moldova
  MC: 'MCO', // Monaco
  ME: 'MNE', // Montenegro
  NL: 'NLD', // Netherlands
  MK: 'MKD', // North Macedonia
  NO: 'NOR', // Norway
  PL: 'POL', // Poland
  PT: 'PRT', // Portugal
  RO: 'ROU', // Romania
  SM: 'SMR', // San Marino
  RS: 'SRB', // Serbia
  SK: 'SVK', // Slovakia
  SI: 'SVN', // Slovenia
  ES: 'ESP', // Spain
  SE: 'SWE', // Sweden
  CH: 'CHE', // Switzerland
  GB: 'GBR', // United Kingdom
  AM: 'ARM', // Armenia
  AZ: 'AZE', // Azerbaijan
};
