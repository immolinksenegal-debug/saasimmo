'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePacksModal } from '@/contexts/PacksModalContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { PACKS, type Pack } from '@/lib/mock/immolink';

export function PacksModal() {
  const { open, closePacks } = usePacksModal();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  if (!open) return null;

  async function choosePack(pk: Pack) {
    if (pk.action === 'create') {
      closePacks();
      router.push('/annonces/nouvelle');
      return;
    }
    if (pk.action === 'contact') {
      closePacks();
      return;
    }
    // 'checkout' — Standard/Premium
    if (!user) {
      closePacks();
      toast('Connecte-toi pour souscrire à un pack.', 'info');
      router.push('/login');
      return;
    }
    setCheckingOut(pk.name);
    try {
      const res = await api<{ paymentUrl: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: { plan: pk.planId },
      });
      window.location.href = res.paymentUrl;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PAYMENT_PROVIDER_UNCONFIGURED') {
        toast(
          'Paiement pas encore configuré côté ImmoLink — contacte-nous pour activer ce pack.',
          'info',
        );
      } else {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
      }
    } finally {
      setCheckingOut(null);
    }
  }

  return (
    <div
      onClick={closePacks}
      className="animate-im-fade fixed inset-0 z-60 flex items-center justify-center bg-brand-green-dark/55 p-4 backdrop-blur-sm sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="im-scroll animate-im-up max-h-[88vh] w-full max-w-4xl overflow-auto rounded-3xl bg-brand-cream p-6 sm:p-9"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="mb-1.5 text-[13px] font-bold tracking-wide text-brand-red uppercase">
              Choisissez votre pack
            </div>
            <h2 className="font-serif text-3xl font-normal sm:text-4xl">Publier une annonce</h2>
          </div>
          <button
            type="button"
            onClick={closePacks}
            aria-label="Fermer"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-xl font-bold"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKS.map((pk) => (
            <div key={pk.name} className={`relative rounded-2xl px-5.5 py-6.5 ${pk.card}`}>
              {pk.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-red px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-white">
                  POPULAIRE
                </span>
              )}
              <div className="mb-2.5 text-[13px] font-bold tracking-wide opacity-70 uppercase">
                {pk.name}
              </div>
              <div className="mb-0.5 font-serif text-3xl">{pk.price}</div>
              <div className="mb-4.5 text-[12.5px] opacity-65">{pk.per}</div>
              <div className="mb-5.5 flex flex-col gap-2.5">
                {pk.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-[13.5px] font-medium">
                    <span className={pk.check}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => choosePack(pk)}
                disabled={checkingOut === pk.name}
                className={`w-full cursor-pointer rounded-xl py-3 text-sm font-bold disabled:opacity-50 ${pk.button}`}
              >
                {checkingOut === pk.name ? 'Redirection…' : pk.cta}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5.5 text-center text-[13px] font-semibold text-brand-muted2">
          Paiement sécurisé · Wave · Orange Money · Free Money · Stripe · Visa · Mastercard
        </div>
      </div>
    </div>
  );
}
