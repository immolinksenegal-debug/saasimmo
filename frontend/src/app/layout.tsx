import type { Metadata } from 'next';
import { Manrope, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { PacksModalProvider } from '@/contexts/PacksModalContext';
import { Header } from '@/components/immolink/Header';
import { Footer } from '@/components/immolink/Footer';
import { PacksModal } from '@/components/immolink/PacksModal';

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
  title: 'ImmoLink Sénégal — L’immobilier du Sénégal réuni',
  description:
    'Acheter, louer, vendre ou investir — particuliers, agences et promoteurs réunis sur une seule plateforme premium.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${manrope.variable} ${instrumentSerif.variable}`}>
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
