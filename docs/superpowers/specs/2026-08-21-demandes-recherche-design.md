# Demandes de recherche immobilière — Design

## Contexte

ImmoLink permet aujourd'hui de publier des annonces de biens (`Property`) — un utilisateur qui a un bien à vendre ou à louer le publie via `/annonces/nouvelle`. Il n'existe pas de mécanisme symétrique pour les particuliers qui *cherchent* un bien : ils n'ont aucun moyen de faire savoir publiquement ce qu'ils recherchent.

Cette feature ajoute les **demandes de recherche** : un particulier connecté publie ce qu'il cherche (type de bien, ville, budget, message libre). La demande est visible publiquement, avec le téléphone de contact de l'auteur, pour que les agences/propriétaires ayant un bien correspondant puissent le contacter directement.

## Décisions de cadrage (validées en brainstorming)

1. **Type de contenu** : une demande de recherche ("je cherche X"), pas une annonce de bien classique.
2. **Visibilité** : page publique dédiée, contact direct par téléphone/WhatsApp (même mécanisme que sur `biens/[id]` pour les Property) — pas de messagerie interne.
3. **Auth & quota** : connexion requise pour publier ; gratuit et illimité — ne consomme pas le quota d'abonnement (`Subscription.listingQuota`) utilisé pour les annonces de biens.

## Modèle de données

Nouveau modèle `PropertyRequest`, ajouté à `frontend/prisma/schema.prisma`, symétrique à `Property` côté besoin plutôt qu'offre :

```prisma
model PropertyRequest {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  txn       String   // Vente | Location
  type      String   // Villa | Appartement | Terrain | Bureau | Peu importe
  city      String
  quartier  String   @default("") // optionnel — une recherche peut être large
  budgetMax Int      // FCFA, borne haute du budget
  bedsMin   Int      @default(0)
  message   String   @default("") // détail libre du besoin
  status    String   @default("ACTIVE") // ACTIVE | FULFILLED | ARCHIVED
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([txn, status])
  @@index([city])
  @@index([userId])
}
```

Ajouter la relation inverse sur `User` :

```prisma
propertyRequests PropertyRequest[]
```

Le téléphone de contact affiché publiquement est `user.phone`, lu au moment du rendu — pas de duplication de champ, même pattern que la page `biens/[id]` pour les annonces de biens. Une demande sans `user.phone` renseigné affiche un état "aucun contact disponible" plutôt qu'un numéro vide.

Devise et montants suivent la convention du projet : FCFA (XOF), entier, pas de décimales.

## Routes API

### `frontend/src/app/api/property-requests/route.ts`

- `export const runtime = 'nodejs'`
- `GET` — public (pas d'auth). Query params : `txn` (`Vente|Location`), `city`, `type`. Retourne les demandes `status: ACTIVE` uniquement, triées par `createdAt desc`. Miroir de `GET /api/properties`.
- `POST` — `verifyCsrf(req)` puis `requireAuth(req)` (contrairement à `POST /api/properties`, pas d'`optionalAuth` — la connexion est obligatoire ici). Validation Zod des champs du modèle (`txn`, `type`, `city`, `quartier?`, `budgetMax`, `bedsMin?`, `message?`). Pas de vérification de quota — création directe.

### `frontend/src/app/api/property-requests/[id]/route.ts`

- `export const runtime = 'nodejs'`
- `PATCH` — `verifyCsrf(req)` + `requireAuth(req)`. Vérifie que `propertyRequest.userId === auth.userId` (404 si non-propriétaire, pas 403, pour ne pas confirmer l'existence — cohérent avec la convention org du projet). Body : `{ status: 'FULFILLED' | 'ARCHIVED' }`.
- `DELETE` — mêmes garde-fous (`verifyCsrf` + `requireAuth` + ownership check).

Ces routes suivent le boilerplate standard du projet (`requireAuth` / `verifyCsrf` / `withRequestContext`) — aucun fichier protégé n'est touché.

## Pages

### `frontend/src/app/demandes/page.tsx`

Liste publique des demandes actives. Cards affichant : type de bien, txn (badge "Recherche à vendre" / "Recherche à louer"), ville/quartier, budget max formaté FCFA, extrait du message, bouton de contact (tel:/WhatsApp) utilisant le téléphone de l'auteur. Filtres simples (txn, ville, type) au-dessus de la liste, cohérents visuellement avec le style existant des cards de `biens`.

### `frontend/src/app/demandes/nouvelle/page.tsx`

Formulaire de publication, calqué sur `annonces/nouvelle/page.tsx` (mêmes patterns de style/validation) mais :
- redirige vers `/login` si `user` est `null` (pas de mode "anonyme" comme pour les annonces de biens)
- pas de champ photos
- champs : txn, type (avec option "Peu importe"), ville, quartier (optionnel), budget max, chambres min (optionnel), message libre
- après succès, redirige vers `/demandes`

### Dashboard (`frontend/src/app/dashboard/page.tsx`)

Nouvelle section "Mes demandes" listant les demandes de l'utilisateur connecté, avec actions "Marquer comme trouvé" (`status: FULFILLED`) et "Supprimer".

### Navigation

Lien "Publier une demande" ajouté à côté du lien existant "Publier une annonce" (probablement dans la nav principale et/ou le dashboard).

## Hors scope (YAGNI)

- Pas de messagerie interne — le contact reste le téléphone direct.
- Pas de matching automatique demande↔bien existant.
- Pas de notification "un bien correspond à ta demande" (v2 potentielle, non retenue ici).
- Pas de modération admin — cohérent avec `Property` qui n'a aujourd'hui aucun flux d'approbation admin.

## Tests

- Tests unitaires Vitest pour les routes API (`GET`/`POST /api/property-requests`, `PATCH`/`DELETE /api/property-requests/[id]`) couvrant : auth requise sur POST/PATCH/DELETE, ownership check (404 non-owner), validation Zod, filtrage GET.
- Le test `runtime-enforcement.test.ts` existant valide automatiquement que les nouvelles routes exportent `runtime = 'nodejs'` — aucune action manuelle requise au-delà de l'export.
