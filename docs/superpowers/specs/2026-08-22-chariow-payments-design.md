# Intégration Chariow (paiement carte bancaire) — Design

## Contexte

ImmoLink Sénégal facture ses packs vendeur (Standard, Premium, Annuel) via
Bictorys (Wave, Orange Money, Free Money). Bictorys ne gère pas la carte
bancaire — la modale Packs promet pourtant déjà "Visa · Mastercard" dans son
texte de pied de page, sans que ça existe. Chariow est un checkout hébergé
qui encaisse Mobile Money **et** carte bancaire ; on l'ajoute uniquement
pour combler ce manque carte, en complément de Bictorys (pas en
remplacement).

Une doc d'intégration Chariow existante (`Chariow (1).md`, à la racine du
repo) provient d'un **autre projet** : monorepo Express `backend/` +
`frontend/`, modèle per-créateur (chaque communauté a son propre compte
Chariow chiffré en base), avec un système de réconciliation lourd
(`reconcile.ts` — cron 5 min, anti-fraude par tolérance de montant,
rattrapage des échecs sur 14 jours). Cette conception adapte le contrat
HTTP Chariow (§3 et §3bis de cette doc restent la référence technique
exacte) à l'architecture réelle d'ImmoLink : Next.js 16 monolithe, Prisma,
`PaymentProvider` pluggable, `webhook/handler.ts` protégé — et **simplifie
délibérément** le reste (compte plateforme unique, pas de cron de
réconciliation, pas de libphonenumber).

## Décisions de cadrage (validées avec l'utilisateur)

1. **Motivation** : Chariow = option carte bancaire complémentaire à
   Bictorys (Mobile Money), pas une redondance/fallback automatique.
   L'utilisateur choisit son moyen de paiement.
2. **Mapping produit** : Chariow facture le prix d'un produit pré-créé
   dans SA boutique, jamais un montant libre par API (`§3.1` de la doc
   source). Un produit Chariow par pack ImmoLink, créés manuellement par
   l'opérateur, id stocké en variable d'environnement. Alignement de prix
   = responsabilité opérationnelle manuelle (documentée dans le README),
   pas de vérification automatique en v1 — même statut que Bictorys, qui
   n'a pas non plus de garde-fou de ce type aujourd'hui.
3. **Téléphone/nom requis par Chariow** : si l'utilisateur n'a pas de
   téléphone enregistré (`User.phone` null), le bouton "Payer par carte"
   est désactivé avec un message invitant à l'ajouter dans les paramètres
   — pas de formulaire de complément à la volée. Prénom/nom : valeurs
   génériques ("Client" / "ImmoLink"), Chariow ne s'en sert que pour son
   dashboard interne.
4. **Sélecteur de moyen de paiement** : un toggle partagé en haut de la
   modale Packs ("Mobile Money" / "Carte bancaire"), pas un bouton par
   pack — s'applique aux 4 cartes de pack en une fois.

## Architecture

### Provider Chariow (`frontend/src/lib/server/payments/chariow.ts`)

Même forme que `bictorys.ts` : une factory `createChariowProvider(env)`
retournant `{ name: 'chariow', charge, webhookProvider }`. **Pas de
`payout`/`refund`** — Chariow ne sert ici qu'à encaisser les packs, les
retraits vendeur restent 100% Bictorys (`payout?`/`refund?` sont optionnels
dans l'interface `PaymentProvider`, donc ce n'est pas une violation de
contrat de les omettre).

`charge(input: ChargeInput)` :
1. Lit `input.metadata.plan` (`'STANDARD' | 'PREMIUM' | 'ANNUEL'`, ajouté
   par le call site — voir plus bas) pour choisir le bon `product_id`
   via une table statique construite depuis
   `CHARIOW_PRODUCT_ID_STANDARD/PREMIUM/ANNUEL`. Plan absent ou produit
   non configuré → throw explicite (le call site le traduit en 503
   `PAYMENT_PROVIDER_UNCONFIGURED`, même pattern que Bictorys manquant).
