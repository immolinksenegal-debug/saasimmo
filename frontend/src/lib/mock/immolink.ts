// Presentation-only helpers for the ImmoLink Sénégal design (Claude Design
// import). Listings themselves are real DB rows now (Prisma `Property`
// model, seeded via `pnpm seed:properties`) — fetched through
// `src/lib/server/properties.ts` in Server Components or `/api/properties`
// for other clients. What stays here is purely presentational: price
// formatting, badge/txn color mapping, and static marketing content
// (packs, testimonials, programs, footer, KPIs) that isn't backed by a
// database table.

import type { Property } from '@prisma/client';

// Real ImmoLink Sénégal contact info — used for the footer, the property
// contact card (WhatsApp / message), and anywhere else a visitor needs to
// reach the platform. IMMOLINK_PHONE_E164 has no spaces (wa.me/tel: require
// a bare digit string); IMMOLINK_PHONE is the human-readable display form.
export const IMMOLINK_PHONE = '+221 77 117 79 77';
export const IMMOLINK_PHONE_E164 = '+221771177977';
export const IMMOLINK_EMAIL = 'immolinksenegal@gmail.com';
export const IMMOLINK_FACEBOOK_URL = 'https://www.facebook.com/reel/1208687211473504';
export const IMMOLINK_INSTAGRAM_URL = 'https://www.instagram.com/immolinksenegal';
export const IMMOLINK_WHATSAPP_URL = `https://wa.me/${IMMOLINK_PHONE_E164.replace('+', '')}`;

