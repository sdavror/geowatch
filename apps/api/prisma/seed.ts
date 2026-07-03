import { PrismaClient, CountryStatus, EventCategory } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedCountry {
  id: string;
  name: string;
  flagEmoji: string;
  region: string;
  capital: string;
  population: bigint;
  gdpUsd: bigint;
  latitude: number;
  longitude: number;
  status: CountryStatus;
  riskScore: number;
}

const COUNTRIES: SeedCountry[] = [
  { id: 'UA', name: 'Ukraine', flagEmoji: '🇺🇦', region: 'Eastern Europe', capital: 'Kyiv', population: 36_700_000n, gdpUsd: 178_000_000_000n, latitude: 49.0, longitude: 31.0, status: 'conflict', riskScore: 9.2 },
  { id: 'RU', name: 'Russia', flagEmoji: '🇷🇺', region: 'Eastern Europe', capital: 'Moscow', population: 144_000_000n, gdpUsd: 2_021_000_000_000n, latitude: 60.0, longitude: 90.0, status: 'conflict', riskScore: 8.5 },
  { id: 'PS', name: 'Palestine', flagEmoji: '🇵🇸', region: 'Middle East', capital: 'Ramallah', population: 5_400_000n, gdpUsd: 17_000_000_000n, latitude: 31.9, longitude: 35.2, status: 'conflict', riskScore: 9.8 },
  { id: 'SD', name: 'Sudan', flagEmoji: '🇸🇩', region: 'Africa', capital: 'Khartoum', population: 46_900_000n, gdpUsd: 51_000_000_000n, latitude: 15.0, longitude: 30.0, status: 'conflict', riskScore: 9.1 },
  { id: 'MM', name: 'Myanmar', flagEmoji: '🇲🇲', region: 'Southeast Asia', capital: 'Naypyidaw', population: 54_800_000n, gdpUsd: 65_000_000_000n, latitude: 18.0, longitude: 96.0, status: 'conflict', riskScore: 8.3 },
  { id: 'YE', name: 'Yemen', flagEmoji: '🇾🇪', region: 'Middle East', capital: "Sana'a", population: 33_700_000n, gdpUsd: 21_000_000_000n, latitude: 15.0, longitude: 48.0, status: 'conflict', riskScore: 8.7 },
  { id: 'TR', name: 'Turkey', flagEmoji: '🇹🇷', region: 'Middle East/Europe', capital: 'Ankara', population: 85_300_000n, gdpUsd: 906_000_000_000n, latitude: 39.0, longitude: 35.0, status: 'crisis', riskScore: 6.8 },
  { id: 'AR', name: 'Argentina', flagEmoji: '🇦🇷', region: 'South America', capital: 'Buenos Aires', population: 45_800_000n, gdpUsd: 631_000_000_000n, latitude: -34.0, longitude: -64.0, status: 'crisis', riskScore: 7.2 },
  { id: 'EG', name: 'Egypt', flagEmoji: '🇪🇬', region: 'North Africa', capital: 'Cairo', population: 112_700_000n, gdpUsd: 387_000_000_000n, latitude: 27.0, longitude: 30.0, status: 'crisis', riskScore: 6.5 },
  { id: 'PK', name: 'Pakistan', flagEmoji: '🇵🇰', region: 'South Asia', capital: 'Islamabad', population: 240_500_000n, gdpUsd: 374_000_000_000n, latitude: 30.0, longitude: 69.0, status: 'crisis', riskScore: 7.4 },
  { id: 'VE', name: 'Venezuela', flagEmoji: '🇻🇪', region: 'South America', capital: 'Caracas', population: 28_300_000n, gdpUsd: 92_000_000_000n, latitude: 8.0, longitude: -66.0, status: 'crisis', riskScore: 7.8 },
  { id: 'ET', name: 'Ethiopia', flagEmoji: '🇪🇹', region: 'East Africa', capital: 'Addis Ababa', population: 126_500_000n, gdpUsd: 126_000_000_000n, latitude: 9.0, longitude: 40.0, status: 'unstable', riskScore: 6.1 },
  { id: 'VN', name: 'Vietnam', flagEmoji: '🇻🇳', region: 'Southeast Asia', capital: 'Hanoi', population: 98_900_000n, gdpUsd: 433_000_000_000n, latitude: 16.0, longitude: 107.0, status: 'unstable', riskScore: 4.2 },
  { id: 'MX', name: 'Mexico', flagEmoji: '🇲🇽', region: 'North America', capital: 'Mexico City', population: 128_900_000n, gdpUsd: 1_789_000_000_000n, latitude: 24.0, longitude: -102.0, status: 'unstable', riskScore: 5.6 },
  { id: 'IN', name: 'India', flagEmoji: '🇮🇳', region: 'South Asia', capital: 'New Delhi', population: 1_428_600_000n, gdpUsd: 3_730_000_000_000n, latitude: 22.0, longitude: 79.0, status: 'unstable', riskScore: 4.8 },
  { id: 'CN', name: 'China', flagEmoji: '🇨🇳', region: 'East Asia', capital: 'Beijing', population: 1_425_700_000n, gdpUsd: 17_790_000_000_000n, latitude: 36.0, longitude: 104.0, status: 'unstable', riskScore: 5.4 },
  { id: 'BR', name: 'Brazil', flagEmoji: '🇧🇷', region: 'South America', capital: 'Brasília', population: 216_400_000n, gdpUsd: 2_126_000_000_000n, latitude: -14.0, longitude: -51.0, status: 'stable', riskScore: 4.1 },
  { id: 'US', name: 'United States', flagEmoji: '🇺🇸', region: 'North America', capital: 'Washington DC', population: 339_900_000n, gdpUsd: 27_360_000_000_000n, latitude: 38.0, longitude: -97.0, status: 'stable', riskScore: 3.2 },
  { id: 'DE', name: 'Germany', flagEmoji: '🇩🇪', region: 'Western Europe', capital: 'Berlin', population: 84_500_000n, gdpUsd: 4_456_000_000_000n, latitude: 51.0, longitude: 10.0, status: 'stable', riskScore: 2.8 },
  { id: 'JP', name: 'Japan', flagEmoji: '🇯🇵', region: 'East Asia', capital: 'Tokyo', population: 123_300_000n, gdpUsd: 4_213_000_000_000n, latitude: 36.0, longitude: 138.0, status: 'stable', riskScore: 2.5 },
];

