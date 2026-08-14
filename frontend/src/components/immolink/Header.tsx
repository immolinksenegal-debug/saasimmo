'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePacksModal } from '@/contexts/PacksModalContext';
import { useAuth } from '@/contexts/AuthContext';

const NAV_LINKS = [
  { label: 'Acheter', href: '/recherche?txn=vente' },
  { label: 'Louer', href: '/recherche?txn=location' },
  { label: 'Projets neufs', href: '/projets-neufs' },
  { label: 'Agences', href: '/agences' },
  { label: 'Investir', href: '/investir' },
];

export function Header() {
  const { openPacks } = usePacksModal();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = user ? user.email.slice(0, 2).toUpperCase() : null;

  function closeMobile() {
    setMobileOpen(false);
  }

  async function onLogout() {
    await logout();
    closeMobile();
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-brand-green/10 bg-brand-cream/86 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/immolink-emblem.png"
            width={50}
            height={38}
            className="block object-contain"
            alt="ImmoLink Sénégal"
            priority
          />
          <span className="leading-none">
            <span className="block text-xl font-extrabold tracking-tight">
              <span className="text-brand-green">Immo</span>
              <span className="text-brand-red">Link</span>
            </span>
            <span className="mt-0.5 block text-[10px] font-extrabold tracking-[.34em] text-brand-gold">
              SÉNÉGAL
            </span>
          </span>
        </Link>

        <nav className="hidden gap-6 text-[14.5px] font-semibold text-brand-slate lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-brand-slate hover:text-brand-red"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3.5">
          <Link
            href="/dashboard"
            className="hidden text-[14.5px] font-semibold text-brand-slate hover:text-brand-red sm:inline"
          >
            Tableau de bord
          </Link>
          <button
            type="button"
            onClick={openPacks}
            className="hidden cursor-pointer rounded-full bg-brand-green px-5 py-2.5 text-sm font-bold text-brand-cream sm:inline-flex"
          >
            Publier une annonce
          </button>
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              title="Se déconnecter"
              className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full bg-linear-to-br from-brand-red to-brand-red-dark text-sm font-bold text-white"
            >
              {initials}
            </button>
          ) : (
            <Link
              href="/login"
              className="hidden text-[14.5px] font-semibold text-brand-slate hover:text-brand-red sm:inline"
            >
              Connexion
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate lg:hidden"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-brand-green/10 bg-brand-cream px-4 py-3 text-[14.5px] font-semibold text-brand-slate lg:hidden">
          <button
            type="button"
            onClick={() => {
              openPacks();
              closeMobile();
            }}
            className="mb-1 cursor-pointer rounded-full bg-brand-green px-5 py-3 text-center text-sm font-bold text-brand-cream sm:hidden"
          >
            Publier une annonce
          </button>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={closeMobile}
              className="rounded-lg px-2 py-2.5 hover:bg-brand-green/8 hover:text-brand-red"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="rounded-lg px-2 py-2.5 hover:bg-brand-green/8 hover:text-brand-red sm:hidden"
          >
            Tableau de bord
          </Link>
          {!user && (
            <Link
              href="/login"
              onClick={closeMobile}
              className="mt-1 rounded-lg border-t border-brand-green/10 px-2 pt-3.5 pb-1 hover:text-brand-red sm:hidden"
            >
              Connexion
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
