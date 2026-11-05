# Nearby Places

Application Cordova iOS-first (Android plus tard) pour mémoriser des lieux et recevoir, à terme, une notification quand on passe à proximité. Dépôt public `Cowprod/nearby-places`.

## Première version à compiler sur Mac : V0.2.0 expérimentale
- Catalogue de 5 lieux (Tokyo Station, Sensō-ji, HARD OFF Kinshichō Marui, Fender Flagship Tokyo, Tamiya Plamodel Factory Tokyo). Le fichier `www/data/places.sample.json` est embarqué pour les utilisations hors ligne.
- Au lancement : tentative de téléchargement depuis `https://raw.githubusercontent.com/Cowprod/nearby-places/main/data/places.sample.json` (délai maximum 8 secondes). Si échec : dernier cache GitHub, puis catalogue embarqué.
- Les lieux ajoutés manuellement et le statut « visité » sont conservés lors des mises à jour du catalogue distant. Les modifications manuelles restent locales : elles ne sont pas poussées sur GitHub.
- Liste des lieux, ajout manuel, marquage « visité », stockage local navigateur.
- Bouton **Tester ma position** : demande l'autorisation iOS **Pendant l'utilisation** et affiche une distance à vol d'oiseau.
- Géofencing expérimental avec `cordova-background-geolocation-lt@5.5.1` en mode **startGeofences**, sans suivi GPS continu. Boutons Activer/Arrêter et rayon de test 1000 m. Notifications locales via `cordova-plugin-local-notification@1.2.3`.
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

Ouvrir ensuite `platforms/ios/Nearby Places.xcworkspace` dans Xcode (l'intitulé exact peut varier selon les versions de Cordova), sélectionner le compte Apple dans Signing & Capabilities et l'iPhone ou le simulateur, puis Build/Run.

On peut aussi demander un build sans signature avec `npm run ios:build` ; pour signer et installer sur iPhone, préférer Xcode.

En cas de défaut de configuration : `npm run ios:requirements`. Ne jamais versionner `platforms/`, `plugins/`, `node_modules/` ni les identifiants de signature.

## Limitations
- Le plugin officiel `cordova-plugin-geolocation` permet la mesure GPS ponctuelle. Le plugin natif Transistor Software gère la surveillance de zones à partir d'une autorisation explicite.
- La V0.2 demande `Always` et déclare `UIBackgroundModes/location`. Le rayon de 1000 m est purement géographique : MapKit et les vraies 15 minutes à pied sont à venir. Ne pas vendre cette V0.2 comme un calcul d'itinéraire.
- Le plugin Transistor Software fonctionne sans licence en **build DEBUG**, une licence est nécessaire pour RELEASE (y compris iOS avec la version 5). La compilation sur Mac et les plugins CocoaPods ne sont pas validés ici.
- Le catalogue téléchargé et les nouvelles entrées sont stockés localement dans `localStorage` : désinstaller l'application peut effacer les modifications. Synchronisation **descendante uniquement**, de GitHub vers l'app ; elle est tentée à chaque ouverture.
- Le client doit disposer d'un accès Internet pour la mise à jour. Aucune authentification et aucun secret GitHub embarqué. Le JSON est public : ne pas y mettre de données privées.
- Le GPS et les notifications en arrière-plan ne sont pas encore disponibles. La requête réseau sur iOS doit être validée sur un appareil/simulateur Mac réel.
- Les lieux de démonstration sont des fixtures (coordonnées indicatives), pas des recommandations touristiques.

## Arborescence
- `config.xml` : configuration mobile et permission iOS au premier plan.
- `package.json` : CLI Cordova et plugin GPS.
- `www/` : interface Cordova et catalogue embarqué.
- `public/` : prévisualisation statique devMcp.
- `data/` : source de référence JSON.
- `tests/` : tests de structure de données.

## Suite
1. Compiler le projet dans Xcode puis tester les permissions « Toujours », la notification à l'entrée d'une zone, et les limites iOS écran verrouillé/terminaison. Si les callbacks JavaScript ne peuvent pas notifier après terminaison, déclencher la notification native iOS plutôt que prétendre à une fiabilité inexistante.
2. Valider Android avec le plugin Cordova existant, puis les permissions Android modernes.
3. Ajouter éventuellement une synchronisation montante via un endpoint authentifié si l'ajout depuis l'app doit modifier Git.
4. Ajouter recherche MapKit, extension Partager iOS et imports Takeout Google Maps en V2/V3.

## Test de catalogue
`npm test`

La surveillance ne démarre que depuis « Activer la surveillance » sur un téléphone réel. Une prévisualisation web n'active pas de géofencing. Ne pas utiliser d'appareil physique sans instruction.
