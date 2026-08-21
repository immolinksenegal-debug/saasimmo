'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

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
    <>
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
              className="im-tap hidden cursor-pointer rounded-full bg-brand-green px-5 py-2.5 text-sm font-bold text-brand-cream sm:inline-flex"
            >
              Publier une annonce
            </button>
            {user ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onLogout}
                  title="Se déconnecter"
                  className="flex h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center rounded-full bg-linear-to-br from-brand-red to-brand-red-dark text-sm font-bold text-white"
                >
                  {initials}
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="im-tap hidden cursor-pointer text-[14.5px] font-semibold text-brand-slate hover:text-brand-red sm:inline"
                >
                  Se déconnecter
                </button>
              </div>
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
              className="im-tap flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate lg:hidden"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer — backdrop + slide-in panel. Rendered as a sibling of
          <header>, not a descendant, because the header's backdrop-blur-md
          makes it a CSS containing block for `position: fixed` descendants
          (same rule as transform/filter/will-change:transform) — a fixed
          drawer nested inside would resolve against the header's own box
          instead of the viewport and collapse to the header's height.
          Desktop (lg:) is untouched; this whole block only ever renders
          below the lg breakpoint via the hamburger button above. */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={closeMobile}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`absolute top-0 right-0 flex h-full w-[85vw] max-w-90 flex-col gap-1 overflow-y-auto bg-brand-cream px-5 py-5 text-[15px] font-semibold text-brand-slate shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Fermer le menu"
            tabIndex={mobileOpen ? 0 : -1}
            className="im-tap mb-3 ml-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => {
              openPacks();
              closeMobile();
            }}
            tabIndex={mobileOpen ? 0 : -1}
            className="im-tap mb-4 cursor-pointer rounded-full bg-brand-green px-5 py-3.5 text-center text-[15px] font-bold text-brand-cream sm:hidden"
          >
            Publier une annonce
          </button>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={closeMobile}
              tabIndex={mobileOpen ? 0 : -1}
              className="im-tap rounded-lg px-2 py-3 hover:bg-brand-green/8 hover:text-brand-red"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            tabIndex={mobileOpen ? 0 : -1}
            className="im-tap rounded-lg px-2 py-3 hover:bg-brand-green/8 hover:text-brand-red sm:hidden"
          >
            Tableau de bord
          </Link>
          <div className="mt-3 border-t border-brand-green/10 pt-3">
            {user ? (
              <button
                type="button"
                onClick={onLogout}
                tabIndex={mobileOpen ? 0 : -1}
                className="im-tap flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-brand-green/8 hover:text-brand-red"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-linear-to-br from-brand-red to-brand-red-dark text-sm font-bold text-white">
                  {initials}
                </span>
                Se déconnecter
              </button>
            ) : (
              <Link
                href="/login"
                onClick={closeMobile}
                tabIndex={mobileOpen ? 0 : -1}
                className="im-tap block rounded-lg px-2 py-3 hover:bg-brand-green/8 hover:text-brand-red sm:hidden"
              >
                Connexion
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
