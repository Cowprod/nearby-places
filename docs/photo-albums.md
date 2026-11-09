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
- **Aucune compilation native Xcode ni validation sur iPhone** n'a été faite depuis ces modifications.

Règle de suivi : rapporter les commits, le résultat réel des tests et les blocages. Ne jamais confondre succès des tests JS et validation native iOS.
