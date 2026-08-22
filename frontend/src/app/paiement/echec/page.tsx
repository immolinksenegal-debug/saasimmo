import Link from 'next/link';
import { IMMOLINK_EMAIL } from '@/lib/mock/immolink';

export default function PaymentFailurePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-red/10 text-3xl">
        ⚠️
      </div>
      <h1 className="font-serif text-3xl">Paiement non abouti</h1>
      <p className="text-[15px] text-brand-muted2">
        Le paiement n&apos;a pas pu être finalisé (annulé ou refusé). Aucun montant n&apos;a été
        débité pour cette tentative. Tu peux réessayer, ou choisir un autre moyen de paiement.
      </p>
      <div className="mt-2 flex gap-3">
        <Link
          href="/dashboard"
          className="im-tap rounded-xl bg-brand-green px-6 py-3 text-sm font-bold text-white"
        >
          Réessayer
        </Link>
        <a
          href={`mailto:${IMMOLINK_EMAIL}`}
          className="im-tap rounded-xl border border-brand-green/20 px-6 py-3 text-sm font-bold text-brand-slate"
        >
          Contacter le support
        </a>
      </div>
    </main>
  );
}
