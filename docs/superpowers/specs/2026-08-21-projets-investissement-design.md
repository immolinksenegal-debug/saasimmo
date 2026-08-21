# Publier un projet d'investissement — Design

## Contexte

ImmoLink expose déjà `/investir` (opportunités calculées à partir des annonces `Property` actives — aucun chiffre inventé) et `/projets-neufs` (programmes immobiliers neufs de promoteurs). Mais `/projets-neufs` affiche aujourd'hui un tableau **codé en dur** (`PROGRAMS` dans `frontend/src/lib/mock/immolink.ts`), avec un commentaire explicite dans le code : *"there's no dedicated Program model yet"*. Le même mock alimente aussi la vitrine "Programmes immobiliers neufs" de la page d'accueil.

Il n'existe donc aujourd'hui aucun moyen pour un porteur de projet (promoteur, propriétaire d'un terrain à lotir, porteur d'un programme neuf) de publier lui-même son projet, ni pour un investisseur de manifester son intérêt dessus.

Cette feature ajoute un vrai **marketplace de projets d'investissement** : un utilisateur connecté publie son projet, les investisseurs le consultent sur `/projets-neufs` et `/investir`, et peuvent manifester leur intérêt via un formulaire de contact qui notifie le porteur du projet.

## Décisions de cadrage (validées en brainstorming)

