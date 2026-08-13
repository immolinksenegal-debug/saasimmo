'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau'] as const;
const MAX_PHOTOS = 3;

export default function NewListingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [txn, setTxn] = useState<'Vente' | 'Location'>('Vente');
  const [type, setType] = useState<(typeof TYPES)[number]>('Villa');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('Dakar');
  const [quartier, setQuartier] = useState('');
  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('0');
  const [baths, setBaths] = useState('0');
  const [surface, setSurface] = useState('');
  const [charges, setCharges] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    setPhotos(files);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let images: string[] = [];
      if (user && photos.length > 0) {
        const uploaded = await Promise.all(photos.map((f) => uploadFile(f)));
        images = uploaded.map((u) => u.url);
      }

      const res = await api<{ id: string }>('/api/properties', {
        method: 'POST',
        body: {
          title,
          type,
          txn,
          city,
          quartier,
          price: Number(price),
          beds: Number(beds),
          baths: Number(baths),
          surface: Number(surface),
          ...(charges.trim() ? { charges: charges.trim() } : {}),
          ...(images.length ? { images } : {}),
        },
      });
      toast('Annonce publiée avec succès.');
      router.push(`/biens/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  const priceLabel = txn === 'Location' ? 'Loyer mensuel (FCFA)' : 'Prix de vente (FCFA)';

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/dashboard" className="text-brand-muted hover:text-brand-red">
          Tableau de bord
        </Link>{' '}
        / Nouvelle annonce
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">Publier une annonce</h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Décris ton bien — l&apos;annonce sera visible immédiatement sur ImmoLink.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          {(['Vente', 'Location'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTxn(t)}
              className={`cursor-pointer rounded-xl border py-3 text-sm font-bold ${
                txn === t
                  ? 'border-brand-green bg-brand-green text-brand-cream'
                  : 'border-brand-green/15 bg-white text-brand-slate'
              }`}
            >
              {t === 'Vente' ? 'À vendre' : 'À louer'}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Titre de l&apos;annonce
          <input
            required
            minLength={5}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Villa contemporaine avec piscine"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Type de bien
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
              placeholder="Les Almadies"
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          {priceLabel}
          <input
            required
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="185000000"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Chambres
            <input
              type="number"
              min={0}
              value={beds}
              onChange={(e) => setBeds(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Salles de bain
            <input
              type="number"
              min={0}
              value={baths}
              onChange={(e) => setBaths(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Surface (m²)
            <input
              required
              type="number"
              min={1}
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Charges (optionnel)
          <input
            value={charges}
            onChange={(e) => setCharges(e.target.value)}
            placeholder="75 000 FCFA/mois"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-brand-slate">Photos ({MAX_PHOTOS} max)</span>
          {user ? (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={onPickPhotos}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-sm text-brand-slate"
            />
          ) : (
            <p className="rounded-xl border border-brand-green/15 bg-brand-green/5 px-4 py-3 text-[13px] font-medium text-brand-muted2">
              Connecte-toi pour ajouter tes propres photos — sans session, l&apos;annonce est
              publiée avec une photo d&apos;illustration par défaut.
            </p>
          )}
          {photos.length > 0 && (
            <p className="text-xs font-semibold text-brand-muted">
              {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée
              {photos.length > 1 ? 's' : ''}
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
          {submitting ? 'Publication…' : 'Publier l’annonce'}
        </button>
      </form>
    </main>
  );
}
