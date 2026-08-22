import Link from 'next/link';
import { prisma } from '@/lib/server/prisma';
import { optionalAuth } from '@/lib/server/middleware';
import { SUBSCRIPTION_PLANS, isSubscriptionPlan } from '@/lib/server/subscriptions/plans';
import { formatFcfa } from '@/lib/mock/immolink';

export const runtime = 'nodejs';

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ o?: string }>;
}) {
  const { o } = await searchParams;
  const auth = await optionalAuth();

  const order = o ? await prisma.order.findUnique({ where: { id: o } }) : null;
  // Only show financial specifics to the order's own owner — the link is
  // low-sensitivity (random cuid) but there's no reason to leak amount/plan
  // to anyone who merely has the URL.
  const own = order && auth && order.userId === auth.user.sub ? order : null;
  const meta = (own?.metadata ?? {}) as Record<string, unknown>;
  const planLabel =
    typeof meta.plan === 'string' && isSubscriptionPlan(meta.plan)
      ? SUBSCRIPTION_PLANS[meta.plan].label
      : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-green/10 text-3xl">
        ✅
      </div>
      <h1 className="font-serif text-3xl">Paiement reçu</h1>
      {own ? (
        <p className="text-[15px] text-brand-muted2">
          {own.status === 'PAID' ? (
            <>
              {planLabel ? `Ton pack ${planLabel} est activé` : 'Ton pack est activé'} — merci pour
              ton paiement de {formatFcfa(own.amount)} FCFA.
            </>
          ) : (
            <>
              Ton paiement de {formatFcfa(own.amount)} FCFA a bien été reçu
              {planLabel ? ` pour le pack ${planLabel}` : ''} — l&apos;activation prend quelques
              instants.
            </>
          )}
        </p>
      ) : (
        <p className="text-[15px] text-brand-muted2">
          Merci — ton paiement a bien été reçu. Ton pack sera actif dans quelques instants.
        </p>
      )}
      <Link
        href="/dashboard"
        className="im-tap mt-2 rounded-xl bg-brand-green px-6 py-3 text-sm font-bold text-white"
      >
        Retour au tableau de bord
      </Link>
    </main>
  );
}
