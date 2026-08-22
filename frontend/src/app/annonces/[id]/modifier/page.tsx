'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { DeleteListingButton } from '@/components/immolink/DeleteListingButton';
import { normalizeSenegalPhone } from '@/lib/phone';

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau'] as const;
const MAX_PHOTOS = 3;

interface PropertyDto {
  id: string;
  ownerId: string;
  title: string;
  type: string;
  txn: string;
  city: string;
  quartier: string;
  price: number;
  beds: number;
  baths: number;
  surface: number;
  charges: string;
}

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const user = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [txn, setTxn] = useState<'Vente' | 'Location'>('Vente');
  const [type, setType] = useState<(typeof TYPES)[number]>('Villa');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [quartier, setQuartier] = useState('');
  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('0');
  const [baths, setBaths] = useState('0');
  const [surface, setSurface] = useState('');
  const [charges, setCharges] = useState('');
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
        const res = await api<{ property: PropertyDto }>(`/api/properties/${params.id}`);
        if (cancelled) return;
        if (res.property.ownerId !== user.id) {
          setForbidden(true);
          return;
        }
        const p = res.property;
        setTxn(p.txn === 'Location' ? 'Location' : 'Vente');
        setType(
          TYPES.includes(p.type as (typeof TYPES)[number])
            ? (p.type as (typeof TYPES)[number])
            : 'Villa',
        );
        setTitle(p.title);
        setCity(p.city);
        setQuartier(p.quartier);
        setPrice(String(p.price));
        setBeds(String(p.beds));
        setBaths(String(p.baths));
        setSurface(String(p.surface));
        setCharges(p.charges === 'Non applicable' ? '' : p.charges);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger l’annonce.');
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

      await api(`/api/properties/${params.id}`, {
        method: 'PATCH',
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
      toast('Annonce mise à jour.');
      router.push(`/biens/${params.id}`);
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
        <p className="text-sm text-brand-muted2">
          Cette annonce n&apos;appartient pas à votre compte.
        </p>
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

  const priceLabel = txn === 'Location' ? 'Loyer mensuel (FCFA)' : 'Prix de vente (FCFA)';

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/dashboard" className="text-brand-muted hover:text-brand-red">
          Tableau de bord
        </Link>{' '}
        / Modifier l&apos;annonce
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">Modifier l&apos;annonce</h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Mets à jour les informations de ton bien.
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
                  ? 'border-brand-green bg-brand-green text-white'
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
            Affiché aux visiteurs sur toutes tes annonces. Laisse vide pour ne pas l&apos;afficher.
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
          className="cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>

        <DeleteListingButton
          propertyId={params.id}
          title={title}
          redirectTo="/dashboard"
          className="cursor-pointer rounded-xl border border-brand-red/30 py-3.5 text-[15px] font-bold text-brand-red hover:bg-brand-red/5 disabled:opacity-50"
        />
      </form>
    </main>
  );
}
