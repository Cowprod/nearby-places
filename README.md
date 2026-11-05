# Nearby Places

Application Cordova iOS-first (Android plus tard) pour mémoriser des lieux et recevoir, à terme, une notification quand on passe à proximité. Dépôt public `Cowprod/nearby-places`.

## Première version à compiler sur Mac : V0.2.0 expérimentale
- Catalogue de 5 lieux (Tokyo Station, Sensō-ji, HARD OFF Kinshichō Marui, Fender Flagship Tokyo, Tamiya Plamodel Factory Tokyo). Le fichier `www/data/places.sample.json` est embarqué pour les utilisations hors ligne.
- Au lancement : tentative de téléchargement depuis `https://raw.githubusercontent.com/Cowprod/nearby-places/main/data/places.sample.json` (délai maximum 8 secondes). Si échec : dernier cache GitHub, puis catalogue embarqué.
- Les lieux ajoutés manuellement et le statut « visité » sont conservés lors des mises à jour du catalogue distant. Les modifications manuelles restent locales : elles ne sont pas poussées sur GitHub.
- Liste des lieux, ajout manuel, marquage « visité », stockage local navigateur.
- Bouton **Tester ma position** : demande l'autorisation iOS **Pendant l'utilisation** et affiche une distance à vol d'oiseau.
- Géofencing expérimental avec `cordova-background-geolocation-lt@5.5.1` en mode **startGeofences**, sans suivi GPS continu. Boutons Activer/Arrêter et rayon configurable (500 m par défaut, de 200 à 2000 m). Notifications locales via `cordova-plugin-local-notification@1.2.3`.
- L'utilisateur doit autoriser la localisation « Toujours » et les notifications. Le géofencing ne se lance **pas automatiquement à la première installation**.
- Les notifications sont émises lors des événements de géofencing reçus par JavaScript. **La notification après terminaison ou suspension complète de la WebView n'est pas garantie** : test réel iPhone indispensable.
- L'écran de prévisualisation (devMcp) utilise `public/`, copie de `www/` : les modifications doivent être reportées dans les deux dossiers tant qu'un mécanisme de génération n'est pas en place.

## Compilation iOS sur le MacBook
Prérequis : Xcode opérationnel, outils CLI Xcode, Node.js >=20.17, CocoaPods >=1.16, git. Le build iOS est possible **uniquement sur macOS**. Le projet utilise Cordova CLI 13.0.0 et demande cordova-ios 8.1.1.

Cloner le dépôt public, puis dans son dossier :

```sh
npm install
npm run ios:add
```

Ouvrir ensuite `platforms/ios/App.xcworkspace` dans Xcode, sélectionner le compte Apple dans Signing & Capabilities et l'iPhone ou le simulateur, puis Build/Run.

On peut aussi demander un build sans signature avec `npm run ios:build` ; pour signer et installer sur iPhone, préférer Xcode.

En cas de défaut de configuration : `npm run ios:requirements`. Ne jamais versionner `platforms/`, `plugins/`, `node_modules/` ni les identifiants de signature.

## Partage Apple Plans (première étape : lien profond iOS)
- L'app accepte désormais le schéma `nearbyplaces://import?url=...`, où `url` contient un lien Apple Plans encodé en URL.
- Un raccourci iOS depuis la feuille de partage peut recevoir une URL, construire `nearbyplaces://import?url=<URL encodée>`, puis utiliser l'action **Ouvrir les URL**. L'application doit être installée avec le nouveau plugin et recompilée.
- L'import accepte actuellement uniquement les URL Apple Plans contenant des coordonnées `ll`, `coordinate` ou `daddr`. Les liens courts (`maps.apple`, `maps.app.goo.gl`) et certaines fiches Plans ne fonctionneront pas encore.
- **Il ne s'agit pas encore d'une Share Extension native** : Nearby Places n'apparaît pas automatiquement comme destination de partage. Cette étape prépare le traitement et le dédoublonnage, avant l'extension native.
- Les lieux restent dans `localStorage` avec les mêmes clés et sont immédiatement transmis au module de géofencing.
- Ne pas supprimer l'app lors de la mise à jour. Sauvegarder les lieux personnels avec **Exporter JSON** avant toute opération risquée.

