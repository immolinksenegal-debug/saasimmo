import type { Metadata } from 'next';
import { Manrope, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { PacksModalProvider } from '@/contexts/PacksModalContext';
import { Header } from '@/components/immolink/Header';
import { Footer } from '@/components/immolink/Footer';
import { PacksModal } from '@/components/immolink/PacksModal';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

const TITLE = 'ImmoLink Sénégal — L’immobilier du Sénégal réuni';
const DESCRIPTION =
  'Acheter, louer, vendre ou investir au Sénégal — particuliers, agences et promoteurs réunis sur une seule plateforme premium. Annonces à Dakar, Almadies, Thiès et partout au Sénégal.';

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/immolink-emblem.png`,
  areaServed: { '@type': 'Country', name: 'Sénégal' },
  sameAs: [
    'https://www.facebook.com/reel/1208687211473504',
    'https://www.instagram.com/immolinksenegal',
  ],
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/recherche?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  keywords: [
    'immobilier Sénégal',
    'immobilier Dakar',
    'appartement à louer Dakar',
    'villa à vendre Sénégal',
    'terrain Sénégal',
    'agence immobilière Sénégal',
    'ImmoLink',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_SN',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/immolink-emblem.png', width: 512, height: 512, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/immolink-emblem.png'],
  },
  icons: {
    icon: '/immolink-emblem.png',
    apple: '/immolink-emblem.png',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${manrope.variable} ${instrumentSerif.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
      </head>
      <body className="font-sans">
        <ToastProvider>
          <AuthProvider>
            <PacksModalProvider>
              <div className="min-h-screen bg-brand-cream">
                <Header />
                {children}
                <Footer />
              </div>
              <PacksModal />
            </PacksModalProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
