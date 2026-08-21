'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { agentInitials, IMMOLINK_PHONE_E164, IMMOLINK_EMAIL, waMeHref } from '@/lib/mock/immolink';

export function VisitRequestCard({
  propertyId,
  propertyTitle,
  agent,
  agency,
  views,
  favs,
}: {
  propertyId: string;
  propertyTitle: string;
  agent: string;
  agency: string;
  views: number;
  favs: number;
}) {
  const { toast } = useToast();
  // Starts relative (matches SSR markup, avoids a hydration mismatch); the
  // effect upgrades it to an absolute, shareable URL once mounted.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const propertyUrl = `${origin}/biens/${propertyId}`;
  const whatsappHref = waMeHref(
    IMMOLINK_PHONE_E164,
    `Bonjour ImmoLink, je suis intéressé(e) par « ${propertyTitle} » (${propertyUrl}). Pouvez-vous m'en dire plus ?`,
  );
  const messageHref = `mailto:${IMMOLINK_EMAIL}?subject=${encodeURIComponent(
    `Question sur : ${propertyTitle}`,
  )}&body=${encodeURIComponent(`Bonjour,\n\nJe souhaite en savoir plus sur ce bien : ${propertyUrl}\n\n`)}`;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredAt, setPreferredAt] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: propertyTitle, url: propertyUrl });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    await navigator.clipboard.writeText(propertyUrl);
    toast('Lien copié dans le presse-papiers.');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api(`/api/properties/${propertyId}/visit-requests`, {
        method: 'POST',
        body: {
          name,
          phone,
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(preferredAt ? { preferredAt: new Date(preferredAt).toISOString() } : {}),
        },
      });
      toast('Demande de visite envoyée. L’agent vous recontactera bientôt.');
      setOpen(false);
      setName('');
      setPhone('');
      setPreferredAt('');
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
        <div className="mb-4.5 flex items-center gap-3.25">
          <div className="flex h-13 w-13 items-center justify-center rounded-full bg-linear-to-br from-brand-green to-[#12764A] text-[17px] font-extrabold text-white">
            {agentInitials(agent)}
          </div>
          <div>
            <div className="text-[15.5px] font-extrabold">{agent}</div>
            <div className="text-[12.5px] font-semibold text-brand-muted">{agency} · ⭐ 4,9</div>
          </div>
        </div>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3.25 text-[15px] font-bold text-white"
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-2.5 w-full cursor-pointer rounded-xl bg-brand-green py-3.25 text-[15px] font-bold text-brand-cream"
        >
          Demander une visite
        </button>
        <a
          href={messageHref}
          className="block w-full cursor-pointer rounded-xl border border-brand-green/20 bg-white py-3.25 text-center text-[15px] font-bold text-brand-green"
        >
          Envoyer un message
        </a>
        <div className="mt-4 flex justify-between border-t border-brand-green/10 pt-4 text-[12.5px] font-semibold text-brand-muted2">
          <span>👁 {views} vues</span>
          <span>♡ {favs} favoris</span>
          <button type="button" onClick={onShare} className="cursor-pointer hover:text-brand-green">
            ↗ Partager
          </button>
        </div>
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
                  Demande de visite
                </div>
                <h2 className="font-serif text-2xl font-normal">Planifier une visite</h2>
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
                Date souhaitée (optionnel)
                <input
                  type="datetime-local"
                  value={preferredAt}
                  onChange={(e) => setPreferredAt(e.target.value)}
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
                {submitting ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
