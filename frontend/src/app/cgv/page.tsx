import type { Metadata } from 'next';
import Link from 'next/link';
import { IMMOLINK_EMAIL, IMMOLINK_PHONE } from '@/lib/mock/immolink';

export const metadata: Metadata = {
  title: 'Conditions Générales de Vente',
  description:
    'Conditions Générales de Vente des packs vendeurs ImmoLink Sénégal — tarifs, paiement, renouvellement, remboursement.',
  alternates: { canonical: '/cgv' },
};

export default function CgvPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Conditions Générales de Vente
      </div>
      <h1 className="mb-2 font-serif text-4xl">Conditions Générales de Vente</h1>
      <p className="mb-8 text-sm text-brand-muted2">
        Applicables aux formules payantes (« packs ») souscrites sur immolinksenegal.net.
      </p>

      <div className="flex flex-col gap-8 text-[15px] leading-relaxed text-brand-slate">
        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">1. Objet</h2>
          <p>
            Les présentes Conditions Générales de Vente (CGV) régissent la souscription, par tout
            utilisateur (« le Client »), à une formule payante de mise en avant d&apos;annonces
            immobilières (« Pack ») sur la plateforme ImmoLink Sénégal (« le Site »), éditée dans
            les conditions décrites dans nos{' '}
            <Link href="/mentions-legales" className="font-semibold text-brand-green underline">
              Mentions légales
            </Link>
            . Toute souscription à un Pack implique l&apos;acceptation pleine et entière des
            présentes CGV.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">2. Packs et tarifs</h2>
          <p>Le Site propose les formules suivantes, dont les tarifs sont exprimés en FCFA TTC :</p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <strong>Gratuit</strong> — 0 FCFA, 1 annonce active, durée limitée à 15 jours.
            </li>
            <li>
              <strong>Standard</strong> — 9 900 FCFA / mois, 10 annonces actives, 30 jours par
              annonce.
            </li>
            <li>
              <strong>Premium</strong> — 24 900 FCFA / mois, 50 annonces actives, mise en avant et
              publication prioritaire.
            </li>
            <li>
              <strong>Annuelle</strong> — 250 000 FCFA / an, annonces illimitées, mise en avant et
              publication prioritaire.
            </li>
          </ul>
          <p className="mt-2">
            Les tarifs affichés sur le Site au moment de la souscription font foi. ImmoLink Sénégal
            se réserve le droit de faire évoluer ses tarifs à tout moment ; ce changement est sans
            effet sur un Pack déjà payé et actif.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">
            3. Paiement et durée de validité
          </h2>
          <p>
            Le paiement s&apos;effectue en ligne, en une seule fois, via notre prestataire de
            paiement sécurisé (Wave, Orange Money, Free Money, Stripe, cartes Visa/Mastercard). Le
            Pack est activé immédiatement après confirmation du paiement par le prestataire.
          </p>
          <p className="mt-2">
            Un Pack payant est valable pour la durée indiquée (30 jours pour Standard et Premium,
            365 jours pour Annuelle) à compter de son activation.{' '}
            <strong>Le renouvellement n&apos;est pas automatique</strong> : à l&apos;échéance, le
            Client repasse par le Site pour souscrire à nouveau s&apos;il souhaite continuer à
            bénéficier des avantages du Pack. À défaut de nouvelle souscription, le compte repasse
            en formule Gratuite.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">
            4. Droit de rétractation et remboursement
          </h2>
          <p>
            Le Pack étant un service numérique dont l&apos;exécution (mise en avant des annonces)
            débute immédiatement après le paiement, à la demande expresse du Client, celui-ci
            reconnaît renoncer à son droit de rétractation dès l&apos;activation du Pack.
          </p>
          <p className="mt-2">
            Sauf erreur de facturation avérée (double débit, montant incorrect), les paiements ne
            sont pas remboursables une fois le Pack activé. Toute réclamation doit être adressée à{' '}
            {IMMOLINK_EMAIL} dans un délai de 14 jours suivant le paiement.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">
            5. Responsabilité relative aux annonces
          </h2>
          <p>
            ImmoLink Sénégal met à disposition un espace de publication et n&apos;intervient pas
            dans les transactions conclues entre le Client et un tiers (acheteur, locataire,
            vendeur). Le Client demeure seul responsable de l&apos;exactitude des informations
            publiées. ImmoLink Sénégal recommande à tout utilisateur de ne jamais verser
            d&apos;argent à un tiers avant d&apos;avoir visité le bien concerné.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">6. Résiliation</h2>
          <p>
            Le Client peut cesser d&apos;utiliser un Pack à tout moment en ne renouvelant pas sa
            souscription à l&apos;échéance, sans qu&apos;aucun remboursement ne soit dû pour la
            période restante. ImmoLink Sénégal se réserve le droit de suspendre un compte en cas de
            manquement aux présentes CGV ou aux règles de publication du Site.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">
            7. Droit applicable et litiges
          </h2>
          <p>
            Les présentes CGV sont soumises au droit sénégalais. En cas de litige, une solution
            amiable sera recherchée en priorité en contactant {IMMOLINK_EMAIL} ; à défaut, les
            tribunaux de Dakar seront seuls compétents.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">8. Contact</h2>
          <p>
            Pour toute question relative à ces CGV : {IMMOLINK_EMAIL} — {IMMOLINK_PHONE}.
          </p>
        </section>
      </div>
    </main>
  );
}