// Untracked countries: shown on the map with real flag/GDP/population data,
// but with no manually-assessed status or risk score — those fields fall
// back to the Prisma schema defaults (stable / 0.0) since we don't curate
// a risk assessment for every country in the world, only the ones with
// active monitoring (the 20 in COUNTRIES above). This mirrors how real
// conflict-tracking platforms like ACLED's Conflict Index work: full
// indicators only for countries with active situations, base data for
// everyone else.
interface UntrackedCountry {
  id: string;
  name: string;
  flagEmoji: string;
  region: string;
  capital: string;
  population: bigint;
  gdpUsd: bigint;
  latitude: number;
  longitude: number;
}

// ── Europe (+ Caucasus) ──────────────────────────────────────────
const EUROPE_COUNTRIES: UntrackedCountry[] = [
  { id: 'AL', name: 'Albania', flagEmoji: '🇦🇱', region: 'Southern Europe', capital: 'Tirana', population: 2_745_000n, gdpUsd: 23_000_000_000n, latitude: 41.0, longitude: 20.0 },
  { id: 'AD', name: 'Andorra', flagEmoji: '🇦🇩', region: 'Southern Europe', capital: 'Andorra la Vella', population: 81_000n, gdpUsd: 3_700_000_000n, latitude: 42.5, longitude: 1.5 },
  { id: 'AT', name: 'Austria', flagEmoji: '🇦🇹', region: 'Western Europe', capital: 'Vienna', population: 9_100_000n, gdpUsd: 521_000_000_000n, latitude: 47.5, longitude: 14.5 },
  { id: 'BY', name: 'Belarus', flagEmoji: '🇧🇾', region: 'Eastern Europe', capital: 'Minsk', population: 9_200_000n, gdpUsd: 73_000_000_000n, latitude: 53.7, longitude: 28.0 },
  { id: 'BE', name: 'Belgium', flagEmoji: '🇧🇪', region: 'Western Europe', capital: 'Brussels', population: 11_700_000n, gdpUsd: 632_000_000_000n, latitude: 50.8, longitude: 4.5 },
  { id: 'BA', name: 'Bosnia and Herzegovina', flagEmoji: '🇧🇦', region: 'Southern Europe', capital: 'Sarajevo', population: 3_200_000n, gdpUsd: 27_000_000_000n, latitude: 44.0, longitude: 18.0 },
  { id: 'BG', name: 'Bulgaria', flagEmoji: '🇧🇬', region: 'Southern Europe', capital: 'Sofia', population: 6_500_000n, gdpUsd: 105_000_000_000n, latitude: 43.0, longitude: 25.0 },
  { id: 'HR', name: 'Croatia', flagEmoji: '🇭🇷', region: 'Southern Europe', capital: 'Zagreb', population: 3_900_000n, gdpUsd: 84_000_000_000n, latitude: 45.1, longitude: 15.5 },
  { id: 'CY', name: 'Cyprus', flagEmoji: '🇨🇾', region: 'Southern Europe', capital: 'Nicosia', population: 1_260_000n, gdpUsd: 32_000_000_000n, latitude: 35.0, longitude: 33.0 },
  { id: 'CZ', name: 'Czechia', flagEmoji: '🇨🇿', region: 'Central Europe', capital: 'Prague', population: 10_900_000n, gdpUsd: 331_000_000_000n, latitude: 49.8, longitude: 15.5 },
  { id: 'DK', name: 'Denmark', flagEmoji: '🇩🇰', region: 'Northern Europe', capital: 'Copenhagen', population: 5_950_000n, gdpUsd: 405_000_000_000n, latitude: 56.0, longitude: 10.0 },
  { id: 'EE', name: 'Estonia', flagEmoji: '🇪🇪', region: 'Northern Europe', capital: 'Tallinn', population: 1_370_000n, gdpUsd: 41_000_000_000n, latitude: 58.6, longitude: 25.0 },
  { id: 'FI', name: 'Finland', flagEmoji: '🇫🇮', region: 'Northern Europe', capital: 'Helsinki', population: 5_600_000n, gdpUsd: 300_000_000_000n, latitude: 64.0, longitude: 26.0 },
  { id: 'FR', name: 'France', flagEmoji: '🇫🇷', region: 'Western Europe', capital: 'Paris', population: 68_200_000n, gdpUsd: 3_030_000_000_000n, latitude: 46.6, longitude: 2.2 },
  { id: 'GE', name: 'Georgia', flagEmoji: '🇬🇪', region: 'Caucasus', capital: 'Tbilisi', population: 3_700_000n, gdpUsd: 31_000_000_000n, latitude: 42.0, longitude: 43.5 },
  { id: 'GR', name: 'Greece', flagEmoji: '🇬🇷', region: 'Southern Europe', capital: 'Athens', population: 10_400_000n, gdpUsd: 238_000_000_000n, latitude: 39.0, longitude: 22.0 },
  { id: 'HU', name: 'Hungary', flagEmoji: '🇭🇺', region: 'Central Europe', capital: 'Budapest', population: 9_600_000n, gdpUsd: 213_000_000_000n, latitude: 47.2, longitude: 19.5 },
  { id: 'IS', name: 'Iceland', flagEmoji: '🇮🇸', region: 'Northern Europe', capital: 'Reykjavik', population: 390_000n, gdpUsd: 31_000_000_000n, latitude: 65.0, longitude: -18.0 },
  { id: 'IE', name: 'Ireland', flagEmoji: '🇮🇪', region: 'Western Europe', capital: 'Dublin', population: 5_150_000n, gdpUsd: 545_000_000_000n, latitude: 53.4, longitude: -8.0 },
  { id: 'IT', name: 'Italy', flagEmoji: '🇮🇹', region: 'Southern Europe', capital: 'Rome', population: 58_900_000n, gdpUsd: 2_255_000_000_000n, latitude: 42.8, longitude: 12.8 },
  { id: 'LV', name: 'Latvia', flagEmoji: '🇱🇻', region: 'Northern Europe', capital: 'Riga', population: 1_840_000n, gdpUsd: 45_000_000_000n, latitude: 56.9, longitude: 24.6 },
  { id: 'LI', name: 'Liechtenstein', flagEmoji: '🇱🇮', region: 'Western Europe', capital: 'Vaduz', population: 40_000n, gdpUsd: 7_000_000_000n, latitude: 47.2, longitude: 9.5 },
  { id: 'LT', name: 'Lithuania', flagEmoji: '🇱🇹', region: 'Northern Europe', capital: 'Vilnius', population: 2_860_000n, gdpUsd: 78_000_000_000n, latitude: 55.2, longitude: 23.9 },
  { id: 'LU', name: 'Luxembourg', flagEmoji: '🇱🇺', region: 'Western Europe', capital: 'Luxembourg', population: 670_000n, gdpUsd: 89_000_000_000n, latitude: 49.8, longitude: 6.1 },
  { id: 'MT', name: 'Malta', flagEmoji: '🇲🇹', region: 'Southern Europe', capital: 'Valletta', population: 540_000n, gdpUsd: 21_000_000_000n, latitude: 35.9, longitude: 14.4 },
  { id: 'MD', name: 'Moldova', flagEmoji: '🇲🇩', region: 'Eastern Europe', capital: 'Chișinău', population: 2_500_000n, gdpUsd: 17_000_000_000n, latitude: 47.0, longitude: 28.9 },
  { id: 'MC', name: 'Monaco', flagEmoji: '🇲🇨', region: 'Western Europe', capital: 'Monaco', population: 39_000n, gdpUsd: 8_700_000_000n, latitude: 43.7, longitude: 7.4 },
  { id: 'ME', name: 'Montenegro', flagEmoji: '🇲🇪', region: 'Southern Europe', capital: 'Podgorica', population: 620_000n, gdpUsd: 7_300_000_000n, latitude: 42.7, longitude: 19.3 },
  { id: 'NL', name: 'Netherlands', flagEmoji: '🇳🇱', region: 'Western Europe', capital: 'Amsterdam', population: 17_900_000n, gdpUsd: 1_092_000_000_000n, latitude: 52.4, longitude: 5.5 },
  { id: 'MK', name: 'North Macedonia', flagEmoji: '🇲🇰', region: 'Southern Europe', capital: 'Skopje', population: 1_830_000n, gdpUsd: 16_000_000_000n, latitude: 41.6, longitude: 21.7 },
  { id: 'NO', name: 'Norway', flagEmoji: '🇳🇴', region: 'Northern Europe', capital: 'Oslo', population: 5_550_000n, gdpUsd: 485_000_000_000n, latitude: 60.5, longitude: 8.5 },
  { id: 'PL', name: 'Poland', flagEmoji: '🇵🇱', region: 'Central Europe', capital: 'Warsaw', population: 37_600_000n, gdpUsd: 842_000_000_000n, latitude: 52.0, longitude: 19.5 },
  { id: 'PT', name: 'Portugal', flagEmoji: '🇵🇹', region: 'Southern Europe', capital: 'Lisbon', population: 10_400_000n, gdpUsd: 287_000_000_000n, latitude: 39.5, longitude: -8.0 },
  { id: 'RO', name: 'Romania', flagEmoji: '🇷🇴', region: 'Eastern Europe', capital: 'Bucharest', population: 19_000_000n, gdpUsd: 350_000_000_000n, latitude: 45.9, longitude: 25.0 },
  { id: 'SM', name: 'San Marino', flagEmoji: '🇸🇲', region: 'Southern Europe', capital: 'San Marino', population: 34_000n, gdpUsd: 1_900_000_000n, latitude: 43.9, longitude: 12.4 },
  { id: 'RS', name: 'Serbia', flagEmoji: '🇷🇸', region: 'Southern Europe', capital: 'Belgrade', population: 6_600_000n, gdpUsd: 76_000_000_000n, latitude: 44.0, longitude: 21.0 },
  { id: 'SK', name: 'Slovakia', flagEmoji: '🇸🇰', region: 'Central Europe', capital: 'Bratislava', population: 5_430_000n, gdpUsd: 132_000_000_000n, latitude: 48.7, longitude: 19.5 },
  { id: 'SI', name: 'Slovenia', flagEmoji: '🇸🇮', region: 'Southern Europe', capital: 'Ljubljana', population: 2_120_000n, gdpUsd: 68_000_000_000n, latitude: 46.1, longitude: 14.8 },
  { id: 'ES', name: 'Spain', flagEmoji: '🇪🇸', region: 'Southern Europe', capital: 'Madrid', population: 47_700_000n, gdpUsd: 1_580_000_000_000n, latitude: 40.0, longitude: -3.7 },
  { id: 'SE', name: 'Sweden', flagEmoji: '🇸🇪', region: 'Northern Europe', capital: 'Stockholm', population: 10_500_000n, gdpUsd: 593_000_000_000n, latitude: 62.0, longitude: 15.0 },
  { id: 'CH', name: 'Switzerland', flagEmoji: '🇨🇭', region: 'Western Europe', capital: 'Bern', population: 8_800_000n, gdpUsd: 884_000_000_000n, latitude: 46.8, longitude: 8.2 },
  { id: 'GB', name: 'United Kingdom', flagEmoji: '🇬🇧', region: 'Western Europe', capital: 'London', population: 68_300_000n, gdpUsd: 3_340_000_000_000n, latitude: 54.0, longitude: -2.0 },
  { id: 'AM', name: 'Armenia', flagEmoji: '🇦🇲', region: 'Caucasus', capital: 'Yerevan', population: 2_980_000n, gdpUsd: 24_000_000_000n, latitude: 40.0, longitude: 45.0 },
  { id: 'AZ', name: 'Azerbaijan', flagEmoji: '🇦🇿', region: 'Caucasus', capital: 'Baku', population: 10_200_000n, gdpUsd: 73_000_000_000n, latitude: 40.5, longitude: 47.5 },
];

