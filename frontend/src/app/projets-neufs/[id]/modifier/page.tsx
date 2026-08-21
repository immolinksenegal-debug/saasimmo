'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { DeleteProjectButton } from '@/components/immolink/DeleteProjectButton';
import { normalizeSenegalPhone } from '@/lib/phone';

const TYPES = ['Résidentiel', 'Terrain', 'Bureau', 'Mixte'] as const;
const STATUSES = ['En cours', 'Sur plan', 'Livré'] as const;
const MAX_PHOTOS = 3;

interface InvestmentProjectDto {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  type: string;
  city: string;
  quartier: string;
  priceFrom: number;
  lotsLabel: string;
  status: string;
  developerName: string | null;
}

export default function EditInvestmentProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const user = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('Résidentiel');
  const [city, setCity] = useState('');
  const [quartier, setQuartier] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [lotsLabel, setLotsLabel] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('En cours');
  const [developerName, setDeveloperName] = useState('');
  const [phone, setPhone] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setPhone(user.phone ?? '');
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ project: InvestmentProjectDto }>(
          `/api/investment-projects/${params.id}`,
        );
        if (cancelled) return;
        if (res.project.ownerId !== user.id) {
          setForbidden(true);
          return;
        }
        const p = res.project;
        setTitle(p.title);
        setDescription(p.description);
        setType(
          TYPES.includes(p.type as (typeof TYPES)[number])
            ? (p.type as (typeof TYPES)[number])
            : 'Résidentiel',
        );
        setCity(p.city);
        setQuartier(p.quartier);
        setPriceFrom(String(p.priceFrom));
        setLotsLabel(p.lotsLabel);
        setStatus(
          STATUSES.includes(p.status as (typeof STATUSES)[number])
            ? (p.status as (typeof STATUSES)[number])
            : 'En cours',
        );
        setDeveloperName(p.developerName ?? '');
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger le projet.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, user]);

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    setPhotos(files);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const normalizedPhone = normalizeSenegalPhone(phone);
      if (user && normalizedPhone !== (user.phone ?? '')) {
        await api('/api/auth/me', { method: 'PATCH', body: { phone: normalizedPhone } });
      }

      let images: string[] = [];
      if (photos.length > 0) {
        const uploaded = await Promise.all(photos.map((f) => uploadFile(f)));
        images = uploaded.map((u) => u.url);
      }

      await api(`/api/investment-projects/${params.id}`, {
        method: 'PATCH',
        body: {
          title,
          description,
          type,
          city,
          quartier,
          priceFrom: Number(priceFrom),
          lotsLabel,
          status,
          ...(developerName.trim() ? { developerName: developerName.trim() } : {}),
          ...(images.length ? { images } : {}),
        },
      });
      toast('Projet mis à jour.');
      router.push(`/projets-neufs/${params.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl items-center justify-center px-4">
        <p className="text-sm font-semibold text-brand-muted2">Chargement…</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-serif text-2xl">Accès refusé</h1>
        <p className="text-sm text-brand-muted2">Ce projet n&apos;appartient pas à votre compte.</p>
        <Link href="/dashboard" className="font-semibold text-brand-green underline">
          Retour au tableau de bord
        </Link>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-brand-red">{loadError}</p>
        <Link href="/dashboard" className="font-semibold text-brand-green underline">
          Retour au tableau de bord
        </Link>
      </main>
    );
  }

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/dashboard" className="text-brand-muted hover:text-brand-red">
          Tableau de bord
        </Link>{' '}
        / Modifier le projet
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">Modifier le projet</h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Mets à jour les informations de ton projet d&apos;investissement.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Titre du projet
          <input
            required
            minLength={5}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Description
          <textarea
            required
            minLength={20}
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="resize-none rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Type de projet
          <select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Ville
            <input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Quartier
            <input
              required
              value={quartier}
              onChange={(e) => setQuartier(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Prix de départ (FCFA)
          <input
            required
            type="number"
            min={1}
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Lots (ex: 48 lots, 120 apparts)
            <input
              required
              minLength={2}
              maxLength={60}
              value={lotsLabel}
              onChange={(e) => setLotsLabel(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Statut
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Nom du promoteur / projet (optionnel)
          <input
            maxLength={100}
            value={developerName}
            onChange={(e) => setDeveloperName(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Téléphone de contact
          <input
            type="tel"
            placeholder="+221771234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
          <span className="text-xs font-medium text-brand-muted">
            Affiché aux investisseurs intéressés par ce projet.
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-brand-slate">
            Remplacer les photos ({MAX_PHOTOS} max, optionnel)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPickPhotos}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-sm text-brand-slate"
          />
          {photos.length > 0 && (
            <p className="text-xs font-semibold text-brand-muted">
              {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée
              {photos.length > 1 ? 's' : ''} — remplacera{photos.length > 1 ? 'ont' : ''} les photos
              actuelles.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold text-brand-red">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-brand-cream disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>

        <DeleteProjectButton
          projectId={params.id}
          title={title}
          redirectTo="/dashboard"
          className="cursor-pointer rounded-xl border border-brand-red/30 py-3.5 text-[15px] font-bold text-brand-red hover:bg-brand-red/5 disabled:opacity-50"
        />
      </form>
    </main>
  );
}
