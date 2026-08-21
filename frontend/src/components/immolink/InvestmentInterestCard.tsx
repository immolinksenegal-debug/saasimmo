'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function InvestmentInterestCard({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api(`/api/investment-projects/${projectId}/interests`, {
        method: 'POST',
        body: {
          name,
          phone,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      toast('Votre intérêt a été transmis au porteur du projet.');
      setOpen(false);
      setName('');
      setPhone('');
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="rounded-3xl border border-brand-green/10 bg-white p-6 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.5)]">
        <h3 className="mb-3.5 text-[15.5px] font-extrabold">Intéressé(e) par ce projet ?</h3>
        <p className="mb-4.5 text-[13.5px] text-brand-muted2">
          Manifestez votre intérêt, le porteur du projet « {projectTitle} » vous recontactera
          directement.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full cursor-pointer rounded-xl bg-brand-green py-3.25 text-[15px] font-bold text-brand-cream"
        >
          Manifester mon intérêt
        </button>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="animate-im-fade fixed inset-0 z-60 flex items-center justify-center bg-brand-green-dark/55 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-im-up w-full max-w-md rounded-3xl bg-brand-cream p-6 sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="mb-1 text-[13px] font-bold tracking-wide text-brand-red uppercase">
                  Investissement
                </div>
                <h2 className="font-serif text-2xl font-normal">Manifester mon intérêt</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
                Nom complet
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
                Téléphone
                <input
                  required
                  type="tel"
                  minLength={6}
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+221 77 000 00 00"
                  className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
                Message (optionnel)
                <textarea
                  maxLength={500}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="resize-none rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
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
                className="mt-1 cursor-pointer rounded-xl bg-brand-green py-3.25 text-[15px] font-bold text-brand-cream disabled:opacity-50"
              >
                {submitting ? 'Envoi…' : 'Envoyer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
