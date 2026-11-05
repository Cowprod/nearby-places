# Nearby Places

Application Cordova iOS-first (Android plus tard) pour mémoriser des lieux et recevoir, à terme, une notification quand on passe à proximité. Dépôt public `Cowprod/nearby-places`.

## Première version prête à essayer sur Mac : V0.1.1
- Catalogue de 5 lieux (Tokyo Station, Sensō-ji, HARD OFF Kinshichō Marui, Fender Flagship Tokyo, Tamiya Plamodel Factory Tokyo). Le fichier `www/data/places.sample.json` est embarqué pour les utilisations hors ligne.
- Au lancement : tentative de téléchargement depuis `https://raw.githubusercontent.com/Cowprod/nearby-places/main/data/places.sample.json` (délai maximum 8 secondes). Si échec : dernier cache GitHub, puis catalogue embarqué.
- Les lieux ajoutés manuellement et le statut « visité » sont conservés lors des mises à jour du catalogue distant. Les modifications manuelles restent locales : elles ne sont pas poussées sur GitHub.
- Liste des lieux, ajout manuel, marquage « visité », stockage local navigateur.
- Bouton **Tester ma position** : demande l'autorisation iOS **Pendant l'utilisation** et affiche une distance à vol d'oiseau.
- Pas de suivi arrière-plan, de géofencing ni de notification locale dans cette première compilation. La V0.2 ajoutera le plugin Swift approprié.
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
- Le plugin officiel `cordova-plugin-geolocation` est déclaré, ainsi que `NSLocationWhenInUseUsageDescription`. Le GPS ne démarre que lorsqu'on appuie sur le bouton.
- Il ne doit pas être considéré comme un tracker de position tâche de fond. Les clés de permission `Always` et le mode `location` ne seront ajoutés qu'avec une implémentation native justifiant leur usage.
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
1. Créer un vrai plugin iOS Swift Core Location pour géofencing et notifications locales, avec essais écran verrouillé.
2. Réutiliser l'interface sur Android avec GeofencingClient et permissions modernes.
3. Ajouter éventuellement une synchronisation montante via un endpoint authentifié si l'ajout depuis l'app doit modifier Git.
4. Ajouter recherche MapKit, extension Partager iOS et imports Takeout Google Maps en V2/V3.

## Test de catalogue
`npm test`
