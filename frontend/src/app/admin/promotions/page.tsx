'use client';

// /admin/promotions — manage the homepage promo banner (ImmoLink's own ads
// or a paying client's) without needing a redeploy. Gated by the
// /api/admin/banners routes themselves (requireAdmin('ADMIN')) — a non-admin
// signed-in user simply gets ADMIN_REQUIRED back and sees "Accès refusé"
// below; there's no separate client-side role check.

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AdminNav } from '@/components/immolink/AdminNav';

interface Banner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  active: boolean;
  createdAt: string;
}

export default function AdminPromotionsPage() {
  const user = useUser();
  const { toast } = useToast();

  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadBanners() {
    try {
      const res = await api<{ banners: Banner[] }>('/api/admin/banners');
      setBanners(res.banners);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        setForbidden(true);
      } else {
        setLoadError(err instanceof ApiError ? err.message : 'Erreur réseau.');
      }
    }
  }

  useEffect(() => {
    if (user) void loadBanners();
  }, [user]);

  if (!user) return null;

  if (forbidden) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-bold">Accès refusé</h1>
        <p className="text-sm text-gray-600">
          Cette page est réservée aux administrateurs d&apos;ImmoLink Sénégal.
        </p>
        <Link href="/dashboard" className="text-sm text-brand-green underline">
          Retour au tableau de bord
        </Link>
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!file) {
      setFormError('Choisis une image.');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file);
      await api('/api/admin/banners', {
        method: 'POST',
        body: { imageUrl: uploaded.url, linkUrl: linkUrl.trim() || undefined },
      });
      setFile(null);
      setLinkUrl('');
      toast(
        'Publicité publiée — elle apparaît maintenant en haut de la page d’accueil.',
        'success',
      );
      await loadBanners();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggleActive(banner: Banner) {
    setBusyId(banner.id);
    try {
      await api(`/api/admin/banners/${banner.id}`, {
        method: 'PATCH',
        body: { active: !banner.active },
      });
      await loadBanners();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(banner: Banner) {
    if (!window.confirm('Supprimer définitivement cette publicité ?')) return;
    setBusyId(banner.id);
    try {
      await api(`/api/admin/banners/${banner.id}`, { method: 'DELETE' });
      toast('Publicité supprimée.', 'success');
      await loadBanners();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-12">
      <AdminNav />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Publicités — page d&apos;accueil</h1>
        <p className="text-sm text-gray-600">
          Publie une image (pour toi ou pour un client) — elle s&apos;affiche en haut de la page
          d&apos;accueil, sans avoir besoin de redéployer. Une seule publicité active à la fois : la
          plus récente que tu actives remplace l&apos;ancienne.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5">
        <h2 className="text-lg font-semibold">Nouvelle publicité</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Lien (optionnel — où va le clic, ex. la page d&apos;un client)
            <input
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? 'Publication…' : 'Publier'}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Publicités existantes</h2>
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {banners === null && !loadError && <p className="text-sm text-gray-600">Chargement…</p>}
        {banners?.length === 0 && (
          <p className="text-sm text-gray-600">Aucune publicité pour le moment.</p>
        )}
        {banners?.map((b) => (
          <div key={b.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
            <div className="relative h-16 w-28 flex-none overflow-hidden rounded-md bg-gray-100">
              <Image src={b.imageUrl} alt="" fill className="object-cover" />
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium">
                {b.active ? (
                  <span className="text-emerald-700">Active</span>
                ) : (
                  <span className="text-gray-500">Désactivée</span>
                )}
              </div>
              {b.linkUrl && (
                <a
                  href={b.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-brand-green underline"
                >
                  {b.linkUrl}
                </a>
              )}
              <div className="text-xs text-gray-500">
                {new Date(b.createdAt).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <div className="flex flex-none gap-3">
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => onToggleActive(b)}
                className="text-xs font-bold text-brand-green underline disabled:opacity-50"
              >
                {b.active ? 'Désactiver' : 'Activer'}
              </button>
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => onDelete(b)}
                className="text-xs font-bold text-red-600 underline disabled:opacity-50"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </section>

      <Link href="/dashboard" className="text-center text-sm text-gray-600 underline">
        Retour au dashboard
      </Link>
    </main>
  );
}