1. **Nature de la feature** : un marketplace de projets d'investissement à part entière (nouveau modèle de données), pas une simple extension du formulaire d'annonce de bien existant (`Property`).
2. **Publication** : tout utilisateur connecté peut publier, visible immédiatement — pas de statut `DRAFT` ni de validation admin avant mise en ligne (cohérent avec le fonctionnement actuel de `Property`, qui n'a pas non plus de modération).
3. **Quota** : publication libre et illimitée en v1 — ne consomme pas le quota d'abonnement (`Subscription.listingQuota`) utilisé pour les annonces de biens. Un quota/pack dédié pourra être ajouté plus tard si le volume le justifie.
4. **Pas de suivi financier** : ni montant levé, ni ticket minimum, ni escrow — comme le reste du site, c'est un mécanisme de mise en relation (publication + lead), pas une plateforme transactionnelle sur les fonds investis.

## Modèle de données

Deux nouveaux modèles ajoutés à `frontend/prisma/schema.prisma`, sur le modèle de `Property` / `VisitRequest` :

```prisma
model InvestmentProject {
  id            String   @id @default(cuid())
  ownerId       String
  owner         User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title         String
  description   String
  type          String   // Résidentiel | Terrain | Bureau | Mixte
  city          String
  quartier      String
  priceFrom     Int      // FCFA, "à partir de"
  lotsLabel     String   // texte libre : "48 lots", "120 appartements"
  status        String   @default("En cours") // texte libre : "En cours" | "Sur plan" | "Livraison 2027" — même convention que le mock PROGRAMS actuel
  developerName String?  // nom public du projet/promoteur, distinct du nom du compte
  image         String
  image2        String?
  image3        String?
  recordStatus  String   @default("ACTIVE") // ACTIVE | ARCHIVED — le propriétaire peut dépublier
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  interests InvestmentInterest[]

  @@index([city])
  @@index([ownerId])
  @@index([recordStatus, createdAt])
}

model InvestmentInterest {
  id        String   @id @default(cuid())
  projectId String
  project   InvestmentProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  phone     String
  message   String?
  status    String   @default("PENDING") // PENDING | CONTACTED | DONE
  createdAt DateTime @default(now())

  @@index([projectId, createdAt])
}
```

Ajouter la relation inverse sur `User` :

```prisma
investmentProjects InvestmentProject[]
```

Devise et montants suivent la convention du projet : FCFA (XOF), entier, pas de décimales (`priceFrom`).

## Helpers serveur

Nouveau fichier `frontend/src/lib/server/investment-projects.ts`, sur le modèle de `properties.ts` :

- `listInvestmentProjects({ take, city? })` — projets `recordStatus: ACTIVE`, triés `createdAt desc`. Alimente `/projets-neufs`, la vitrine de la page d'accueil, et la section dédiée sur `/investir`.
- `getInvestmentProjectById(id)` — projet actif par id, ou `null`.
- `listInvestmentProjectsByOwner(ownerId)` — tous les projets d'un utilisateur (tout `recordStatus`), pour la section "Mes projets" du dashboard.

## Routes API

### `frontend/src/app/api/investment-projects/route.ts`

- `export const runtime = 'nodejs'`
- `POST` — `verifyCsrf(req)` puis `requireAuth(req)` (connexion obligatoire, pas d'`optionalAuth` — conforme à la décision de cadrage n°2). Validation Zod : `title`, `description`, `type` (enum), `city`, `quartier`, `priceFrom` (entier positif), `lotsLabel`, `status?`, `developerName?`, `images` (`string[]`, 1 à 3, mappé vers `image`/`image2`/`image3`). Pas de vérification de quota.

### `frontend/src/app/api/investment-projects/[id]/route.ts`

- `PATCH` — `verifyCsrf(req)` + `requireAuth(req)`. Vérifie `project.ownerId === auth.userId` (404 si non-propriétaire, pas 403 — même convention que le reste du projet pour ne pas confirmer l'existence). Mêmes champs que `POST`, tous optionnels.
- `DELETE` — mêmes garde-fous ; passe `recordStatus` à `ARCHIVED` (soft delete, comme `Property.status`) plutôt qu'une suppression physique, pour ne pas casser l'historique des `InvestmentInterest` déjà reçues.

### `frontend/src/app/api/investment-projects/[id]/interests/route.ts`

- `POST` — public, **pas de `verifyCsrf`** (même rationale que `visit-requests` : formulaire pré-session, sans autorité de session ambiante à protéger). Limité par IP via `createEmailLimiter` existant (nouveau bucket `investment-interests`). Body Zod : `name`, `phone`, `message?`. Crée la ligne `InvestmentInterest`, puis appelle `createNotification(prisma, investmentInterestReceived({...}))` — jamais `prisma.notification.create` directement.

Toutes ces routes suivent le boilerplate standard (`requireAuth`/`verifyCsrf`/`withRequestContext`) — aucun fichier protégé n'est touché.

## Notifications

Nouveau template typé dans `frontend/src/lib/server/notifications/templates.ts` :

```
investmentInterestReceived(ownerId, { projectId, projectTitle, interestId, name, phone })
```

`dedupeKey: investment-interest:${interestId}` — même pattern que `visitRequested`.

## Pages

### `frontend/src/app/projets-neufs/page.tsx`

Devient un composant serveur qui lit `listInvestmentProjects()` au lieu de mapper le mock `PROGRAMS`. Ajoute un CTA "Publier mon projet" vers `/projets-neufs/nouveau`. État vide si aucun projet publié.

### `frontend/src/app/projets-neufs/[id]/page.tsx` (nouveau)

Page de détail : galerie (`image`/`image2`/`image3`), description, ville/quartier, `priceFrom`, `lotsLabel`, `status`, `developerName`. Réutilise `OwnerContactCard` (téléphone/email du propriétaire) et un nouveau composant `InvestmentInterestCard` (copie du pattern modal de `VisitRequestCard`, texte adapté : "Manifester mon intérêt" au lieu de "Demander une visite", POST vers `/api/investment-projects/[id]/interests`).

### `frontend/src/app/projets-neufs/nouveau/page.tsx` (nouveau)

Formulaire de publication, calqué sur `annonces/nouvelle/page.tsx` (même pattern `uploadFile` + `api()`). Redirige vers `/login` si `user` est `null`.

### `frontend/src/app/projets-neufs/[id]/modifier/page.tsx` (nouveau)

Formulaire d'édition, calqué sur `annonces/[id]/modifier/page.tsx`, propriétaire uniquement.

### Nouveau composant `frontend/src/components/immolink/InvestmentProjectCard.tsx`

Card de grille, calquée sur `PropertyCard`.

### Dashboard (`frontend/src/app/dashboard/page.tsx`)

Nouvelle section "Mes projets d'investissement" via `listInvestmentProjectsByOwner`, avec actions modifier/archiver (pattern `DeleteListingButton` retargeté).

## Intégration page d'accueil et `/investir`

- `frontend/src/app/page.tsx` — remplace `PROGRAMS.map(...)` par `listInvestmentProjects({ take: 3 })`, même traitement visuel, chaque carte pointe désormais vers `/projets-neufs/[id]` au lieu d'une recherche `/recherche`.
- `frontend/src/app/investir/page.tsx` — ajoute une section "Projets à financer" (2-3 `InvestmentProjectCard`) entre les statistiques et les opportunités de location existantes, avec un lien "Voir tous les projets →" vers `/projets-neufs`.

`PROGRAMS` dans `frontend/src/lib/mock/immolink.ts` devient inutilisé après cette migration et est supprimé.

## Hors scope (YAGNI)

- Pas de validation/modération admin avant publication.
- Pas de quota lié à l'abonnement (`Subscription`).
- Pas de suivi financier (montant levé, ticket minimum, statut de collecte).
- Pas de messagerie interne — le contact reste direct (téléphone/WhatsApp/email), même mécanisme que sur `biens/[id]`.

## Tests

- Tests unitaires Vitest pour les routes API (`POST`/`PATCH`/`DELETE /api/investment-projects[/[id]]`), calqués sur `properties/route.test.ts` : auth requise, ownership check (404 non-propriétaire), validation Zod.
- Test pour `POST /api/investment-projects/[id]/interests`, calqué sur `visit-requests/route.test.ts` : création, notification déclenchée, rate-limit IP.
- Le test `runtime-enforcement.test.ts` existant valide automatiquement que les nouvelles routes exportent `runtime = 'nodejs'` — aucune action manuelle requise au-delà de l'export.
