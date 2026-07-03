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