## Essai des lieux pendant le séjour
- **Rayon local** : saisir une distance de 200 à 2000 m dans « Rayon de déclenchement », valeur initiale 500 m. Ce choix est conservé localement et les zones natives sont resynchronisées si le module est prêt. iOS peut déclencher avec du retard; 500 m est une distance géographique et non une garantie de précision au mètre.
- **Notification sur écran verrouillé** : appuyer sur « Tester une notification dans 10 s », accepter les notifications, puis verrouiller l'iPhone. Cette notification est planifiée par le plugin natif indépendamment du GPS et doit être validée sur téléphone.
- **Depuis Apple Plans** : copier une URL longue avec `ll`, `coordinate` ou `daddr`; coller dans l'import. Une URL `https://maps.apple.com/place?coordinate=35.7,139.7&name=Exemple` est acceptée.
- **Depuis Google Maps** : coller une URL complète contenant des coordonnées (par ex. `https://www.google.com/maps/search/?api=1&query=35.7%2C139.7` ou une URL de fiche avec `!3d...!4d...`). Une URL raccourcie `maps.app.goo.gl` n'est pas encore résolue.
- **Depuis une conversation ChatGPT** : demander un lien au format `nearbyplaces://import?ll=LATITUDE,LONGITUDE&name=NOM_ENCODE`, puis le coller dans le champ Importer. Exemple : `nearbyplaces://import?ll=35.7001,139.7702&name=Lieu%20ChatGPT`. Pour l'ouverture automatique, un raccourci iOS peut recevoir ce lien et utiliser **Ouvrir les URL**. Cette fonction n'est pas une intégration native ChatGPT.
- Le partage **direct** depuis le bouton Partager d'Apple Plans ou Google Maps vers l'app reste à réaliser via une Share Extension iOS. La version actuelle accepte seulement le collage ou un raccourci iOS. Ne pas annoncer ce partage comme terminé.

## Limitations
- Le plugin officiel `cordova-plugin-geolocation` permet la mesure GPS ponctuelle. Le plugin natif Transistor Software gère la surveillance de zones à partir d'une autorisation explicite.
- La V0.2 demande `Always` et déclare `UIBackgroundModes/location`. Le rayon local de 500 m par défaut (réglable de 200 à 2000 m) est purement géographique : MapKit et les vraies 15 minutes à pied sont à venir. Ne pas vendre cette V0.2 comme un calcul d'itinéraire.
- Le plugin Transistor Software fonctionne sans licence en **build DEBUG**, une licence est nécessaire pour RELEASE (y compris iOS avec la version 5). La compilation sur Mac et les plugins CocoaPods ne sont pas validés ici.
- Le catalogue téléchargé et les nouvelles entrées sont stockés localement dans `localStorage` : désinstaller l'application peut effacer les modifications. Synchronisation **descendante uniquement**, de GitHub vers l'app ; elle est tentée à chaque ouverture.
- Le client doit disposer d'un accès Internet pour la mise à jour. Aucune authentification et aucun secret GitHub embarqué. Le JSON est public : ne pas y mettre de données privées.
- Le GPS ponctuel est câblé ; le géofencing natif et l'émission de notifications sont **implémentés mais uniquement testés en simulation JavaScript**. Leur fiabilité en arrière-plan et les autorisations iOS restent à valider sur iPhone. La requête réseau doit aussi être vérifiée en WebView iOS.
- Les lieux de démonstration sont des fixtures (coordonnées indicatives), pas des recommandations touristiques.

## Arborescence
- `config.xml` : configuration iOS, autorisations GPS Toujours/Pendant l'utilisation, mouvement et mode arrière-plan.
- `package.json` : CLI Cordova, GPS, géofencing et notifications locales.
- `www/` : interface Cordova et catalogue embarqué.
- `public/` : prévisualisation statique devMcp.
- `data/` : source de référence JSON.
- `tests/` : tests de structure et simulation des événements de géofencing (opt-in, anti-doublon, arrêt, refus de permission).

## Suite
1. Compiler le projet dans Xcode puis tester les permissions « Toujours », la notification à l'entrée d'une zone, et les limites iOS écran verrouillé/terminaison. Si les callbacks JavaScript ne peuvent pas notifier après terminaison, déclencher la notification native iOS plutôt que prétendre à une fiabilité inexistante.
2. Valider Android avec le plugin Cordova existant, puis les permissions Android modernes.
3. Ajouter éventuellement une synchronisation montante via un endpoint authentifié si l'ajout depuis l'app doit modifier Git.
4. Ajouter recherche MapKit, extension Partager iOS et imports Takeout Google Maps en V2/V3.

## Contrôles de robustesse avant le premier build iPhone