const EVENTS: Array<{
  countryId: string;
  title: string;
  description: string;
  category: EventCategory;
  severity: number;
  daysAgo: number;
}> = [
  { countryId: 'UA', title: 'Drone strikes target Kyiv energy grid for third consecutive night', description: 'Ukrainian officials report Shahed drone strikes on power infrastructure across four districts.', category: 'military', severity: 8, daysAgo: 3 },
  { countryId: 'UA', title: 'EU extends sanctions package against Russia', description: 'The European Council approved a 14th round of sanctions targeting energy and finance sectors.', category: 'political', severity: 5, daysAgo: 5 },
  { countryId: 'UA', title: 'IMF disburses $2.2B emergency tranche to Kyiv', description: 'The disbursement is part of the four-year Extended Fund Facility approved in 2023.', category: 'economic', severity: 4, daysAgo: 7 },
  { countryId: 'RU', title: 'Ruble hits 3-month low amid new sanction round', description: 'The currency weakened past 95 to the dollar following expanded financial sector sanctions.', category: 'economic', severity: 6, daysAgo: 3 },
  { countryId: 'SD', title: 'RSF advances in Khartoum suburbs; 12,000 displaced', description: 'UNHCR reports mass displacement from northern Khartoum districts amid intensified clashes.', category: 'military', severity: 9, daysAgo: 4 },
  { countryId: 'SD', title: 'African Union mediation talks collapse in Addis Ababa', description: 'Both warring factions rejected the latest ceasefire framework proposed by AU mediators.', category: 'political', severity: 7, daysAgo: 7 },
  { countryId: 'PS', title: 'Qatar-mediated ceasefire talks resume after 3-week pause', description: 'Indirect negotiations restarted in Doha with US, Egyptian, and Qatari mediators present.', category: 'political', severity: 6, daysAgo: 3 },
  { countryId: 'MM', title: "Resistance forces capture strategic Mandalay checkpoint", description: 'The Peoples Defense Force seized a major army checkpoint, cutting a key supply route.', category: 'military', severity: 7, daysAgo: 5 },
  { countryId: 'TR', title: 'Central bank raises rates 500bps to 45% in emergency session', description: 'The hike exceeded analyst expectations as the lira continued its multi-year depreciation.', category: 'economic', severity: 6, daysAgo: 3 },
  { countryId: 'AR', title: 'IMF board approves revised $44B restructuring deal', description: 'The fund approved a revised Extended Fund Facility contingent on primary surplus targets.', category: 'economic', severity: 5, daysAgo: 4 },
  { countryId: 'PK', title: 'IMF delays $3B bailout tranche over fiscal deficit overshoot', description: 'Pakistan missed the primary deficit target, triggering a review clause in the program.', category: 'economic', severity: 6, daysAgo: 8 },
  { countryId: 'CN', title: 'PLA conducts largest Taiwan Strait exercise in 18 months', description: 'The 72-hour exercise involved carrier group Shandong and over 40 vessels.', category: 'military', severity: 7, daysAgo: 5 },
  { countryId: 'MX', title: 'Cartel violence in Sinaloa displaces 3,000', description: 'Clashes between rival factions of the Sinaloa cartel forced mass evacuation of rural communities.', category: 'military', severity: 6, daysAgo: 4 },
  { countryId: 'US', title: 'Senate passes $85B Ukraine supplemental aid bill', description: 'The bipartisan package includes military, economic, and humanitarian assistance.', category: 'political', severity: 3, daysAgo: 6 },
  { countryId: 'DE', title: 'Coalition survives confidence vote with 3-seat margin', description: 'Chancellor narrowly avoided snap elections after a contentious budget dispute.', category: 'political', severity: 4, daysAgo: 5 },
];

