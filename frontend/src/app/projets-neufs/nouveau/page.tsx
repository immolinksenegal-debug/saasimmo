'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { normalizeSenegalPhone } from '@/lib/phone';

const TYPES = ['Résidentiel', 'Terrain', 'Bureau', 'Mixte'] as const;
const STATUSES = ['En cours', 'Sur plan', 'Livré'] as const;
const MAX_PHOTOS = 3;

export default function NewInvestmentProjectPage() {
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('Résidentiel');
  const [city, setCity] = useState('Dakar');
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

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    setPhotos(files);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (photos.length === 0) {
      setError('Ajoutez au moins une photo du projet.');
      return;
    }

    setSubmitting(true);
    try {
      const normalizedPhone = normalizeSenegalPhone(phone);
      if (user && normalizedPhone !== (user.phone ?? '')) {
        await api('/api/auth/me', { method: 'PATCH', body: { phone: normalizedPhone } });
      }

      const uploaded = await Promise.all(photos.map((f) => uploadFile(f)));
      const images = uploaded.map((u) => u.url);

      const res = await api<{ id: string }>('/api/investment-projects', {
        method: 'POST',
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
          images,
        },
      });
      toast('Projet publié avec succès.');
      router.push(`/projets-neufs/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/projets-neufs" className="text-brand-muted hover:text-brand-red">
          Projets neufs
        </Link>{' '}
        / Publier mon projet
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">
        Publier un projet d&apos;investissement
      </h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Présentez votre programme immobilier neuf aux investisseurs d&apos;ImmoLink.
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
            placeholder="Les Jardins d'Almadies"
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
            placeholder="Prestige Immo Développement"
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
            Photos du projet ({MAX_PHOTOS} max, au moins 1 requise)
          </span>
          <input
            required
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPickPhotos}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-sm text-brand-slate"
          />
          {photos.length > 0 && (
            <p className="text-xs font-semibold text-brand-muted">
              {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée
              {photos.length > 1 ? 's' : ''}.
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
          {submitting ? 'Publication…' : 'Publier le projet'}
        </button>
      </form>
    </main>
  );
}
