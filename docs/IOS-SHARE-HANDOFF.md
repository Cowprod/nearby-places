# Reprise Nearby Places — 8 novembre 2026

## Branche de travail

Les corrections de `fix/ios-share-extension-architecture` sont intégrées dans
`main`. Pour les prochaines modifications, partir de `origin/main` à jour et
créer une nouvelle branche de travail. L'ancienne branche conserve l'historique
de cette série de corrections.
Le dépôt est `Cowprod/nearby-places` et le projet devMCP est `nearby-places`
(workspace Linux `/srv/devmcp/workspaces/nearby-places`, machine `touchdeck`).
Inspecter l'état Git du workspace avant de récupérer la branche. Préserver
les modifications éventuelles ; aucun reset forcé ni remplacement du checkout.

## Sources faisant autorité

- `native/ios/` : formulaire de partage, storyboard et entitlements.
- `local-plugins/cordova-plugin-nearby-resolver/` : plugin Cordova local,
  résolution Maps, stockage et sélection native sur carte.
- `scripts/patch-share-extension.js` : génération du target `ShareExt` et
  synchronisation native ; appelé par le hook du plugin local.
- `www/` : application ; `public/` doit rester identique pour la prévisualisation.
- `package-lock.json` : dépendances reproductibles.

`platforms/`, `plugins/`, `node_modules/` et `work/` ne sont pas des sources
à éditer ou versionner. `work/` contient notamment des diagnostics et des
copies locales de données d'appareil : ne pas les publier.
Après modification d'un fichier natif, exécuter `cordova prepare ios` ;
ne jamais corriger uniquement un fichier généré.
La copie JavaScript du plugin doit conserver son enveloppe `cordova.define`.

## Fonctionnement actuel

L'extension reste dans Plans/Google Maps et vérifie les coordonnées avant
de confirmer la sauvegarde. Elle n'essaie pas de lancer l'app principale.
Un partage validé est écrit atomiquement dans le dossier `NearbyShares`
du groupe `group.fr.cowprod.nearbyplaces.shareextension`.
L'app lit le partage et ne l'acquitte qu'après enregistrement local ou
reconnaissance d'un doublon. Les anciennes données NSUserDefaults restent lues.

Un import en échec est mis en pause, sans nouvelle tentative automatique.
Le bilan permet de réessayer ou supprimer l'import après confirmation.
La zone Imports partagés affiche uniquement les échecs encore en attente ;
les réussites sont masquées et la zone disparaît lorsqu'elle est vide.
L'option de sélection sur carte a été retirée de l'app et de l'extension
à la demande de l'utilisateur après essai. Son code natif historique reste
versionné, mais aucun bouton du parcours courant ne l'appelle.
Les confirmations de suppression sont intégrées aux cartes de l'interface
(Confirmer la suppression / Annuler), sans utiliser `window.confirm`,
dont l'absence de dialogue a été reproduite dans la WebView du simulateur.

Les lieux sont triés : non visités, catégorie alphabétique, saisie récente.
Leur suppression est confirmée. Les lieux du catalogue supprimés sont
masqués durablement lors des actualisations suivantes.

## Contrôles

Sur Linux/devMCP, avec Node et les dépendances installées : `npm test`.
Ce test ne prouve pas le comportement natif d'iOS.

Sur le Mac avec Xcode :

1. `npx cordova prepare ios`
2. `npm test`
3. `npm run ios:verify`
4. `xcodebuild -workspace platforms/ios/App.xcworkspace -scheme App -configuration Debug -destination 'generic/platform=iOS' build`

Pour le simulateur, utiliser le même workspace/scheme avec un SDK et une
destination iOS Simulator. L'App Group exige les entitlements : un build
simulateur totalement non signé ne permet pas de vérifier son stockage.

Le parcours candidat → confirmation → lieu enregistré, le placement par
appui long et l'annulation avec conservation du fichier ont été vérifiés
dans le simulateur iOS 26. Les tests JavaScript couvrent également
annulation, confirmation, commentaire/catégorie, anti-doublon et suppression.
Ce parcours cartographique est historique et n'est plus exposé dans l'UI.
Les nouvelles confirmations de suppression sont testées en JavaScript et
doivent aussi être contrôlées dans l'interface iPhone. Ne pas annoncer une
validation physique sur la seule base de la compilation ou de l'installation.

## Contraintes et limites restantes

- Préserver les données de l'appareil ; mettre à jour sans désinstaller.
- Aucun accès UIKit privé ni lancement détourné de l'app depuis l'extension.
- Ne pas modifier inutilement géolocalisation ou notifications.
- Les recherches MapKit dépendent du réseau ; en cas d'ambiguïté,
  la position est choisie explicitement par l'utilisateur.
- Le pont historique NSUserDefaults peut encore signaler une erreur de
  synchronisation des catégories ; le formulaire contient les six catégories
  canoniques de l'app. Ce point n'a pas été corrigé dans cette série.
- Les Universal Links HTTPS discutés pour ChatGPT ne sont pas implémentés :
  aucun domaine n'a été configuré. Le schéma `nearbyplaces://import` existe ;
  son ouverture depuis ChatGPT iOS reste à valider.
- devMCP sur Linux permet l'édition et les tests JavaScript. La compilation,
  la signature et l'installation iPhone nécessitent le Mac avec Xcode.