// Mock articles for the news-feed homepage layout. Each maps 1:1 to an
// existing EVENTS entry (linked via ArticleEvent below) so the map, sidebar,
// and article feed all tell a consistent story about the same situation —
// this stands in for real News Ingestion (Stage 4) until a live source is
// wired up; the API contract is identical either way.
const ARTICLES: Array<{
  countryId: string;
  title: string;
  body: string;
  aiSummary: string;
  category: EventCategory;
  sentimentScore: number;
  hoursAgo: number;
  eventIndex: number; // index into EVENTS, for the ArticleEvent link
}> = [
  {
    countryId: 'UA',
    title: 'Drone strikes target Kyiv energy grid for third consecutive night',
    body: 'Ukrainian officials reported sustained drone strikes against power infrastructure in the capital region overnight, marking the third consecutive night of attacks on the energy grid. Emergency crews have been deployed across four districts to begin repairs, though officials warned that some areas could face extended outages as winter approaches. The strikes come amid a broader pattern of attacks on critical infrastructure that energy ministry officials say has intensified over the past month. Air defense units reportedly intercepted a majority of the incoming drones, though several made impact in residential and industrial areas on the citys outskirts.',
    aiSummary: 'Kyiv faced a third night of drone strikes on its power grid, with repair crews deployed across four districts amid concerns about winter outages.',
    category: 'military',
    sentimentScore: -0.62,
    hoursAgo: 2 / 60,
    eventIndex: 0,
  },
  {
    countryId: 'UA',
    title: 'EU extends sanctions package against Russia',
    body: 'The European Council on Wednesday approved a fourteenth round of sanctions against Russia, expanding restrictions on the energy and finance sectors. The package, agreed after weeks of negotiation among member states, targets additional banking institutions and tightens existing caps on oil-related shipping services. Diplomats described the round as incremental rather than dramatic, reflecting ongoing efforts to close loopholes in earlier sanctions rather than introducing fundamentally new measures. The move was welcomed by Ukrainian officials, who have repeatedly called for tougher enforcement of existing restrictions.',
    aiSummary: 'The EU approved its 14th sanctions package against Russia, expanding energy and finance restrictions and closing loopholes in earlier rounds.',
    category: 'political',
    sentimentScore: 0.08,
    hoursAgo: 5,
    eventIndex: 1,
  },
  {
    countryId: 'UA',
    title: 'IMF disburses $2.2B emergency tranche to Kyiv',
    body: 'The International Monetary Fund disbursed a $2.2 billion tranche to Ukraine this week as part of the four-year Extended Fund Facility approved in 2023. The disbursement follows a routine program review and is intended to help stabilize the budget and support continued reconstruction efforts. Fund officials noted that Ukraine has largely stayed on track with the program structural benchmarks despite the ongoing conflict, though they cautioned that continued external financing remains essential for fiscal sustainability through the coming year.',
    aiSummary: 'The IMF released a $2.2B tranche to Ukraine under its existing four-year program, citing continued progress on structural benchmarks.',
    category: 'economic',
    sentimentScore: 0.31,
    hoursAgo: 7 * 24,
    eventIndex: 2,
  },
  {
    countryId: 'RU',
    title: 'Ruble hits 3-month low amid new sanction round',
    body: 'The Russian ruble weakened past 95 to the US dollar this week, touching its lowest level in three months following the announcement of expanded financial sector sanctions from the European Union and allied governments. Analysts attributed the decline to a combination of reduced export revenues and growing difficulty for Russian banks in settling international transactions. The central bank has so far refrained from intervening directly in currency markets, though some economists expect policy responses if the depreciation accelerates further in the coming weeks.',
    aiSummary: 'The ruble fell to a three-month low against the dollar after new EU financial sanctions, with the central bank yet to intervene.',
    category: 'economic',
    sentimentScore: -0.35,
    hoursAgo: 3 * 24,
    eventIndex: 3,
  },
  {
    countryId: 'SD',
    title: 'RSF advances in Khartoum suburbs; 12,000 displaced',
    body: 'The United Nations refugee agency reported mass displacement from northern districts of Khartoum this week as Rapid Support Forces units advanced into suburban areas previously held by the national army. Aid workers said an estimated 12,000 people fled their homes over a 48-hour period, adding further strain to camps that were already operating well beyond capacity. Humanitarian organizations renewed calls for safe corridors to allow aid delivery, warning that food and medical supplies in the affected areas are running critically low.',
    aiSummary: 'UNHCR reports roughly 12,000 people displaced as RSF forces advanced into northern Khartoum suburbs, straining already overcrowded camps.',
    category: 'humanitarian',
    sentimentScore: -0.71,
    hoursAgo: 4 * 24,
    eventIndex: 4,
  },
  {
    countryId: 'SD',
    title: 'African Union mediation talks collapse in Addis Ababa',
    body: 'Mediation talks hosted by the African Union in Addis Ababa ended without agreement this week after both warring factions rejected the latest ceasefire framework. Negotiators had hoped the session would produce at least a limited humanitarian truce, but delegates from both sides cited unresolved disputes over troop withdrawal sequencing as the main sticking point. Regional diplomats expressed frustration at the lack of progress, noting that this marks the third round of talks to end without a substantive agreement since the conflict began.',
    aiSummary: 'AU-mediated ceasefire talks in Addis Ababa collapsed after both sides rejected the proposed framework over troop withdrawal terms.',
    category: 'political',
    sentimentScore: -0.48,
    hoursAgo: 7 * 24,
    eventIndex: 5,
  },
  {
    countryId: 'PS',
    title: 'Qatar-mediated ceasefire talks resume after 3-week pause',
    body: 'Indirect negotiations between the parties resumed in Doha this week after a three-week pause, with representatives from the United States, Egypt, and Qatar present as mediators. Officials familiar with the talks described the resumption as a cautious step forward, though significant gaps reportedly remain on questions of sequencing and verification. Humanitarian organizations operating in the region urged negotiators to prioritize the reopening of aid corridors regardless of the broader outcome of the talks.',
    aiSummary: 'Indirect ceasefire negotiations resumed in Doha after a three-week pause, though mediators say significant gaps remain.',
    category: 'political',
    sentimentScore: 0.12,
    hoursAgo: 3 * 24,
    eventIndex: 6,
  },
  {
    countryId: 'MM',
    title: 'Resistance forces capture strategic Mandalay checkpoint',
    body: 'Forces aligned with the opposition Peoples Defense Force seized a major army checkpoint outside Mandalay this week, cutting off a key supply route used by government forces in the region. Local reports describe the checkpoint as one of the more significant tactical losses for the military administration in recent months, though the broader strategic picture across the country remains contested. The junta has not issued a detailed public response to the development.',
    aiSummary: 'Opposition forces captured a key army checkpoint near Mandalay, cutting a major supply route in what local reports call a significant tactical setback.',
    category: 'military',
    sentimentScore: -0.18,
    hoursAgo: 5 * 24,
    eventIndex: 7,
  },
  {
    countryId: 'TR',
    title: 'Central bank raises rates 500bps to 45% in emergency session',
    body: 'Turkeys central bank raised its benchmark interest rate by 500 basis points to 45 percent in an emergency session this week, a move that exceeded most analyst expectations. The decision comes as the lira has continued a multi-year pattern of depreciation against major currencies, with policymakers citing persistent inflation pressures as the primary driver. Markets reacted with cautious optimism, though several economists noted that the move alone is unlikely to resolve underlying structural pressures on the currency.',
    aiSummary: 'Turkeys central bank hiked rates by 500bps to 45% in an emergency move aimed at curbing inflation and lira depreciation.',
    category: 'economic',
    sentimentScore: -0.05,
    hoursAgo: 3 * 24,
    eventIndex: 8,
  },
  {
    countryId: 'AR',
    title: 'IMF board approves revised $44B restructuring deal',
    body: 'The International Monetary Funds executive board approved a revised $44 billion Extended Fund Facility for Argentina this week, contingent on the government meeting updated primary surplus targets. The agreement follows months of negotiation over fiscal adjustment timelines, with fund officials describing the revised terms as more realistic given current economic conditions. Argentine officials welcomed the approval, though opposition economists questioned whether the surplus targets remain achievable without further austerity measures.',
    aiSummary: 'The IMF board approved a revised $44B program for Argentina with updated surplus targets, following months of negotiation.',
    category: 'economic',
    sentimentScore: 0.22,
    hoursAgo: 14 / 60,
    eventIndex: 9,
  },
  {
    countryId: 'PK',
    title: 'IMF delays $3B bailout tranche over fiscal deficit overshoot',
    body: 'The International Monetary Fund postponed disbursement of a scheduled $3 billion tranche to Pakistan this week after the government missed its primary deficit target for the quarter, triggering a review clause built into the existing program. Fund staff are expected to conduct additional consultations with Pakistani officials in the coming weeks to assess corrective measures before any revised disbursement schedule is finalized. The delay adds further pressure on foreign currency reserves that have already been under strain.',
    aiSummary: 'The IMF delayed a $3B tranche to Pakistan after a missed deficit target triggered a program review clause.',
    category: 'economic',
    sentimentScore: -0.44,
    hoursAgo: 8 * 24,
    eventIndex: 10,
  },
  {
    countryId: 'CN',
    title: 'PLA conducts largest Taiwan Strait exercise in 18 months',
    body: 'Chinas Peoples Liberation Army conducted a 72-hour military exercise around the Taiwan Strait this week, involving the carrier group Shandong and more than 40 vessels in what regional defense analysts described as the largest such exercise in eighteen months. Taiwanese officials said they monitored the exercise closely but did not report any direct incursions into restricted airspace or territorial waters. The exercise drew expressions of concern from several regional governments, though Beijing characterized the drills as routine training activity.',
    aiSummary: 'China conducted its largest Taiwan Strait military exercise in 18 months, involving over 40 vessels and the carrier Shandong.',
    category: 'military',
    sentimentScore: -0.28,
    hoursAgo: 5 * 24,
    eventIndex: 11,
  },
  {
    countryId: 'MX',
    title: 'Cartel violence in Sinaloa displaces 3,000',
    body: 'Clashes between rival factions of the Sinaloa cartel forced the evacuation of several rural communities this week, with local authorities estimating roughly 3,000 people displaced. The violence, which has intensified following a leadership dispute within the organization, has prompted increased deployment of federal security forces to the affected municipalities. Residents described a tense and uncertain situation, with many reluctant to return home despite assurances from local officials that security has been reinforced.',
    aiSummary: 'Internal Sinaloa cartel clashes displaced an estimated 3,000 people, prompting increased federal security deployment to the region.',
    category: 'humanitarian',
    sentimentScore: -0.56,
    hoursAgo: 4 * 24,
    eventIndex: 12,
  },
  {
    countryId: 'US',
    title: 'Senate passes $85B Ukraine supplemental aid bill',
    body: 'The US Senate passed an $85 billion supplemental aid package this week with bipartisan support, combining military, economic, and humanitarian assistance for Ukraine. The bill now heads to the House, where its prospects remain less certain given divisions within the chamber over the scope and duration of continued funding. Administration officials welcomed the Senate vote as a sign of sustained bipartisan commitment, while some lawmakers argued for stronger oversight provisions on how the funds are ultimately spent.',
    aiSummary: 'The Senate passed an $85B bipartisan aid package for Ukraine covering military, economic, and humanitarian support; House prospects remain uncertain.',
    category: 'political',
    sentimentScore: 0.19,
    hoursAgo: 6 * 24,
    eventIndex: 13,
  },
  {
    countryId: 'DE',
    title: 'Coalition survives confidence vote with 3-seat margin',
    body: 'Germanys governing coalition narrowly survived a confidence vote this week, avoiding snap elections by a margin of just three seats following a contentious dispute over the federal budget. The vote capped weeks of tense negotiations between coalition partners over spending priorities, with several junior ministers reportedly threatening to resign before a last-minute compromise was reached. Political analysts described the outcome as a temporary reprieve rather than a durable resolution, predicting further friction as budget season continues.',
    aiSummary: 'Germanys coalition survived a confidence vote by three seats after a tense budget dispute, though analysts expect continued friction.',
    category: 'political',
    sentimentScore: -0.02,
    hoursAgo: 5 * 24,
    eventIndex: 14,
  },
];

