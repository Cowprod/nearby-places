# PhotoKit / albums par collection — référence de suivi

## Décisions fonctionnelles
- Un album Photos **par collection utilisateur**, intitulé `Nearby Places — <nom>`.
- Création paresseuse : aucun album vide ; le premier lien photo-lieu déclenche la création si le lieu appartient à cette collection.
- Une photo de plusieurs lieux ou collections reste **un seul PHAsset original**. On ne copie ni ne modifie les pixels.
- Les liens photo-lieu (`nearby-place-photo-links-v1`) restent dans le stockage local, indépendamment de PhotoKit.
- Renommer une collection renomme son album existant ; aucun album n'est créé pour un simple renommage.
- Suppression de collection, retrait de membre ou dissociation d'une photo : **aucune suppression automatique** de l'album ni de photos dans la photothèque.
- La collection système `collection-default` (« Mes lieux » non classés), qui n'apparaît pas dans la liste des collections utilisateur, n'a pas d'album iOS dédié.

## Identité et conservation
- **Clé stable :** `collection.id` (pas `collection.name`, qui peut être dupliqué ou renommé).
- **Côté iOS :** `NSUserDefaults` garde `collection.id -> PHAssetCollection.localIdentifier` sous `nearby-places-photo-albums-v1`.
- Une association ajoute un `PHAsset` existant à un album via `PHAssetCollectionChangeRequest addAssets:` : aucun doublon d'original.
- Si l'utilisateur supprime manuellement l'album dans Photos, le prochain ajout à cette collection peut en recréer un.
- Après désinstallation/réinstallation de l'app (NSUserDefaults effacé), les albums iOS existants peuvent devenir orphelins : ne pas réutiliser automatiquement un album portant le même titre.
- Les mutations d'albums sont sérialisées dans l'interface Cordova pour éviter deux créations simultanées.
- Une collection liée à plusieurs lieux regroupe toutes leurs photos, sans répéter le même identifiant d'asset.
- Les synchronisations répétées sont **idempotentes** : pour un album existant, PhotoKit lit ses membres et ajoute seulement les `PHAsset` manquants ; sans changement, aucune écriture n'est exécutée.
- **Tolérance aux erreurs par collection** : une défaillance sur un album (droits, album devenu non modifiable) n'interrompt plus la synchronisation des autres collections ; les erreurs sont agrégées et restituées au client. Les associations locales ne sont jamais supprimées et la reprise (`resume`) peut retenter les albums en échec.
- **Photos supprimées de la photothèque** : si un lien local vise un `PHAsset` devenu inaccessible, ce lien est conservé mais ignoré lors de l'ajout ; les autres photos disponibles sont ajoutées normalement. La réponse native expose `unavailableCount` pour le diagnostic. Si tous les identifiants sont périmés, **aucun album vide n'est créé**.
- Un titre d'album différent du nom de la collection est rétabli lors d'une synchronisation, y compris après un échec de renommage précédent.
- Les événements Cordova `deviceready` et `resume` redéclenchent la réconciliation, notamment après un retour des Réglages Photos ; aucun lien local n'est effacé lors d'un refus d'accès.

## Droits iOS
- La création/la consultation des **albums utilisateur** exige l'autorisation PhotoKit `PHAccessLevelReadWrite` avec `PHAuthorizationStatusAuthorized`.
- Avec `PHAuthorizationStatusLimited`, PhotoKit ne permet pas de créer ni rechercher les albums utilisateur (documentation Apple sur « Delivering an Enhanced Privacy Experience in Your Photos App »). L'app conserve le lien local et affiche un message demandant l'accès complet dans les Réglages.
- `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` et `NSCameraUsageDescription` existent dans `config.xml`.

