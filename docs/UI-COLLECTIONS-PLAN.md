# Nearby Places — UI et modèle collections (chantier)

## Décisions validées
- Accueil = collections administrables (nom, description, suppression contrôlée).
- Tous les lieux de toutes les collections sont surveillés. Aucune activation par collection.
- Un lieu peut appartenir à plusieurs collections ; géofencing dédupliqué par identifiant de lieu.
- Catégories administrables : globales ou spécifiques à une collection.
- La catégorie d'un lieu est une propriété de son rattachement à une collection, pour permettre plusieurs classements.
- Partage JSON et collaboration iOS/Android : évolution future, hors périmètre UI actuel.

## Navigation cible
Onglets : Collections | Carte | Ajouter | Réglages.
- Collections : recherche, création, liste, nombre de lieux.
- Fiche collection : nom/description éditables, lieux, catégories locales, suppression en bas.
- Fiche lieu : nom, commentaire, coordonnées, collections associées et catégorie par collection, actions Plans et suppression.
- Carte : tous les lieux, filtres facultatifs par collection/catégorie.
- Réglages : rayon, autorisations, diagnostics, sauvegarde JSON.

## Modèle v2 proposé
- collections: [{id: UUID, name, description, createdAt, updatedAt}]
- categories: [{id: UUID, name, icon, color, scope: 'global'|'collection', collectionId: UUID|null}]
- places: [{id, name, latitude, longitude, comment, visited, ...}]
- memberships: [{collectionId, placeId, categoryId}]

Les identifiants de lieux existants doivent être conservés pour ne pas perturber les imports et les suppressions du catalogue distant.

## Invariants et migration
1. Ne jamais supprimer ni écraser la clé historique `nearby-places-v1` pendant la migration.
2. Migration idempotente : créer une collection « Mes lieux » pour les lieux préexistants, et des catégories globales correspondant aux six valeurs historiques.
3. Valider l'intégrité des références avant écriture ; rollback si stockage insuffisant ou JSON corrompu.
4. Préserver les champs `visited`, `source`, commentaires, coordonnées et identifiants.
5. Le moteur de proximité reçoit l'union dédupliquée des lieux, sans filtrage par collection.
6. Les imports Apple Plans/Google Maps doivent pouvoir choisir une ou plusieurs collections ; si aucune n'existe, proposer d'en créer une.
7. Un lieu sans collection reste conservé et surveillé jusqu'à décision explicite de suppression.
8. Toute suppression de collection doit expliquer le devenir des lieux orphelins.

## Ordre de réalisation
- A. Modèle v2 + migration et tests, sans changement visuel.
- B. Shell UI mobile (onglets, safe areas, navigation) et écran collections.
- C. Administration catégories et rattachements.
- D. Fiche lieu et intégration du partage natif.
- E. Carte, filtres, accessibilité et tests physiques.

## État initial vérifié
Le fichier `www/index.html` contient actuellement une page unique avec CSS inline, liste, diagnostic, import et réglages. `www/js/app.js` utilise `nearby-places-v1` et six catégories codées en dur. Ce document est une spécification de chantier, **pas** une implémentation.