async function main() {
  console.log('🌍 Seeding countries...');
  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }
  console.log(`✅ Seeded ${COUNTRIES.length} countries`);

  console.log('🌍 Seeding additional countries (Europe + Caucasus)...');
  for (const c of EUROPE_COUNTRIES) {
    await prisma.country.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }
  console.log(`✅ Seeded ${EUROPE_COUNTRIES.length} additional countries`);

  console.log('📰 Seeding events...');
  for (const e of EVENTS) {
    const startedAt = new Date();
    startedAt.setDate(startedAt.getDate() - e.daysAgo);

    await prisma.event.create({
      data: {
        countryId: e.countryId,
        title: e.title,
        description: e.description,
        category: e.category,
        severity: e.severity,
        startedAt,
        tags: [],
      },
    });
  }
  console.log(`✅ Seeded ${EVENTS.length} events`);

  console.log('🗞️ Seeding default source...');
  await prisma.source.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'NewsAPI',
      type: 'api',
      url: 'https://newsapi.org/v2/everything',
      active: true,
      fetchIntervalMinutes: 15,
    },
  });
  console.log('✅ Default source created');

  console.log('📰 Seeding mock articles...');
  // Re-fetch the events we just created so we can link articles to them by
  // index — Prisma doesn't return ids from the loop above since we used
  // create() in bulk rather than capturing each result.
  const createdEvents = await prisma.event.findMany({ orderBy: { createdAt: 'asc' } });

  for (const a of ARTICLES) {
    const publishedAt = new Date();
    publishedAt.setTime(publishedAt.getTime() - a.hoursAgo * 60 * 60 * 1000);

    const article = await prisma.article.create({
      data: {
        sourceId: '00000000-0000-0000-0000-000000000001',
        countryId: a.countryId,
        url: `https://example.com/mock-articles/${a.countryId.toLowerCase()}-${createdEvents[a.eventIndex]?.id ?? a.eventIndex}`,
        title: a.title,
        body: a.body,
        publishedAt,
        category: a.category,
        aiSummary: a.aiSummary,
        aiSummaryApproved: true,
        sentimentScore: a.sentimentScore,
        tags: [],
      },
    });

    const matchingEvent = createdEvents[a.eventIndex];
    if (matchingEvent) {
      await prisma.articleEvent.create({
        data: {
          articleId: article.id,
          eventId: matchingEvent.id,
          confidence: 0.95,
        },
      });
    }
  }
  console.log(`✅ Seeded ${ARTICLES.length} mock articles`);

  console.log('📈 Seeding risk score history...');
  let historyCount = 0;
  for (const c of COUNTRIES) {
    // Generate a simple 30-day trend ending at the country's current risk score,
    // with small random fluctuation for a realistic-looking chart.
    for (let daysAgo = 30; daysAgo >= 0; daysAgo -= 3) {
      const computedAt = new Date();
      computedAt.setDate(computedAt.getDate() - daysAgo);

      const drift = (Math.random() - 0.5) * 0.6; // ±0.3 fluctuation
      const score = Math.max(0, Math.min(10, c.riskScore + drift));

      await prisma.riskScoreHistory.create({
        data: {
          countryId: c.id,
          score,
          breakdown: {
            military: Math.round(score * 0.4 * 10) / 10,
            economic: Math.round(score * 0.3 * 10) / 10,
            political: Math.round(score * 0.2 * 10) / 10,
            humanitarian: Math.round(score * 0.1 * 10) / 10,
          },
          computedAt,
        },
      });
      historyCount++;
    }
  }
  console.log(`✅ Seeded ${historyCount} risk score history entries`);

  console.log('👤 Seeding admin user...');
  // Password hash is generated at seed-time from ADMIN_SEED_PASSWORD env var
  // (default 'ChangeMe123!' for local dev only — never reuse in production).
  // This avoids committing a hardcoded bcrypt hash to source control.
  const bcrypt = await import('bcrypt');
  const seedPassword = process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  await prisma.user.upsert({
    where: { email: 'admin@geowatch.local' },
    update: {},
    create: {
      email: 'admin@geowatch.local',
      passwordHash,
      role: 'superadmin',
    },
  });
  console.log(
    `✅ Admin user created (admin@geowatch.local / ${seedPassword}) — CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION`,
  );

  console.log('🎉 Seed complete');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
