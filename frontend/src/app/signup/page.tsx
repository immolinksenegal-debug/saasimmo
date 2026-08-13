'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: { email, password },
      });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="animate-im-fade mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <div>
        <h1 className="font-serif text-3xl">Créer un compte</h1>
        <p className="mt-1.5 text-[15px] text-brand-muted2">
          Publie tes annonces et gère ton espace vendeur.
        </p>
      </div>
      <div className="rounded-xl border border-brand-red/25 bg-[#FBF3D2] px-4 py-3 text-[13px] font-medium text-[#6E1010]">
        L&apos;envoi d&apos;email n&apos;est pas configuré sur cette instance de démo (Resend) — la
        vérification de compte ne pourra pas se terminer. Utilise plutôt le{' '}
        <Link href="/login" className="underline">
          compte de test
        </Link>{' '}
        pour explorer l&apos;espace vendeur dès maintenant.
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Mot de passe
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
          <span className="text-xs font-medium text-brand-muted">Au moins 10 caractères.</span>
        </label>
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
          {submitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
      <p className="text-sm text-brand-muted2">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-semibold text-brand-green underline">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
