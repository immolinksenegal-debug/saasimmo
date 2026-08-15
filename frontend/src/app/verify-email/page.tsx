'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) {
      void verify(qEmail, qCode);
    }
    // Only run on mount — verify() itself is stable enough for this one-shot check.
  }, []);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(email, code);
  }

  async function onResend() {
    setResending(true);
    setError(null);
    setResent(false);
    try {
      await api('/api/auth/resend-verification', {
        method: 'POST',
        body: { email },
      });
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="animate-im-fade mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <div>
        <h1 className="font-serif text-3xl">Vérifie ton email</h1>
        <p className="mt-1.5 text-[15px] text-brand-muted2">
          Un code à 8 caractères a été envoyé à ton adresse. Il expire dans 15 minutes.
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
          Code de vérification
          <input
            type="text"
            required
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 font-mono text-[15px] font-medium tracking-widest text-brand-ink uppercase outline-none focus:border-brand-green"
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
          className="cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-brand-cream disabled:opacity-50"
        >
          {submitting ? 'Vérification…' : 'Vérifier'}
        </button>
      </form>
      <p className="text-sm text-brand-muted2">
        Pas reçu de code ?{' '}
        <button
          type="button"
          onClick={onResend}
          disabled={!email || resending}
          className="cursor-pointer font-semibold text-brand-green underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending ? 'Envoi…' : 'Renvoyer le code'}
        </button>
        {resent && (
          <span className="mt-1 block font-semibold text-brand-green">
            Si un compte existe pour cet email, un nouveau code vient d&apos;être envoyé.
          </span>
        )}
      </p>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
