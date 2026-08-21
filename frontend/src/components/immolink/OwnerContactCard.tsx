// Shows the listing owner's own contact info (phone/WhatsApp/email) so a
// visitor can reach them directly — distinct from `VisitRequestCard`, which
// routes to ImmoLink's own concierge contact. Owner phone is optional
// (set in /settings); the card degrades to email-only when absent.
import { waMeHref } from '@/lib/mock/immolink';

export function OwnerContactCard({
  ownerPhone,
  ownerEmail,
  propertyTitle,
}: {
  ownerPhone: string | null;
  ownerEmail: string;
  propertyTitle: string;
}) {
  const message = `Bonjour, je suis intéressé(e) par votre annonce « ${propertyTitle} » sur ImmoLink.`;
  const whatsappHref = ownerPhone ? waMeHref(ownerPhone, message) : null;
  const mailHref = `mailto:${ownerEmail}?subject=${encodeURIComponent(
    `Question sur : ${propertyTitle}`,
  )}&body=${encodeURIComponent(message)}`;

  return (
    <div className="mt-3.5 rounded-2xl border border-brand-green/10 bg-white p-4.5">
      <h3 className="mb-3 text-[15px] font-extrabold text-brand-ink">
        Coordonnées du propriétaire
      </h3>
      <div className="flex flex-col gap-2.5">
        {ownerPhone && (
          <a
            href={`tel:${ownerPhone}`}
            className="im-tap flex items-center justify-center gap-2 rounded-xl bg-brand-green py-3 text-[14px] font-bold text-brand-cream"
          >
            📞 {ownerPhone}
          </a>
        )}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="im-tap flex items-center justify-center gap-2 rounded-xl border border-brand-green/20 py-3 text-[14px] font-bold text-brand-green"
          >
            💬 WhatsApp
          </a>
        )}
        <a
          href={mailHref}
          className="im-tap flex items-center justify-center gap-2 rounded-xl border border-brand-green/15 py-3 text-[14px] font-bold text-brand-slate"
        >
          ✉️ {ownerEmail}
        </a>
        {!ownerPhone && (
          <p className="text-center text-[12px] font-medium text-brand-muted2">
            Le propriétaire n&apos;a pas renseigné de numéro — contacte-le par email.
          </p>
        )}
      </div>
    </div>
  );
}
