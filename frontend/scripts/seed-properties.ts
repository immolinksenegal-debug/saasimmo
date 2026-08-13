// Seeds the demo ImmoLink listings (real estate) into Postgres, replacing
// the static array that used to live in src/lib/mock/immolink.ts.
//
// Usage: pnpm seed:properties
//
// Idempotent — upserts the demo seller by email, then upserts each listing
// by (ownerId, title) so re-running does not duplicate rows.
//
// Refuses to run with NODE_ENV=production, mirrors seed-dev.ts.

import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';

const DEMO_SELLER = {
  email: 'aicha.demo@immolink.sn',
  password: 'DemoSellerPwd123!',
};

function unsplash(id: string, w = 900): string {
  return `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
}

const G = {
  villa1: unsplash('1613977257363-707ba9348227'),
  villa2: unsplash('1600596542815-ffad4c1539a9'),
  appt1: unsplash('1502672260266-1c1ef2d93688'),
  appt2: unsplash('1560448204-e02f11c3d0e2'),
  land: unsplash('1500382017468-9049fed747ef'),
  office: unsplash('1497366216548-37526070297c'),
  villa3: unsplash('1600585154340-be6161a56a0c'),
  appt3: unsplash('1560185007-cde436f6a4d0'),
};

const SEED_PROPERTIES = [
  {
    title: 'Villa contemporaine avec piscine',
    type: 'Villa',
    txn: 'Vente',
    city: 'Dakar',
    quartier: 'Les Almadies',
    price: 185_000_000,
    unit: '',
    beds: 5,
    baths: 4,
    surface: 420,
    badge: 'Premium',
    image: G.villa1,
    image2: G.villa2,
    image3: G.appt1,
    photos: 24,
    views: 1284,
    favs: 96,
    agent: 'Aïcha Ndiaye',
    agency: 'Prestige Immo',
    charges: 'Non applicable',
  },
  {
    title: 'Appartement F4 vue mer',
    type: 'Appartement',
    txn: 'Location',
    city: 'Dakar',
    quartier: 'Ngor',
    price: 850_000,
    unit: '/mois',
    beds: 3,
    baths: 2,
    surface: 145,
    badge: 'Nouveau',
    image: G.appt2,
    image2: G.appt1,
    image3: G.villa1,
    photos: 16,
    views: 642,
    favs: 41,
    agent: 'Moussa Fall',
    agency: 'Fall Résidences',
    charges: '75 000 FCFA/mois',
  },
  {
    title: 'Duplex standing avec jardin',
    type: 'Villa',
    txn: 'Vente',
    city: 'Abidjan',
    quartier: 'Cocody Riviera',
    price: 142_000_000,
    unit: '',
    beds: 4,
    baths: 3,
    surface: 310,
    badge: 'Coup de cœur',
    image: G.villa3,
    image2: G.villa1,
    image3: G.appt2,
    photos: 20,
    views: 938,
    favs: 73,
    agent: 'Ange Kouassi',
    agency: 'Ivoire Habitat',
    charges: 'Non applicable',
  },
  {
    title: 'Studio meublé hypercentre',
    type: 'Appartement',
    txn: 'Location',
    city: 'Dakar',
    quartier: 'Plateau',
    price: 320_000,
    unit: '/mois',
    beds: 1,
    baths: 1,
    surface: 48,
    badge: 'Nouveau',
    image: G.appt3,
    image2: G.office,
    image3: G.appt1,
    photos: 11,
    views: 410,
    favs: 28,
    agent: 'Fatou Sow',
    agency: 'Urban Keys',
    charges: '30 000 FCFA/mois',
  },
  {
    title: 'Terrain viabilisé 600 m²',
    type: 'Terrain',
    txn: 'Vente',
    city: 'Dakar',
    quartier: 'Diamniadio',
    price: 48_000_000,
    unit: '',
    beds: 0,
    baths: 0,
    surface: 600,
    badge: 'Opportunité',
    image: G.land,
    image2: G.land,
    image3: G.villa1,
    photos: 8,
    views: 521,
    favs: 34,
    agent: 'Ibrahima Ba',
    agency: 'Foncier Plus',
    charges: 'Non applicable',
  },
  {
    title: 'Bureau open-space équipé',
    type: 'Bureau',
    txn: 'Location',
    city: 'Dakar',
    quartier: 'Mermoz',
    price: 1_200_000,
    unit: '/mois',
    beds: 0,
    baths: 2,
    surface: 220,
    badge: 'Premium',
    image: G.office,
    image2: G.appt3,
    image3: G.appt1,
    photos: 14,
    views: 288,
    favs: 19,
    agent: 'Awa Diallo',
    agency: 'WorkSpace SN',
    charges: '120 000 FCFA/mois',
  },
  {
    title: 'Villa haut standing R+1',
    type: 'Villa',
    txn: 'Vente',
    city: 'Dakar',
    quartier: 'Point E',
    price: 210_000_000,
    unit: '',
    beds: 6,
    baths: 5,
    surface: 480,
    badge: 'Premium',
    image: G.villa2,
    image2: G.villa1,
    image3: G.villa3,
    photos: 28,
    views: 1502,
    favs: 118,
    agent: 'Aïcha Ndiaye',
    agency: 'Prestige Immo',
    charges: 'Non applicable',
  },
  {
    title: 'Appartement F3 résidence sécurisée',
    type: 'Appartement',
    txn: 'Location',
    city: 'Dakar',
    quartier: 'Mermoz',
    price: 650_000,
    unit: '/mois',
    beds: 2,
    baths: 2,
    surface: 98,
    badge: 'Nouveau',
    image: G.appt1,
    image2: G.appt2,
    image3: G.appt3,
    photos: 13,
    views: 377,
    favs: 25,
    agent: 'Moussa Fall',
    agency: 'Fall Résidences',
    charges: '55 000 FCFA/mois',
  },
];

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-properties in production.');
    process.exit(1);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(DEMO_SELLER.password, 12);
    const seller = await prisma.user.upsert({
      where: { email: DEMO_SELLER.email },
      update: {},
      create: {
        email: DEMO_SELLER.email,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    console.log(`✓ demo seller ${seller.email}`);

    // The demo seller ships with 8 pre-seeded listings — since POST
    // /api/properties enforces a per-owner active-listing quota (free tier
    // = 1), an un-subscribed demo seller would immediately be over quota
    // and unable to publish anything new. Give it a permanent Premium-tier
    // subscription so the demo/test flow keeps working out of the box.
    await prisma.subscription.upsert({
      where: { userId: seller.id },
      update: {
        plan: 'PREMIUM',
        listingQuota: 50,
        status: 'ACTIVE',
        renewsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      create: {
        userId: seller.id,
        plan: 'PREMIUM',
        listingQuota: 50,
        status: 'ACTIVE',
        renewsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`✓ demo seller subscription (Premium, 50 annonces)`);

    for (const p of SEED_PROPERTIES) {
      const existing = await prisma.property.findFirst({
        where: { ownerId: seller.id, title: p.title },
        select: { id: true },
      });
      if (existing) {
        await prisma.property.update({ where: { id: existing.id }, data: p });
      } else {
        await prisma.property.create({ data: { ...p, ownerId: seller.id } });
      }
      console.log(`✓ ${p.title}`);
    }
    console.log(`\n${SEED_PROPERTIES.length} listings seeded for ${seller.email}.`);
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