## Points d'entrée
- `local-plugins/cordova-plugin-nearby-photos/src/ios/NearbyPhotos.m` : `addToAlbum(collectionId,title,assetIds)` et `renameAlbum(collectionId,title)`.
- `local-plugins/cordova-plugin-nearby-photos/www/NearbyPhotos.js` : pont Cordova.
- `www/js/place-photos.js` (miroir `public/js/`) : association, agrégation des memberships et file d'attente.
- `www/js/collections-ui.js` : renommage, attribution groupée et édition de lieu.
- `www/js/app.js` : import dans une collection et re-synchronisation de photos déjà associées.
- `tests/photo-albums.test.js` : tests Node du pont, de la création paresseuse, des identifiants stables, des collections multiples, de la concurrence et des erreurs d'autorisation.
- `scripts/patch-share-extension.js` : à chaque `cordova prepare ios`, recopie `NearbyPhotos.m` et le pont JavaScript de la source versionnée vers les fichiers générés si le plugin est déjà installé, pour éviter d'utiliser une ancienne version native de PhotoKit.
- `scripts/verify-ios-sources.sh` et `tests/ios-generated.test.js` : contrôlent aussi la concordance du `NearbyPhotos.m` généré ; un fichier natif périmé doit bloquer le build Xcode plutôt que produire silencieusement une version ancienne.
- `tests/ios-generated.test.js` vérifie désormais également le **pont JavaScript PhotoKit réellement généré** par Cordova, sa correspondance bit à bit avec le module versionné et l'ordre des arguments `addToAlbum`/`renameAlbum`. Ce test nécessite le projet iOS généré ; il n'a pas été exécuté sur devMcp Linux.
- `tests/photo-albums.test.js` : vérifie également le contrat de tolérance aux photos supprimées et la présence des gardes de synchronisation iOS (contrôles statiques, pas une exécution PhotoKit).
- `.github/workflows/node-tests.yml` : nouvelle CI Node 22 sur `main` et PR, avec `npm ci --ignore-scripts` avant `npm test` (exécution GitHub Actions à constater).

## Campagne physique iOS encore requise
1. Installer un build macOS/Xcode avec le plugin Cordova mis à jour.
2. Créer « Tokyo », associer une photo existante puis vérifier l'album iOS et l'original non dupliqué.
3. Associer la même photo à une seconde collection ; vérifier les deux albums et l'absence de copie.
4. Renommer une collection ; vérifier l'album lié à son identifiant stable, puis créer une autre collection au titre identique.
5. Retirer une photo ou supprimer une collection ; vérifier qu'aucune photo ni album n'est supprimé de Photos.
6. Tester autorisations refusée, limitée, complète ; vérifier messages et conservation des liens locaux.
7. Tester suppression manuelle de l'album iOS puis nouvel ajout.

## Validation automatisée
- `tests/photo-albums.test.js` passe dans devMcp sur Linux, ainsi que les tests des collections, navigation, géolocalisation et import JS.
- La suite `npm test` complète reste **bloquée dans le workspace devMcp** au test `share-extension.patch.test.js` : dépendance Node `plist` absente (installation npm non proposée par les actions autorisées devMcp).
- Contrôle du 9 novembre 2026 : `project.test` devMcp passe `collections-model`, `collections-ui`, `photo-albums`, navigation, catalogue, proximité et imports simulés ; l'exécution complète retourne **exit 1** sur `Cannot find module 'plist'` au test Share Extension. Aucun test natif PhotoKit n'est disponible sur cet hôte Linux.
- Une CI GitHub Actions a été ajoutée pour disposer d'un contrôle complet avec les dépendances installées, mais **son résultat n'est pas encore confirmé**.
- **Anomalie découverte dans `package-lock.json`** : le verrou ne contient pas encore le plugin photos local, ni plusieurs paquets d'interface pourtant déclarés dans `package.json`. Un `npm ci` GitHub Actions est donc voué à échouer avant les tests. Le workflow utilise temporairement `npm install --package-lock=false --ignore-scripts` pour installer les dépendances déclarées et exécuter la suite ; la prochaine mise à jour du lockfile sur un poste avec accès au registre npm devra rétablir `npm ci`. Ce contournement CI ne constitue pas une preuve de reproductibilité des dépendances.
- **Aucune compilation native Xcode ni validation sur iPhone** n'a été faite depuis ces modifications.

Règle de suivi : rapporter les commits, le résultat réel des tests et les blocages. Ne jamais confondre succès des tests JS et validation native iOS.

## Avancement du 9 novembre 2026 — 21 h, Tokyo
- Ajout de la tolérance aux échecs d'album individuels (`www/js/place-photos.js`, miroir `public/js/`). Nouveau test de récupération : l'album `c-1` échoue, `c-2` est tout de même synchronisé, puis la réconciliation suivante peut retenter `c-1`.
- `project.test` sur devMcp : **PASS** des tests collections, albums, navigation, catalogue, proximité et imports simulés ; **exit 1 global** encore dû à `Cannot find module 'plist'` dans le test Share Extension.
- Vérification supplémentaire du pont JS installé en iOS ajoutée dans `tests/ios-generated.test.js` ; exécution iOS/Xcode non vérifiée (requiert macOS et un projet Cordova préparé).
- La synchronisation du workspace devMcp doit être reconfirmée après les derniers commits et aucune validation physique iPhone ne peut être déduite des tests JS.

