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
          className="cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-brand-green/15" />
        <span className="text-xs font-semibold text-brand-muted2">OU</span>
        <span className="h-px flex-1 bg-brand-green/15" />
      </div>

      <a
        href="/api/auth/oauth/google/start?next=/dashboard"
        className="im-tap flex items-center justify-center gap-3 rounded-xl border border-brand-green/15 bg-white py-3 text-[15px] font-semibold text-brand-ink hover:bg-brand-green/5"
      >
        <GoogleIcon />
        Continuer avec Google
      </a>

      <p className="text-sm text-brand-muted2">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-semibold text-brand-green underline">
          Se connecter
        </Link>
      </p>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