- **Notification native à +10 secondes** : le bouton demande l'autorisation puis planifie une notification locale. Le journal distingue désormais la demande de planification, le callback natif `add`, le callback `trigger` et le clic utilisateur `click`. Seul un essai réel sur l'écran verrouillé établira que la bannière est effectivement affichée ; un callback `trigger` JavaScript peut ne pas arriver lorsque la WebView est suspendue.
- **Import Maps** : les URL Apple Plans comportant `ll`, `coordinate`, `daddr` ou des coordonnées dans `q` sont interprétées. Pour Google Maps, les coordonnées `!3d...!4d...` du lieu priment sur les coordonnées `@latitude,longitude` du viewport et sur une recherche textuelle `q`. Les liens sans coordonnées exploitables restent refusés : aucun géocodage inventé.
- **Préservation locale** : « Réinitialiser les lieux » exige désormais une confirmation explicite, car cette opération efface aussi les ajouts manuels et le cache du catalogue. Le paramètre local de rayon et le journal de diagnostic ne sont pas concernés. En cas de doute, conserver les données et utiliser l'export JSON ; l'export lui-même doit encore être confirmé dans WKWebView iOS.
- **Premier build** : sur Mac, exécuter `npm install`, puis `npm run ios:add` uniquement si la plateforme iOS n'est pas encore installée ; ensuite ouvrir le workspace Xcode. Un build de validation sans installation sur iPhone peut être effectué sur macOS. **Aucun test natif, signature Xcode, notification écran verrouillé ni partage iOS ne sont attestés par les tests Node sur TouchDeck.**
- **Partager** : en attendant une Share Extension native, l'option Raccourcis iOS décrite ci-dessous reste la voie proposée. Les URL courtes `maps.apple/p/...` et `maps.app.goo.gl/...` doivent être développées en une URL complète portant des coordonnées, faute de quoi leur import échoue proprement.

## Tests hors appareil
`npm test` exécute les contrôles du catalogue et les tests comportementaux simulés. Cela ne constitue pas un build Xcode ni un essai sur iPhone.

La surveillance ne démarre que depuis « Activer la surveillance » sur un téléphone réel. Une prévisualisation web n'active pas de géofencing. Ne pas utiliser d'appareil physique sans instruction.

## Partage depuis iOS sans extension native (Raccourcis)

Pour éviter d'installer un plugin de Share Extension non vérifié dans le projet iOS existant, utiliser provisoirement un raccourci iOS visible dans la feuille Partager d'Apple Plans et Google Maps :

1. Créer un raccourci « Ajouter à Nearby Places », activer « Afficher dans la feuille de partage », accepter les URL et le texte.
2. Ajouter l'action « Obtenir les URL de l'entrée » (si l'entrée est du texte, utiliser son URL).
3. Ajouter l'action « Encoder l'URL » avec l'URL reçue.
4. Ajouter une action Texte : `nearbyplaces://import?url=[URL encodée]` (remplacer le segment entre crochets par la variable magique issue de l'étape 3).
5. Ajouter « Ouvrir les URL » sur le texte précédent.

Ce flux affiche le raccourci dans Partager mais **pas l'app elle-même**. La réception des liens courts Google Maps reste à valider : le raccourci peut avoir besoin de l'action « Développer l'URL » avant l'encodage, suivant la version iOS. Les liens dépourvus de coordonnées ne peuvent pas être ajoutés sans géocodage. Une extension native reste un chantier distinct, nécessitant une cible Xcode, un App Group et une validation de signature sur Mac.

## Extension native iOS (expérimentale, configuration Xcode requise)

Le plugin `cordova-plugin-openwith-ios@2.0.0` ajoute une cible Xcode `ShareExtension` pour recevoir les URL/textes depuis la feuille Partager. `www/js/app.js` reçoit `cordova.openwith.addHandler` et transmet les URL au parseur existant. Le plugin utilise le schéma distinct `nearbyplacesshare` pour réveiller l'application, et le schéma existant `nearbyplaces` pour les liens ChatGPT.

**Configuration indispensable sur Mac :** après `cordova prepare ios`, ouvrir `platforms/ios/App.xcworkspace` ; dans Signing & Capabilities, activer **App Groups** sur **App** et **ShareExtension** avec exactement `group.fr.cowprod.nearbyplaces.shareextension`, choisir la même équipe de signature, et vérifier des identifiants de bundle distincts (`fr.cowprod.nearbyplaces` et `fr.cowprod.nearbyplaces.shareextension`). Vérifier que la cible extension possède le même deployment target minimum que l'application. Le plugin n'automatise pas l'activation App Groups.

**Limites :** ce plugin ancien n'est pas encore validé avec Cordova iOS 8.1.1 / iOS 26 sur iPhone ; la compilation et le lancement doivent être contrôlés dans Xcode. Les liens courts Google Maps nécessitent encore une résolution. Ne pas désinstaller l'app existante ni supprimer `platforms/ios` pour tenter une réparation sans sauvegarde.
