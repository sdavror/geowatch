// visionscarto-world-atlas's 110m.json (used as our map geometry) identifies
// each country by its ISO 3166-1 numeric code in the topojson `id` field.
// This map converts those numeric IDs to our DB's alpha-2 codes for matching.
//
// Source: https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@1/world/110m.json
// This dataset reflects UN-recognised international borders (Crimea = Ukraine,
// Western Sahara per UN position), unlike the upstream world-atlas which uses
// de-facto control boundaries. All numeric codes verified against ISO 3166-1.
// Covers all countries currently seeded (20 tracked + Europe/Caucasus,
// Africa, Middle East, Asia, Americas, Oceania).
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

  // Africa
  '12': 'DZ', // Algeria
  '24': 'AO', // Angola
  '204': 'BJ', // Benin
  '72': 'BW', // Botswana
  '854': 'BF', // Burkina Faso
  '108': 'BI', // Burundi
  '132': 'CV', // Cabo Verde
  '120': 'CM', // Cameroon
  '140': 'CF', // Central African Republic
  '148': 'TD', // Chad
  '174': 'KM', // Comoros
  '178': 'CG', // Congo
  '180': 'CD', // DR Congo
  '262': 'DJ', // Djibouti
  '226': 'GQ', // Equatorial Guinea
  '232': 'ER', // Eritrea
  '748': 'SZ', // Eswatini
  '266': 'GA', // Gabon
  '270': 'GM', // Gambia
  '288': 'GH', // Ghana
  '324': 'GN', // Guinea
  '624': 'GW', // Guinea-Bissau
  '384': 'CI', // Côte d'Ivoire
  '404': 'KE', // Kenya
  '426': 'LS', // Lesotho
  '430': 'LR', // Liberia
  '434': 'LY', // Libya
  '450': 'MG', // Madagascar
  '454': 'MW', // Malawi
  '466': 'ML', // Mali
  '478': 'MR', // Mauritania
  '480': 'MU', // Mauritius
  '504': 'MA', // Morocco
  '508': 'MZ', // Mozambique
  '516': 'NA', // Namibia
  '562': 'NE', // Niger
  '566': 'NG', // Nigeria
  '646': 'RW', // Rwanda
  '678': 'ST', // Sao Tome and Principe
  '686': 'SN', // Senegal
  '690': 'SC', // Seychelles
  '694': 'SL', // Sierra Leone
  '706': 'SO', // Somalia
  '710': 'ZA', // South Africa
  '728': 'SS', // South Sudan
  '834': 'TZ', // Tanzania
  '768': 'TG', // Togo
  '788': 'TN', // Tunisia
  '800': 'UG', // Uganda
  '894': 'ZM', // Zambia
  '716': 'ZW', // Zimbabwe

  // Middle East
  '682': 'SA', // Saudi Arabia
  '364': 'IR', // Iran
  '368': 'IQ', // Iraq
  '376': 'IL', // Israel
  '400': 'JO', // Jordan
  '422': 'LB', // Lebanon
  '760': 'SY', // Syria
  '784': 'AE', // United Arab Emirates
  '634': 'QA', // Qatar
  '414': 'KW', // Kuwait
  '48': 'BH', // Bahrain
  '512': 'OM', // Oman

  // Asia (South / Southeast / East / Central)
  '4': 'AF', // Afghanistan
  '50': 'BD', // Bangladesh
  '64': 'BT', // Bhutan
  '96': 'BN', // Brunei
  '116': 'KH', // Cambodia
  '626': 'TL', // Timor-Leste
  '360': 'ID', // Indonesia
  '398': 'KZ', // Kazakhstan
  '417': 'KG', // Kyrgyzstan
  '418': 'LA', // Laos
  '458': 'MY', // Malaysia
  '462': 'MV', // Maldives
  '496': 'MN', // Mongolia
  '524': 'NP', // Nepal
  '408': 'KP', // North Korea
  '608': 'PH', // Philippines
  '702': 'SG', // Singapore
  '410': 'KR', // South Korea
  '144': 'LK', // Sri Lanka
  '158': 'TW', // Taiwan
  '762': 'TJ', // Tajikistan
  '764': 'TH', // Thailand
  '795': 'TM', // Turkmenistan
  '860': 'UZ', // Uzbekistan

  // Americas
  '124': 'CA', // Canada
  '28': 'AG', // Antigua and Barbuda
  '44': 'BS', // Bahamas
  '52': 'BB', // Barbados
  '84': 'BZ', // Belize
  '68': 'BO', // Bolivia
  '152': 'CL', // Chile
  '170': 'CO', // Colombia
  '188': 'CR', // Costa Rica
  '192': 'CU', // Cuba
  '212': 'DM', // Dominica
  '214': 'DO', // Dominican Republic
  '218': 'EC', // Ecuador
  '222': 'SV', // El Salvador
  '308': 'GD', // Grenada
  '320': 'GT', // Guatemala
  '328': 'GY', // Guyana
  '332': 'HT', // Haiti
  '340': 'HN', // Honduras
  '388': 'JM', // Jamaica
  '558': 'NI', // Nicaragua
  '591': 'PA', // Panama
  '600': 'PY', // Paraguay
  '604': 'PE', // Peru
  '659': 'KN', // Saint Kitts and Nevis
  '662': 'LC', // Saint Lucia
  '670': 'VC', // Saint Vincent and the Grenadines
  '740': 'SR', // Suriname
  '780': 'TT', // Trinidad and Tobago
  '858': 'UY', // Uruguay

  // Oceania
  '36': 'AU', // Australia
  '242': 'FJ', // Fiji
  '296': 'KI', // Kiribati
  '584': 'MH', // Marshall Islands
  '583': 'FM', // Micronesia
  '520': 'NR', // Nauru
  '554': 'NZ', // New Zealand
  '585': 'PW', // Palau
  '598': 'PG', // Papua New Guinea
  '882': 'WS', // Samoa
  '90': 'SB', // Solomon Islands
  '776': 'TO', // Tonga
  '798': 'TV', // Tuvalu
  '548': 'VU', // Vanuatu
};
