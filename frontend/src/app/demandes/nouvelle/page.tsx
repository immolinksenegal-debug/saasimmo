'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe'] as const;

export default function NewPropertyRequestPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [txn, setTxn] = useState<'Vente' | 'Location'>('Location');
  const [type, setType] = useState<(typeof TYPES)[number]>('Appartement');
  const [city, setCity] = useState('Dakar');
  const [quartier, setQuartier] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [bedsMin, setBedsMin] = useState('0');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/property-requests', {
        method: 'POST',
        body: {
          txn,
          type,
          city,
          ...(quartier.trim() ? { quartier: quartier.trim() } : {}),
          budgetMax: Number(budgetMax),
          bedsMin: Number(bedsMin),
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      toast('Demande publiée avec succès.');
      router.push('/demandes');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'VALIDATION_FAILED'
            ? 'Certains champs sont invalides — vérifie tes informations et réessaie.'
            : err.message,
        );
      } else {
        setError('Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="mx-auto flex min-h-100 max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-brand-muted2">Chargement…</p>
      </main>
    );
  }

  const budgetLabel = txn === 'Location' ? 'Budget mensuel max (FCFA)' : 'Budget max (FCFA)';

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/demandes" className="text-brand-muted hover:text-brand-red">
          Demandes de recherche
        </Link>{' '}
        / Nouvelle demande
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">Publier une demande</h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Décris ce que tu cherches — les agences et propriétaires pourront te contacter directement.
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
              {t === 'Vente' ? 'Je veux acheter' : 'Je veux louer'}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Type de bien recherché
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
            Quartier (optionnel)
            <input
              value={quartier}
              onChange={(e) => setQuartier(e.target.value)}
              placeholder="Les Almadies"
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          {budgetLabel}
          <input
            required
            type="number"
            min={1}
            max={2_000_000_000}
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            placeholder="150000"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Chambres minimum (optionnel)
          <input
            type="number"
            min={0}
            value={bedsMin}
            onChange={(e) => setBedsMin(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Message (optionnel)
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Précise tes critères : budget, délai, quartiers acceptables…"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        {!user.phone && (
          <p className="rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-xs font-medium text-brand-slate">
            Ajoute un{' '}
            <Link href="/settings" className="font-bold text-brand-green hover:text-brand-red">
              numéro de téléphone dans tes paramètres
            </Link>{' '}
            avant de publier — sans lui, personne ne pourra te contacter.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-brand-red">
            {error}
          </p>
        )}

        <span className="text-xs font-medium text-brand-muted">
          Ton numéro de téléphone (renseigné dans tes paramètres) sera affiché publiquement sur
          cette demande pour que les agences puissent te contacter.
        </span>

        <button
          type="submit"
          disabled={submitting}
          className="cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-brand-cream disabled:opacity-50"
        >
          {submitting ? 'Publication…' : 'Publier la demande'}
        </button>
      </form>
    </main>
  );
}
