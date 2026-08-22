'use client';

import { useEffect, useRef, useState } from 'react';
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
  { label: 'Demandes', href: '/demandes' },
  { label: 'Investir', href: '/investir' },
];

const PUBLISH_ACTIONS = [
  { icon: '🏠', label: 'Publier une annonce', kind: 'packs' as const },
  { icon: '🏗️', label: 'Publier un projet', kind: 'link' as const, href: '/projets-neufs/nouveau' },
  { icon: '🔍', label: 'Publier une demande', kind: 'link' as const, href: '/demandes/nouvelle' },
];

export function Header() {
  const { openPacks } = usePacksModal();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const publishRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!publishOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (publishRef.current && !publishRef.current.contains(e.target as Node)) {
        setPublishOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPublishOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [publishOpen]);

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
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4 sm:px-8 xl:gap-8">
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

          <nav className="hidden gap-5 text-[14.5px] font-semibold text-brand-slate xl:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="shrink-0 text-nowrap text-brand-slate hover:text-brand-red"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3.5">
            <Link
              href="/dashboard"
              className="hidden text-nowrap text-[14.5px] font-semibold text-brand-slate hover:text-brand-red sm:inline"
            >
              Tableau de bord
            </Link>
            <div ref={publishRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setPublishOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={publishOpen}
                className="im-tap inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-green px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-brand-green/20 transition-colors hover:bg-brand-green-dark"
              >
                Publier
                <span
                  aria-hidden
                  className={`text-[10px] transition-transform ${publishOpen ? 'rotate-180' : ''}`}
                >
                  ▾
                </span>
              </button>
              {publishOpen && (
                <div className="absolute top-[calc(100%+10px)] right-0 z-50 flex w-72 flex-col gap-1.5 rounded-2xl border border-brand-green/10 bg-white p-2 shadow-xl">
                  {PUBLISH_ACTIONS.map((action) =>
                    action.kind === 'packs' ? (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          openPacks();
                          setPublishOpen(false);
                        }}
                        className="im-tap flex cursor-pointer items-center gap-3 rounded-xl bg-brand-green px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-brand-green-dark"
                      >
                        <span aria-hidden>{action.icon}</span>
                        {action.label}
                      </button>
                    ) : (
                      <Link
                        key={action.label}
                        href={action.href}
                        onClick={() => setPublishOpen(false)}
                        className="im-tap flex items-center gap-3 rounded-xl bg-brand-green px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-green-dark"
                      >
                        <span aria-hidden>{action.icon}</span>
                        {action.label}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
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
              className="im-tap flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate xl:hidden"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sheet — backdrop + bottom sheet (iOS action-sheet style).
          Rendered as a sibling of <header>, not a descendant, because the
          header's backdrop-blur-md makes it a CSS containing block for
          `position: fixed` descendants (same rule as transform/filter/
          will-change:transform) — a fixed sheet nested inside would
          resolve against the header's own box instead of the viewport and
          collapse to the header's height. Desktop (lg:) is untouched; this
          whole block only ever renders below the lg breakpoint via the
          hamburger button above. */}
      <div
        className={`fixed inset-0 z-50 xl:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={closeMobile}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[28px] bg-brand-cream pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            mobileOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="relative pt-3 pb-1">
            <div className="mx-auto h-[5px] w-10 rounded-full bg-brand-green/15" />
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Fermer le menu"
              tabIndex={mobileOpen ? 0 : -1}
              className="im-tap absolute top-3 right-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/5 text-[13px] text-brand-slate"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-5 px-5 pt-2 text-[15px] font-semibold text-brand-slate">
            <div className="flex flex-col gap-2 sm:hidden">
              <div className="px-1 text-[11px] font-bold tracking-wider text-brand-muted2 uppercase">
                Publier
              </div>
              {PUBLISH_ACTIONS.map((action) =>
                action.kind === 'packs' ? (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      openPacks();
                      closeMobile();
                    }}
                    tabIndex={mobileOpen ? 0 : -1}
                    className="im-tap flex cursor-pointer items-center gap-2.5 rounded-xl bg-brand-green px-4 py-3.5 text-[15px] font-bold text-white"
                  >
                    <span aria-hidden>{action.icon}</span>
                    {action.label}
                  </button>
                ) : (
                  <Link
                    key={action.label}
                    href={action.href}
                    onClick={closeMobile}
                    tabIndex={mobileOpen ? 0 : -1}
                    className="im-tap flex items-center gap-2.5 rounded-xl bg-brand-green px-4 py-3.5 text-[15px] font-bold text-white"
                  >
                    <span aria-hidden>{action.icon}</span>
                    {action.label}
                  </Link>
                ),
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="px-1 text-[11px] font-bold tracking-wider text-brand-muted2 uppercase">
                Naviguer
              </div>
              <div className="divide-y divide-brand-green/8 overflow-hidden rounded-2xl border border-brand-green/8 bg-white">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={closeMobile}
                    tabIndex={mobileOpen ? 0 : -1}
                    className="im-tap flex items-center justify-between gap-3 px-4 py-3.5 active:bg-brand-green/5"
                  >
                    {link.label}
                    <span aria-hidden className="text-brand-muted2">
                      ›
                    </span>
                  </Link>
                ))}
                <Link
                  href="/dashboard"
                  onClick={closeMobile}
                  tabIndex={mobileOpen ? 0 : -1}
                  className="im-tap flex items-center justify-between gap-3 px-4 py-3.5 active:bg-brand-green/5 sm:hidden"
                >
                  Tableau de bord
                  <span aria-hidden className="text-brand-muted2">
                    ›
                  </span>
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2 pb-1">
              <div className="px-1 text-[11px] font-bold tracking-wider text-brand-muted2 uppercase">
                Compte
              </div>
              <div className="overflow-hidden rounded-2xl border border-brand-green/8 bg-white">
                {user ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    tabIndex={mobileOpen ? 0 : -1}
                    className="im-tap flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left active:bg-brand-green/5"
                  >
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-linear-to-br from-brand-red to-brand-red-dark text-xs font-bold text-white">
                      {initials}
                    </span>
                    Se déconnecter
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={closeMobile}
                    tabIndex={mobileOpen ? 0 : -1}
                    className="im-tap flex items-center justify-between gap-3 px-4 py-3.5 active:bg-brand-green/5 sm:hidden"
                  >
                    Connexion
                    <span aria-hidden className="text-brand-muted2">
                      ›
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