2. Découpe `input.customer.phone` (E.164 sénégalais garanti par
   `normalizeSenegalPhone` + le validateur serveur `zPhone` — toute
   l'app est mono-pays) via un petit helper local `splitSenegalPhoneForChariow`
   (`+221771234567` → `{ number: '771234567', country_code: 'SN' }`),
   même esprit que `frontend/src/lib/phone.ts` mais côté serveur. Pas de
   dépendance `libphonenumber` — hors scope, l'app ne sert qu'un pays.
3. `POST {CHARIOW_API_URL}/checkout` avec `product_id`, `email`,
   `first_name: 'Client'`, `last_name: 'ImmoLink'`, `phone`,
   `redirect_url` = `successUrl` (Chariow ne distingue pas succès/échec à
   l'URL de retour — voir §5 plus bas), `custom_metadata: { orderId:
   input.externalRef }`.
4. Réponse : `data.purchase.id` → `providerChargeId` ;
   `data.payment.checkout_url` → `paymentUrl` ; statut initial toujours
   `'PENDING'` (Chariow ne règle jamais de façon synchrone).
5. Mapping de statut Chariow → normalisé, fidèle à `§3.3` de la doc
   source (`mapChariowStatus`) : `settle|complete|paid|success` →
   `PAID` ; `failed|error` → `FAILED` ; `cancel|abandon|refund` →
   considéré `FAILED` côté ImmoLink (pas de statut `REFUNDED` séparé
   piloté par Chariow en v1 — les remboursements packs ne sont pas un
   flux existant) ; tout le reste → `PENDING`. **Ordre des tests
   respecté** : `unpaid` testé en premier (sinon il matche `paid` par
   inclusion de sous-chaîne — piège explicitement documenté dans la doc
   source, §3.3).

### Singleton (`frontend/src/lib/server/payments/chariow-singleton.ts`)

Miroir exact de `provider-singleton.ts` : `getChariowProvider()` lazy-init
+ `PaymentProviderUnconfiguredError` si `CHARIOW_API_URL` /
`CHARIOW_API_KEY` / `CHARIOW_WEBHOOK_SECRET` / un des 3
`CHARIOW_PRODUCT_ID_*` manque. **Un `CircuitBreaker` séparé** de celui de
Bictorys (même config : 5 échecs / 30 s / cooldown 60 s) — les deux
providers ne doivent pas se faire tomber l'un l'autre.

### Webhook (`frontend/src/lib/server/webhook/chariow.ts` +
`frontend/src/app/api/webhooks/chariow/route.ts`)

Différence structurante avec Bictorys : Chariow authentifie son webhook
("Pulse") par un **secret dans l'URL** (`?secret=...`), pas par un header
de signature. `WebhookProvider.verifySignature(rawBody, headers)` ne voit
que le corps et les headers — pas l'URL. Le fichier route fait donc la
vérification du secret **avant** de déléguer à `createWebhookHandler`
(qui reste intouché, PROTÉGÉ) :

```ts
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || !timingSafeEqual(secret, process.env.CHARIOW_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  return chariowWebhookHandler(req); // = createWebhookHandler({ provider: chariowWebhookProvider, ... })
}
```

Ce contrôle ne touche jamais le corps de la requête (query string
uniquement, lu de façon synchrone) — l'invariant "raw body lu et hashé
avant tout parse JSON" reste respecté puisque le corps n'est même pas
regardé ici. `chariowWebhookProvider.verifySignature` retourne donc
toujours `{ valid: true }`, avec un commentaire explicite renvoyant vers
ce contrôle en amont (l'authentification réelle a déjà eu lieu).

Événements de succès reconnus (§7 doc source) : `successful.sale`,
`settled.sale`, `completed.sale` → `kind: 'paid'`.

`onPaid`/`onFailed` dans la route : **logique identique** à
`api/webhooks/bictorys/route.ts` — retrouve l'`Order` par
`providerChargeId`, le passe à `PAID`/`FAILED`, active/renouvelle
l'abonnement (`Subscription.upsert`) si `metadata.kind ===
'pack_subscription'`, émet les mêmes événements outbox
(`notification.payment_received`, `email.payment_confirmation`). Pas de
`onRefunded` distinct en v1 (pas de flux de remboursement pack existant —
même limitation que Bictorys aujourd'hui, documentée pareil).

**Pas de cron de réconciliation, pas d'anti-fraude par tolérance de
montant.** C'est le principal écart volontaire avec la doc source : ce
projet n'a pas ce système pour Bictorys non plus (webhook-only), donc en
ajouter un uniquement pour Chariow introduirait deux paradigmes de
fiabilité différents dans la même app. Si un webhook Chariow est perdu, le
comportement est le même qu'aujourd'hui pour un webhook Bictorys perdu :
l'`Order` reste `PENDING` jusqu'à investigation manuelle (aucune
régression de fiabilité introduite par cette intégration).

### Checkout (`frontend/src/app/api/subscriptions/checkout/route.ts`)

Changements :
- `Body` accepte `provider: z.enum(['bictorys', 'chariow']).default('bictorys')`.
- Résolution du provider + breaker par `if/else` sur cette valeur (deux
  singletons distincts, pas de registry générique — YAGNI pour 2
  providers).
- `provider.charge({ ..., customer: { email, phone: user.phone ??
  undefined }, metadata: { plan } })` — le `phone` et le `metadata.plan`
  sont ajoutés à l'appel (Bictorys les ignore silencieusement s'il n'en a
  pas besoin, donc aucune régression pour le flux existant).
- **Garde téléphone** : si `provider === 'chariow'` et `!user.phone` →
  400 `PHONE_REQUIRED` avant tout appel réseau, message actionnable.
- `Order.provider` = `'bictorys'` ou `'chariow'` selon le choix — déjà un
  `String` libre en base, aucune migration Prisma nécessaire.

### UI (`frontend/src/components/immolink/PacksModal.tsx`)

Un toggle à deux options en haut de la modale, sous le titre :
`💳 Carte bancaire` / `📱 Mobile Money` (Mobile Money pré-sélectionné par
défaut — comportement actuel inchangé pour qui ne touche à rien). L'état
choisi est passé dans le body de `POST /api/subscriptions/checkout`. Si
`Carte bancaire` est sélectionné et que l'utilisateur n'a pas de
téléphone, les 4 boutons de pack se désactivent avec un texte "Ajoute ton
numéro dans les paramètres" au lieu de "Choisir" — pas de redirection
surprise vers un paiement voué à échouer côté Chariow.

Texte du pied de modale mis à jour pour refléter la réalité :
`Paiement sécurisé · Wave · Orange Money · Free Money · Carte bancaire`
(retrait de "Stripe" qui n'existe pas et n'a jamais existé dans ce
projet).

## Configuration

### Variables d'environnement (backend)

| Variable | Rôle |
|---|---|
| `CHARIOW_API_URL` | Base API (défaut `https://api.chariow.com/v1`) |
| `CHARIOW_API_KEY` | Clé API plateforme (compte unique, pas per-utilisateur) |
| `CHARIOW_WEBHOOK_SECRET` | Secret du webhook Pulse, comparé au `?secret=` de l'URL |
| `CHARIOW_PRODUCT_ID_STANDARD` | `product_id` Chariow du produit miroir du pack Standard (9 900 FCFA) |
| `CHARIOW_PRODUCT_ID_PREMIUM` | idem Premium (24 900 FCFA) |
| `CHARIOW_PRODUCT_ID_ANNUEL` | idem Annuel (250 000 FCFA) |

### Setup manuel côté opérateur (à documenter dans le README)

1. Créer un compte Chariow, récupérer la clé API (dashboard → API).
2. Créer 3 produits dans la boutique Chariow, prix strictement identiques
   aux packs ImmoLink, devise XOF. Noter leurs `product_id`.
3. Configurer le webhook "Pulse" dans le dashboard Chariow vers
   `https://<domaine>/api/webhooks/chariow?secret=<CHARIOW_WEBHOOK_SECRET>`
   (secret généré manuellement par l'opérateur — pas d'auto-génération
   par produit/communauté ici, compte unique).
4. Renseigner les 5 variables d'environnement ci-dessus sur Vercel.
5. **Tenir les prix synchronisés** à chaque changement de `SUBSCRIPTION_PLANS`
   — pas de garde-fou automatique en v1 (voir décision de cadrage #2).

## Hors scope (explicitement, avec justification)

- **Paiements/retraits per-créateur** — ImmoLink est un compte plateforme
  unique, pas un marketplace multi-vendeur pour Chariow.
- **`reconcile.ts` / cron de réconciliation / anti-fraude par tolérance
  de montant** — webhook-only, cohérent avec Bictorys existant.
- **`libphonenumber`** — app mono-pays (Sénégal), un helper de 10 lignes
  suffit.
- **Payout/refund Chariow** — les retraits vendeur restent 100% Bictorys.
- **Formulaire de complément téléphone/nom à la volée** — bloqué avec
  message vers les paramètres à la place (décision de cadrage #3).

## Tests

- `chariow.ts` : tests unitaires sur `charge()` (mapping produit,
  découpage téléphone, mapping de statut — cas `unpaid` avant `paid`),
  webhookProvider (`extractIds`, mapping des événements
  `successful.sale`/`settled.sale`/`completed.sale`), sur le modèle de
  `bictorys.test.ts`.
- `app/api/webhooks/chariow/route.test.ts` : vérif secret invalide → 401
  AVANT toute lecture du corps ; onPaid active bien l'abonnement ; dédup
  via `WebhookLog` (comportement hérité du factory, testé indirectement).
- `app/api/subscriptions/checkout/route.test.ts` (existant, étendu) :
  nouveau cas `provider: 'chariow'` sans téléphone → 400 `PHONE_REQUIRED`
  avant tout appel réseau ; cas nominal avec téléphone → `Order.provider
  = 'chariow'`.

---

<sub>Contrat HTTP Chariow détaillé (§3, §3bis) : voir `Chariow (1).md` à
la racine du repo — reste la référence technique pour les formes de
requête/réponse exactes. Ce document ne les reproduit pas en entier pour
éviter la dérive entre les deux.</sub>