## Avancement du 9 novembre 2026 — conservation des associations photo-lieu
- **Défaut corrigé** : une association photo-lieu invalide ou un JSON local tronqué pouvait être interprété comme un objet vide par la lecture tolérante, puis **écrasé** à la prochaine photo. Les écritures passent maintenant par `readForWrite()`, qui refuse les données illisibles et préserve la valeur brute de `nearby-place-photo-links-v1`.
- La mise à jour est limitée à un lieu et déduplique les `PHAsset.localIdentifier` sans altérer les associations des autres lieux. La suppression automatique d'originaux ou d'albums n'est toujours pas implémentée.
- Nouvelle vérification `tests/photo-associations.test.js` ajoutée à `npm test` ; couvre les duplications, les liens des autres lieux et les données locales corrompues. Les miroirs `www/js/place-photos.js` et `public/js/place-photos.js` ont été alignés.
- **Test comportemental JS ciblé exécuté hors devMcp dans un contexte V8 simulé** : 4 scénarios passés (donnée normale, JSON tronqué, tableau inattendu, entrée de lieu malformée) ; dans les cas invalides, la valeur brute reste inchangée et aucun appel natif d'album n'est initié.
- **Limites** : test Node du dépôt et tests natifs PhotoKit non encore rejoués ; tentative `workspace.sync` devMcp sur le nouveau commit en erreur `UNAVAILABLE`. La dernière révision devMcp vérifiée précédemment était `562af722`. Compilation iOS/macOS et installation iPhone toujours **non validées**.

## Avancement du 9 novembre 2026 — reprise devMcp et album à photos indisponibles
- **Synchronisation devMcp rétablie avec l'action asynchrone** `action_start(workspace.sync)`, alors que l'appel synchrone renvoyait `UNAVAILABLE`. Le workspace touchdeck a été synchronisé au commit `fd2c996` (job `8433a1936507ddb43853ee023f07c7c1`, succès).
- **PhotoKit** (`3f34543`) : un album existant peut désormais corriger son titre malgré la disparition de *tous* les PHAsset associés. Sans album existant, aucune création d'album vide n'est autorisée. Test statique de non-régression ajouté (`117dbc5`).
- **Tests de partage** (`fd2c996`) : ancienne assertion de `map-import.behavior.test.js` corrigée pour reconnaître les boutons/sélecteurs iOS au lieu des anciens `UIPickerView`.
- **Campagne devMcp au commit `fd2c996`** (job `2f191131126c05f1a028fc820c6f5636`) : PASS collections, PhotoKit JS, associations photo-lieu, navigation, catalogue, proximité, imports, UI ShareExt ; **échec global** (`exit 1`) uniquement à l'étape `tests/share-extension.patch.test.js` sur `MODULE_NOT_FOUND: plist` dans le workspace Linux. Dépendance déclarée dans `package.json` mais non installée dans cet environnement. Les tests PhotoKit sont des tests JS/statique, pas des tests natifs.
- **À faire** : installer les dépendances npm dans un environnement autorisé et rejouer `npm test`; `npm run ios:build` sur macOS avec Xcode ; campagne iPhone (création d'album, doublons, renommages, permissions, suppression d'originaux et reprise). Aucune compilation Xcode ni validation iPhone revendiquée.

## Contrôle du 10 novembre 2026 — 01 h 13, Tokyo
- L'interface des miniatures a reçu des icônes de lien/déliaison en haut à droite et la réapparition d'une photo déliée dans la liste des suggestions à proximité déjà ouverte (modifications fonctionnelles préexistantes dans les commits `d3f6514` et `56e353e`).
- Test comportemental dédié `tests/photo-link-ui.test.js` ajouté dans `cfcec3c` et intégré dans la suite npm par `7e50916`. Il vérifie les classes Font Awesome, les attributs accessibles, la conservation du lien local, la synchronisation de l'album à l'ajout, l'absence de doublons et l'absence de suppression native après déliaison.
- Correction du faux DOM du test historique d'association (`6ef5572`) pour prendre en charge les attributs `dataset` et la nouvelle hiérarchie de la galerie ; alignement du test de navigation sur le comportement d'erreur explicite et la prise en charge de Waze (`af9b5b8`).
- **devMcp touchdeck** : `workspace.sync` au commit `af9b5b8` réussi, puis `project.test` du 9 novembre 16:12:39 UTC **PASS (exit 0)**. Tests albums PhotoKit, associations, interface, collections, navigation, partage et proximité exécutés par Node. La dépendance `plist` est disponible dans ce workspace lors de cette campagne.
- **Limites impératives :** ni compilation Xcode ni vérification réelle PhotoKit/Photos sur iPhone. La reconnaissance des autorisations iOS, l'absence de doublons dans l'album natif et les renommages doivent encore être vérifiés physiquement ; les contrôles natifs du test sont principalement statiques.
