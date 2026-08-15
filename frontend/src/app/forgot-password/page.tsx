'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_FORGOT_ATTEMPTS') {
        setError('Trop de demandes pour cet email. Réessaie dans une heure.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="animate-im-fade mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4 py-16 sm:px-8">
        <div>
          <h1 className="font-serif text-3xl">Vérifie ton email</h1>
          <p className="mt-1.5 text-[15px] text-brand-muted2">
            Si un compte existe pour <strong className="text-brand-ink">{email}</strong>, un code de
            réinitialisation vient d&apos;être envoyé.
          </p>
        </div>
        <p className="text-sm text-brand-muted2">
          <Link
            href={`/reset-password?email=${encodeURIComponent(email)}`}
            className="im-tap font-semibold text-brand-green underline"
          >
            J&apos;ai déjà mon code
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="animate-im-fade mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <div>
        <h1 className="font-serif text-3xl">Mot de passe oublié ?</h1>
        <p className="mt-1.5 text-[15px] text-brand-muted2">
          Entre ton email, on t&apos;envoie un code pour le réinitialiser.
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
        {error && (
          <p role="alert" className="text-sm font-semibold text-brand-red">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="im-tap cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-brand-cream disabled:opacity-50"
        >
          {submitting ? 'Envoi…' : 'Envoyer le code'}
        </button>
      </form>
      <p className="text-sm text-brand-muted2">
        Tu t&apos;en souviens ?{' '}
        <Link href="/login" className="im-tap font-semibold text-brand-green underline">
          Se connecter
        </Link>
        .
      </p>
    </main>
  );
}
