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

## Contrôle du 10 novembre 2026 — 02 h 13 (Tokyo) : intégrité avant synchronisation
- **Défaut identifié :** `read()` pouvait transformer silencieusement les associations photo-lieu corrompues en objet vide pendant `syncMemberships()`. Le code retournait alors un succès sans avoir soumis les photos déjà liées à PhotoKit. De même, une table de collections absente/invalide était parfois interprétée comme « aucun album à synchroniser ».
- **Correction** (`8dd93e8`, `99a2463`) : la réconciliation passe par `readForSync()` et valide les appartenances et collections sans rien écrire en cas de corruption. Les erreurs sont propagées via des promesses, sans masquer le refus de synchroniser. Le stockage JSON original reste intact ; l'album n'est ni créé ni supprimé sur une source invalide. Miroirs `www` et `public` synchronisés.
- **Capture iOS :** dès que le natif retourne un `PHAsset.localIdentifier`, la photo existe déjà dans Photos. Si l'association locale échoue ensuite, l'app annonce désormais « Photo enregistrée dans Photos, mais association au lieu impossible » et renvoie `saved:true, associated:false`, sans déclarer que la prise de vue a échoué. Si l'association réussit mais pas l'album, `saved:true, associated:true, albumSynced:false` et avertissement explicite. Aucun effacement d'original.
- **Tests** (`9013730`, `bdeef35`) : JSON tronqué, enregistrement incompatible, identifiants d'assets invalides, collection absente/illisible, appartenances orphelines, identifiants de collection dupliqués, conservation des octets, zéro mutation PhotoKit sur source incorrecte et état de capture exact.
- **devMcp touchdeck** : `workspace.sync` réussi au SHA `bdeef351955459c29f74bfc2657f1e7faefa2839` (job `946b28ade8226fe6d082d821e09e8d45`). `project.test` **PASS / exit 0** (job `f8f90407908b14db47959755e85a0efe`, durée 516 ms ; tests PhotoKit simulés et suite JS complète). `git.head` vérifié au même SHA, `git.status` propre. Aucun statut externe CI publié pour ce SHA au moment de la lecture.
- **Portée** : aucun changement au moteur natif PhotoKit `NearbyPhotos.m` dans cette passe ; les garanties de déduplication/création paresseuse/renommage/reposent toujours sur la logique native existante et ses tests statiques. **Compilation Xcode et validation physique iPhone non réalisées**.
- **Prochaine validation** : avec un iPhone, comparer le nombre de `PHAsset` avant/après doubles associations, contrôler création paresseuse, renommages, droits Photos complets/limités et conservation après suppression ou déliaison.

## Contrôle du 10 novembre 2026 — 03 h 12 (Tokyo) : renommage d'album sans liens actifs
- **Défaut identifié :** si une collection avait déjà créé son album PhotoKit, puis perdait tous ses liens photo-lieu (déliaison ou retrait des lieux), `syncMemberships()` n'envoyait plus aucune opération native pour cette collection. Après un renommage échoué (permission refusée, interruption), la reprise ne pouvait donc pas réparer le nom de cet album existant.
- **Correction** : `reconcileMemberships()` envoie `addToAlbum` pour les collections ayant encore des photos liées ; pour les autres, il envoie `renameAlbum` sur la file native sérialisée. `renameAlbum` fait immédiatement no-op si aucun album n'a été créé, sans demander d'autorisation et sans créer d'album vide. Les albums existants peuvent récupérer leur nom au prochain `deviceready`/`resume`, même si plus aucune photo ne reste liée dans Nearby Places. Aucun original ni membre d'album n'est supprimé.
- Les échecs de renommage sont remontés comme erreurs de synchronisation, sans interrompre les autres collections. Une reprise retente le renommage sans modifier le stockage des associations. Fichiers miroir `www` et `public` conservés identiques.
- **Tests ajoutés** : appel natif distinct pour collection sans lien, absence d'ajout à un album vide, poursuite après un échec de renommage, reprise réussie et préservation exacte des associations. Vérification statique du no-op natif sans permission lorsqu'aucun album n'existe.
- **devMcp touchdeck** : synchronisation `workspace.sync` au SHA `b0ec3a393ce84dd1e32cf2a2f50584e8a7592869` (job `36c673e0c39fa735ffe4f35958995531`) réussie ; `project.test` (job `4a9d9b760c67a12441e40ceb573085f7`) : **PASS / exit 0**, 509 ms. Ces tests sont JS et statiques PhotoKit, non une validation iPhone.
- **À faire sur iPhone** : renommer après avoir délié la dernière photo, retirer/refuser puis restaurer la permission Photos, relancer l'application et vérifier la réparation du nom d'un album existant, sans modification des photos ni duplication.

