import type { Metadata } from 'next';
import Link from 'next/link';
import { IMMOLINK_EMAIL, IMMOLINK_PHONE } from '@/lib/mock/immolink';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Mentions légales d’ImmoLink Sénégal — éditeur, hébergement, propriété intellectuelle.',
  alternates: { canonical: '/mentions-legales' },
};

export default function MentionsLegalesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Mentions légales
      </div>
      <h1 className="mb-8 font-serif text-4xl">Mentions légales</h1>

      <div className="flex flex-col gap-8 text-[15px] leading-relaxed text-brand-slate">
        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">1. Éditeur du site</h2>
          <p>
            Le site immolinksenegal.net (« ImmoLink Sénégal », « le Site ») est édité par :
            <br />
            <strong>[Raison sociale / forme juridique à compléter]</strong>
            <br />
            Siège social : [Adresse complète à compléter], Sénégal
            <br />
            RCCM : [Numéro RCCM à compléter]
            <br />
            NINEA : [Numéro NINEA à compléter]
            <br />
            Directeur de la publication : [Nom à compléter]
            <br />
            Email : {IMMOLINK_EMAIL} — Téléphone : {IMMOLINK_PHONE}
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">2. Hébergement</h2>
          <p>
            Le Site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789,
            États-Unis. La base de données est hébergée par Neon Inc. (infrastructure PostgreSQL
            managée).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">3. Activité du Site</h2>
          <p>
            ImmoLink Sénégal est une plateforme de mise en relation entre particuliers, agences et
            promoteurs immobiliers au Sénégal. Le Site permet la publication et la consultation
            d&apos;annonces immobilières (vente, location, projets neufs) ainsi que la souscription
            de formules payantes (« packs ») destinées aux vendeurs pour la mise en avant de leurs
            annonces.
          </p>
          <p className="mt-2">
            ImmoLink Sénégal n&apos;est pas partie aux transactions immobilières conclues entre
            utilisateurs (achat, vente, location) et n&apos;intervient ni comme agence immobilière,
            ni comme mandataire, ni comme séquestre de fonds. Les conditions applicables à ces
            formules payantes figurent dans nos{' '}
            <Link href="/cgv" className="font-semibold text-brand-green underline">
              Conditions Générales de Vente
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">
            4. Propriété intellectuelle
          </h2>
          <p>
            L&apos;ensemble des éléments du Site (structure, textes, logos, charte graphique) est
            protégé au titre du droit d&apos;auteur et ne peut être reproduit sans autorisation
            écrite préalable. Les photographies et descriptions des annonces restent la propriété de
            leurs auteurs respectifs (vendeurs, agences).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">
            5. Protection des données personnelles
          </h2>
          <p>
            Le traitement des données personnelles collectées sur le Site est soumis à la loi
            sénégalaise n° 2008-12 du 25 janvier 2008 relative à la protection des données à
            caractère personnel, sous le contrôle de la Commission de protection des données
            personnelles (CDP). Pour toute question ou pour exercer vos droits d&apos;accès, de
            rectification ou de suppression de vos données, contactez-nous à {IMMOLINK_EMAIL}.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold text-brand-ink">6. Contact</h2>
          <p>
            Pour toute question relative au Site : {IMMOLINK_EMAIL} — {IMMOLINK_PHONE}.
          </p>
        </section>
      </div>
    </main>
  );
}