// Builds a wa.me deep link with a prefilled message. Strips every non-digit
// character (not just a leading '+') so a phone stored with spaces/dashes —
// e.g. "+221 77 123 45 67" — still produces a valid link.
export function waMeHref(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function formatFcfa(n: number): string {
  return Math.round(n)
    .toLocaleString('fr-FR')
    .replace(/[\u202f\u00a0]/g, ' ');
}

export function priceFmt(p: Pick<Property, 'price'>): string {
  return `${formatFcfa(p.price)} FCFA`;
}

export function txnTextClass(txn: string): string {
  return txn === 'Vente' ? 'text-brand-green' : 'text-brand-red';
}

const BADGE_CLASSES: Record<string, string> = {
  Premium: 'bg-brand-green',
  Nouveau: 'bg-brand-red',
  'Coup de cœur': 'bg-brand-red-dark',
  Opportunité: 'bg-brand-green',
};

export function badgeClassFor(badge: string): string {
  return BADGE_CLASSES[badge] ?? 'bg-brand-green';
}

const AMENITIES = [
  'Climatisation',
  'Parking privé',
  'Sécurité 24/7',
  'Groupe électrogène',
  'Cuisine équipée',
  'Balcon / terrasse',
  'Ascenseur',
  'Fibre optique',
];

export interface PropertyStat {
  l: string;
  v: string;
}

export function propertyStats(
  p: Pick<Property, 'type' | 'beds' | 'baths' | 'surface' | 'txn'>,
): PropertyStat[] {
  if (p.type === 'Terrain') {
    return [
      { l: 'Surface', v: `${p.surface} m²` },
      { l: 'Type', v: 'Terrain' },
      { l: 'Titre', v: 'Foncier' },
      { l: 'Statut', v: 'Viabilisé' },
    ];
  }
  return [
    { l: 'Chambres', v: String(p.beds) },
    { l: 'Salles de bain', v: String(p.baths) },
    { l: 'Surface', v: `${p.surface} m²` },
    { l: 'Étage', v: p.txn === 'Vente' ? 'R+1' : '2e' },
  ];
}

export function propertyDescription(
  p: Pick<Property, 'type' | 'quartier' | 'city' | 'txn'>,
): string {
  const goal =
    p.txn === 'Vente'
      ? 'un achat patrimonial ou un investissement locatif'
      : 'une location premium immédiate';
  return `Découvrez ce ${p.type.toLowerCase()} d’exception situé à ${p.quartier}, ${p.city}. Espaces lumineux et prestations haut de gamme, à quelques minutes des commodités, écoles et axes principaux. Un bien rare, idéal pour ${goal}. Visite virtuelle 360° et documents disponibles sur demande.`;
}

export function propertyAmenities(): string[] {
  return AMENITIES;
}

const PLACEHOLDER_IMAGE_BY_TYPE: Record<string, string> = {
  Villa:
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80&auto=format&fit=crop',
  Appartement:
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80&auto=format&fit=crop',
  Terrain:
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80&auto=format&fit=crop',
  Bureau:
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&q=80&auto=format&fit=crop',
};

// Used when a listing is published without photos (e.g. no session to
// authenticate the Cloudinary upload against yet — see resolveOwnerId).
export function placeholderImageFor(type: string): string {
  return PLACEHOLDER_IMAGE_BY_TYPE[type] ?? PLACEHOLDER_IMAGE_BY_TYPE.Villa!;
}

export function agentInitials(agent: string): string {
  return agent
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Mortgage estimate: 20% down payment, 8%/year indicative rate.
export function estimateMonthlyPayment(
  p: Pick<Property, 'price' | 'unit'>,
  durationYears: number,
): { mensualite: number; apport: number; finance: number } {
  if (p.unit) {
    // Rentals: the "monthly payment" is simply the rent itself.
    return { mensualite: p.price, apport: 0, finance: p.price };
  }
  const apport = p.price * 0.2;
  const finance = p.price - apport;
  const rate = 0.08 / 12;
  const n = durationYears * 12;
  const mensualite = (finance * rate) / (1 - Math.pow(1 + rate, -n));
  return { mensualite, apport, finance };
}

export const HERO_STATS = [
  { v: '48 200+', l: 'Biens publiés' },
  { v: '1 350', l: 'Agences partenaires' },
  { v: '12', l: 'Pays couverts' },
  { v: '96%', l: 'Clients satisfaits' },
];

export const PROGRAMS = [
  {
    name: 'Les Jardins d’Almadies',
    city: 'Dakar',
    lots: '48 lots',
    from: '32M FCFA',
    status: 'En cours',
    image:
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=700&q=80&auto=format&fit=crop',
  },
  {
    name: 'Résidence Océane',
    city: 'Saly',
    lots: '120 apparts',
    from: '45M FCFA',
    status: 'Sur plan',
    image:
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&q=80&auto=format&fit=crop',
  },
  {
    name: 'Cité Émeraude',
    city: 'Diamniadio',
    lots: '80 villas',
    from: '28M FCFA',
    status: 'Livraison 2027',
    image:
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=700&q=80&auto=format&fit=crop',
  },
];

export interface Pack {
  name: string;
  price: string;
  per: string;
  popular: boolean;
  features: string[];
  cta: string;
  card: string;
  check: string;
  button: string;
  // 'create' (Gratuit) → navigates to /annonces/nouvelle, no charge.
  // 'checkout' (Standard/Premium/Annuel) → real Bictorys checkout via
  // POST /api/subscriptions/checkout, priced server-side from
  // lib/server/subscriptions/plans.ts (planId identifies which entry).
  // 'contact' — sales-assisted, just closes the modal. No pack currently
  // uses this, kept for a future custom/enterprise tier.
  action: 'create' | 'checkout' | 'contact';
  planId?: 'STANDARD' | 'PREMIUM' | 'ANNUEL';
}

export const PACKS: Pack[] = [
  {
    name: 'Gratuit',
    price: '0 FCFA',
    per: 'à vie',
    popular: false,
    features: [
      '1 annonce active',
      'Durée limitée · 15 jours',
      'Jusqu’à 3 photos',
      'Sans mise en avant',
    ],
    cta: 'Commencer',
    action: 'create',
    card: 'bg-white text-brand-ink border border-brand-green/10',
    check: 'text-brand-green',
    button: 'bg-brand-green/10 text-brand-green',
  },
  {
    name: 'Standard',
    price: '9 900 FCFA',
    per: '/ mois',
    popular: false,
    features: [
      '10 annonces actives',
      '30 jours par annonce',
      'Photos illimitées',
      'Statistiques de base',
    ],
    cta: 'Choisir Standard',
    action: 'checkout',
    planId: 'STANDARD',
    card: 'bg-white text-brand-ink border border-brand-green/10',
    check: 'text-brand-green',
    button: 'bg-brand-green/10 text-brand-green',
  },
  {
    name: 'Premium',
    price: '24 900 FCFA',
    per: '/ mois',
    popular: true,
    features: [
      '50 annonces actives',
      'Mise en avant + Badge Premium',
      'Publication prioritaire',
      'Support prioritaire',
    ],
    cta: 'Choisir Premium',
    action: 'checkout',
    planId: 'PREMIUM',
    card: 'bg-brand-green text-brand-cream border border-brand-green',
    check: 'text-brand-gold',
    button: 'bg-brand-red text-white',
  },
  {
    name: 'Annuelle',
    price: '250 000 FCFA',
    per: '/ an',
    popular: false,
    features: [
      'Annonces illimitées',
      'Mise en avant + Badge Premium',
      'Publication prioritaire',
      'Support prioritaire · facturation annuelle',
    ],
    cta: 'Choisir Annuelle',
    action: 'checkout',
    planId: 'ANNUEL',
    card: 'bg-brand-green-dark text-brand-cream border border-brand-green-dark',
    check: 'text-brand-gold',
    button: 'bg-brand-gold text-brand-green-dark',
  },
];

export const TESTIMONIALS = [
  {
    name: 'Fatou Diop',
    role: 'Acheteuse · Dakar',
    init: 'FD',
    avatarClass: 'bg-linear-to-br from-brand-green to-[#12764A]',
    stars: '★★★★★',
    quote:
      'J’ai trouvé mon appartement aux Almadies en deux semaines. Les photos et la visite 360° m’ont fait gagner un temps fou.',
  },
  {
    name: 'Mamadou Sy',
    role: 'Agence Prestige Immo',
    init: 'MS',
    avatarClass: 'bg-linear-to-br from-brand-red to-brand-red-dark',
    stars: '★★★★★',
    quote:
      'La vitrine agence et les statistiques nous apportent des prospects vraiment qualifiés. Nos ventes ont augmenté de 30%.',
  },
  {
    name: 'Aïssatou Ba',
    role: 'Particulier · Saly',
    init: 'AB',
    avatarClass: 'bg-linear-to-br from-[#B7791F] to-[#8A5A12]',
    stars: '★★★★☆',
    quote:
      'Publier mon annonce a été simple et rapide. Le paiement Wave et le badge Premium m’ont donné beaucoup de visibilité.',
  },
];

// Footer nav — each item is either a real `href` or `action: 'packs'` (opens
// the packs modal via OpenPacksButton, same as the header's "Publier une
// annonce" button). Items without a dedicated page fall back to the closest
// real destination (see the "ImmoLink" column below); "Projets neufs" /
// "Agences" / "Investir" now have real pages, mirroring Header.tsx's
// NAV_LINKS.
export const FOOTER_COLS: {
  h: string;
  items: { label: string; href?: string; action?: 'packs' }[];
}[] = [
  {
    h: 'Explorer',
    items: [
      { label: 'Acheter', href: '/recherche?txn=vente' },
      { label: 'Louer', href: '/recherche?txn=location' },
      { label: 'Projets neufs', href: '/projets-neufs' },
      { label: 'Investir', href: '/investir' },
      { label: 'Agences', href: '/agences' },
    ],
  },
  {
    h: 'Professionnels',
    items: [
      { label: 'Publier une annonce', action: 'packs' },
      { label: 'Nos packs', action: 'packs' },
      { label: 'Espace agence', href: '/dashboard' },
      { label: 'Devenir partenaire', href: '/signup' },
      { label: 'API', href: `mailto:${IMMOLINK_EMAIL}?subject=Acc%C3%A8s%20API` },
    ],
  },
  {
    h: 'ImmoLink',
    items: [
      { label: 'À propos', href: '/' },
      { label: 'Blog', href: '/' },
      { label: 'FAQ', href: '/' },
      { label: 'Contact', href: `mailto:${IMMOLINK_EMAIL}` },
      { label: 'Mentions légales', href: '/mentions-legales' },
      { label: 'CGV', href: '/cgv' },
    ],
  },
];

export const KPIS = [
  {
    l: 'Vues (7j)',
    v: '4 812',
    trend: '+18%',
    trendClass: 'text-brand-green bg-brand-green/10',
    bar: 'w-[78%]',
    barClass: 'bg-brand-green',
  },
  {
    l: 'Favoris',
    v: '386',
    trend: '+9%',
    trendClass: 'text-brand-green bg-brand-green/10',
    bar: 'w-[54%]',
    barClass: 'bg-brand-red',
  },
  {
    l: 'Contacts',
    v: '127',
    trend: '+24%',
    trendClass: 'text-brand-green bg-brand-green/10',
    bar: 'w-[66%]',
    barClass: 'bg-brand-green',
  },
  {
    l: 'Visites',
    v: '19',
    trend: '-3%',
    trendClass: 'text-[#a23b2a] bg-[#f6e2dd]',
    bar: 'w-[32%]',
    barClass: 'bg-brand-red',
  },
];

// Dashboard sidebar renders real `Notification` rows (see
// src/lib/server/notifications/) — this maps the row's `type` to a display
// icon/background, since the DB only stores a free-form type string.
const NOTIFICATION_VISUALS: Record<string, { icon: string; bg: string }> = {
  VISIT_REQUESTED: { icon: '📅', bg: 'bg-brand-green/10' },
  WELCOME: { icon: '👋', bg: 'bg-[#FBF3D2]' },
  PAYMENT_RECEIVED: { icon: '💳', bg: 'bg-[#FBF3D2]' },
};
const DEFAULT_NOTIFICATION_VISUAL = { icon: '🔔', bg: 'bg-brand-green/10' };

export function notificationVisual(type: string): { icon: string; bg: string } {
  return NOTIFICATION_VISUALS[type] ?? DEFAULT_NOTIFICATION_VISUAL;
}

export function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