## Contrôle du 10 novembre 2026 — 04 h (Tokyo) : assets PhotoKit indisponibles

- **Défaut corrigé** : `NearbyPhotos.m` retourne déjà `unavailableCount` lorsque les identifiants PhotoKit locaux ne sont plus accessibles (suppression dans Photos, changement d'autorisation, etc.). Le JavaScript ignorait ce champ et pouvait annoncer un succès complet alors que certaines photos, voire toutes les photos d'une collection, n'avaient pas été ajoutées à l'album.
- **Correction** dans `www/js/place-photos.js` et son miroir `public/js/place-photos.js` : `addToAlbums()` relève désormais le nombre d'assets indisponibles pour chaque collection, poursuit les albums sains, puis expose une erreur explicite de **synchronisation partielle**. Le nouvel essai après `resume` reste possible ; la liste locale `nearby-place-photo-links-v1` n'est jamais nettoyée automatiquement.
- Une collection dont tous les assets sont indisponibles ne crée toujours **aucun album vide** : le natif signale cette situation par `unavailableCount`, et le JavaScript ne la confond plus avec une synchronisation réussie. Si un album existe déjà, son renommage reste possible.
- **Tests ajoutés** dans `tests/photo-albums.test.js` : tous les assets indisponibles, seulement certains indisponibles, continuation des autres collections, conservation byte à byte des associations et reprise réussie avec `unavailableCount=0`.
- **devMcp touchdeck** : `workspace.sync` au SHA `fee1427e100c31529193b915b2558dc5afdc57c1` réussi (job `a12c191546e8ef3c62d16a86175f0a36`). `project.test` complet **PASS / exit 0** (job `74b454b87054a3f88c9a8f9014d685df`, 532 ms), comprenant les nouveaux cas et les tests d'import/partage.
- **Portée** : la logique native PhotoKit n'a pas été compilée ici ; les comportements PhotoKit sont simulés ou contrôlés statiquement. **Aucune compilation Xcode ni validation iPhone**.

## Contrôle du 10 novembre 2026 — 05 h 09 (Tokyo) : résultats PHPicker incomplets et collisions UIKit

- **Défaut corrigé** : `PHPickerResult.assetIdentifier` peut être absent alors qu'une image a été sélectionnée. Jusqu'ici le natif omettait silencieusement cet élément et le JavaScript réinitialisait le message de statut après import. Un utilisateur pouvait penser avoir lié toutes les photos alors que certaines étaient impossibles à retrouver via PhotoKit.
- **PhotoKit natif** (`255aabe`) : retour `ids`, `selectedCount` et `unavailableCount` ; seuls les `PHAsset.localIdentifier` présents sont liés, avec déduplication des identifiants. Les sélections sans ID sont comptées sans jamais fabriquer de PHAsset ni supprimer d'original.
- **Interface** (`0ccd6f9`, `c3435c7`, `664a559`, `2f11908`) : affiche le nombre d'images non associables ; les images accessibles sont quand même associées et synchronisées. Une erreur d'album Photos s'affiche conjointement avec le nombre de sélections non associables, sans annuler les liens locaux ; l'annulation du sélecteur ne déclenche pas de création d'album.
- **Fiabilisation UIKit** (`ef27231`) : ouverture du sélecteur sur la file principale, refus explicite si une autre fenêtre native est déjà présentée et réponse Cordova seulement après la fin de la fermeture du sélecteur. Objectif : éviter de libérer prématurément le callback ou de laisser une sélection bloquée dans une collision de modales.
- **Tests** : scénarios sans ID, partiels, identifiants répétés, échec d'autorisation et annulation ajoutés aux tests JavaScript ; gardes statiques Objective-C sur les champs natifs et la séquence UIKit. Les assertions de tests ont été corrigées après les premières campagnes en échec.
- **devMcp/touchdeck** : workspace synchronisé au commit `9afdf24793954dd24f02715fda15b72936b396a4` (job `2e23a742b02f06a21ac1c7e02314e448`), puis `project.test` **PASS, exit 0** (job `7fc15e9f0e7c22c4757ac7ae5c617c5c`, 492 ms). Suite complète Node incluant photos, collections, import et partage ; aucune exécution native iOS.
- **Limite** : sur Linux, ni compilation Objective-C/Xcode ni essai réel du sélecteur iOS et des permissions Photos. Pour valider le comportement réel, tester sur iPhone une sélection mixte (assets accessibles et non accessibles), deux sélections successives rapides, et le passage depuis/vers une autre feuille native.


## Contrôle du 10 novembre 2026 — 06 h (Tokyo) : fermeture UIKit et identité des callbacks

- **Défaut natif corrigé :** lors d'une prise de vue, `UIImagePickerController` était fermé avec `completion:nil` tandis que l'enregistrement `PHPhotoLibrary performChanges` démarrait immédiatement. Un enregistrement très rapide, une image absente ou un refus Photos pouvait terminer le callback Cordova avant la disparition de la feuille caméra. L'utilisateur pouvait alors lancer une nouvelle opération alors que UIKit terminait encore la précédente.
- **Correction** (`a1b0c91`) : la permission Photos et la sauvegarde de la photo ne commencent qu'après le bloc de fin de `dismissViewControllerAnimated:YES`. L'identifiant du callback d'origine est capturé et conservé pendant les opérations asynchrones. Les chemins succès, erreur et refus d'autorisation renvoient la réponse au callback exact ; les réponses asynchrones Photos sont réémises sur la file principale.
- **Annulations et sélecteur** (`5b64a4d`) : `UIImagePickerControllerDidCancel` et `PHPickerViewController didFinishPicking` capturent eux aussi leur callback avant la fermeture UIKit. Aucun callback différé ne se réadresse via `self.pending` vers une autre opération.
- **Régressions** (`988840c`, `20e6838`) : tests statiques Objective-C ajoutés sur le déclenchement de la sauvegarde après fermeture, les callbacks épinglés, le refus asynchrone Photos, l'annulation caméra et le sélecteur.
- **devMcp/touchdeck** : `workspace.sync` réussi au SHA `20e6838d8a11f918c11c7cd8ec5975fc50b7a733` (job `d68bec85577b6fca8e83f1d39a575d04`) ; `project.test` intégral **PASS / exit 0** (job `25b773da51bd84bc58489986a2f5403e`, 481 ms). Les tests concernés sont des vérifications de source Objective-C, non une simulation de UIKit réel.
- **Invariants conservés :** albums paresseux par collection utilisateur, déduplication des `PHAsset`, synchronisation de leur titre par ID, associations photo-lieu locales préservées et absence de suppression automatique.
- **À vérifier sur iPhone :** prendre une photo puis retaper immédiatement sur l'icône caméra, annuler une prise de vue puis ouvrir PHPicker, refuser puis réautoriser Photos, mettre l'application en arrière-plan pendant la demande d'autorisation. La compilation native Objective-C/Xcode et les tests réels ne sont **pas validés**.

## Contrôle du 10 novembre 2026 — 07 h (Tokyo) : interruption iOS et réponse unique des miniatures

- **Caméra et autorisation différée** (`5404cb9`) : la requête `capture` conserve son identifiant Cordova dès le départ. Si l'utilisateur met l'application en arrière-plan pendant la demande d'autorisation caméra, le callback différé n'essaie plus de présenter UIKit : il renvoie une erreur exploitable sur la requête d'origine. Les réponses de refus de permission ne passent plus par un `self.pending` potentiellement remplacé.
- **PHPicker** : vérification de l'état actif de l'application avant présentation. Une requête arrivée alors que l'application est inactive se termine explicitement, sans laisser l'action en attente ; l'utilisateur peut recommencer au retour au premier plan.
- **Miniatures** (`5404cb9`) : les événements PhotoKit dégradés/intermédiaires sont ignorés ; les résultats terminaux sont sérialisés sur la file principale et ne résolvent le callback Cordova qu'une fois. Annulation, erreur PhotoKit, image indisponible et échec d'encodage sont signalés sans toucher aux photos originales ni aux liens locaux.
- **Tests** (`d1067f1`, `37f7a53`) : assertions statiques sur l'identité des callbacks, le refus de présentation UIKit en arrière-plan, la terminaison unique des miniatures et l'absence de suppression.
- **devMcp/touchdeck** : `workspace.sync` réussi au SHA `37f7a5346a3391549fa18e11ef5c62a130dd2f69` ; `project.test` intégral **PASS / exit 0** (521 ms ; job `5469fa493edc011515ceb1dcc6c2ee3b`).
- **Invariants inchangés** : albums créés à la première photo exploitable par collection, identification native stable par collection, déduplication des membres, réparation des noms, association photo-lieu locale et aucune suppression automatique.
- **Vérification sur iPhone restant à faire** : ouvrir la permission caméra puis passer immédiatement en arrière-plan, revenir et recommencer ; refuser/rétablir l'accès Photos dans Réglages ; vérifier qu'une miniature indisponible ne bloque pas la galerie ; vérifier les albums dans Photos. **Aucune compilation Xcode ni validation native sur iPhone n'est revendiquée.**

## Avancement du 10 novembre 2026 — 08 h (Tokyo) : reconstruction complète après suppression manuelle d’album
- Défaut identifié : une association nouvelle (caméra, PHPicker ou bouton « Lier ») ne transmettait que les identifiants nouvellement liés. Si l’album PhotoKit avait été supprimé manuellement ou si un précédent ajout avait échoué, sa recréation restait incomplète jusqu’à une synchronisation générale ultérieure.
- Correction : une association déclenche maintenant une agrégation de toutes les photos encore liées aux lieux appartenant à la ou aux collections du lieu modifié. Les autres collections ne sont pas resynchronisées par cette action ciblée. Les identifiants sont dédupliqués avant l’appel natif, et PhotoKit continue d’ajouter seulement les assets absents.
- Le module natif withAlbumAuthorization vérifie à nouveau PHAccessLevelReadWrite après la réponse à la boîte d’autorisation iOS, juste avant d’accéder à la photothèque. Un accès devenu limité/refusé renvoie une erreur explicite, sans supprimer les liens locaux.
- Nouveaux tests comportementaux : reconstruction depuis des photos liées à plusieurs lieux, absence d’écriture dans une collection indépendante, import PHPicker réconciliant les anciennes associations. Contrôle statique natif du nouvel examen d’autorisation. L’assertion historique du bouton « Lier » a été alignée sur cette réconciliation complète.
- Vérification effective : synchronisation devMcp réussie au commit 4384a9eeab7a5ba7f638e13677dee5cf30e6c4a6, puis project.test PASS (exit 0, 496 ms, suite complète npm test). Une première exécution avait échoué sur l’ancienne assertion du bouton « Lier » ; correction committée, puis suite relancée avec succès.
- Non vérifié : compilation Xcode, exécution réelle PhotoKit et permissions iOS sur iPhone. Les tests Objective-C cités restent des inspections de sources, et le comportement de reconstruction doit être contrôlé physiquement.
- Prochain contrôle : essais iPhone — autorisation Photos limitée → complète dans Réglages, suppression manuelle d’album, nouvelle association photo, vérification que les anciens originaux sont à nouveau visibles sans copie supplémentaire ; vérification de l’absence de suppression après déliaison ou suppression de collection.

## Contrôle du 10 novembre 2026 — 09 h (Tokyo) : sécurité des callbacks et autorisations après interruption

- **Correction native** (`26ccc18`) dans `NearbyPhotos.m` : `replyTo` remet maintenant toutes les réponses Cordova sur le thread principal, y compris celles issues des handlers PhotoKit exécutés hors-main. Il ne libère `self.pending` que si le callback reçu appartient encore à cette requête. Aucun effacement d'album ni de photo n'est ajouté.
- **Opérations d'album** : `withAlbumAuthorization` vérifie désormais que l'application est active **avant** une demande de permission puis **après** son retour, et relit `PHAccessLevelReadWrite` sur le thread principal juste avant `work()`. Si l'utilisateur passe en arrière-plan ou réduit les droits, l'opération est refusée avec un message indiquant la conservation des associations photo-lieu. `collections-ui.js` déclenche déjà la réconciliation au `resume`.
- **Régressions** (`55deef5`) : assertions statiques ciblant le passage sur le thread principal, la protection de `pending`, les deux barrières d'état actif, le réexamen de permission et l'absence de suppression. Ces tests ne simulent pas les transitions d'état réelles d'iOS.
- **devMcp/touchdeck** : `workspace.sync` réussi sur `55deef562fdf92025abff741f2bb93771c1d6cb6` (job `493665ca55934ea8dd2461a08f089b1b`) ; `project.test` intégral **PASS — exit 0**, 516 ms (job `08ca995617c52e4e45db405a4fbcf9dc`). Les tests natifs restent statiques sur Linux.
- **Limites** : aucune compilation Objective-C/Xcode ni installation/validation iPhone. La correction d'interruption doit être vérifiée après construction Cordova sur macOS : permission Photos ouverte puis mise en arrière-plan, retour/autorisation, nouvelle synchronisation, conservation des associations, absence de doublons et de suppression.
