# Nearby Places

Application Cordova iOS-first (Android ensuite) pour mémoriser des lieux et recevoir une alerte à proximité. Prototype V0.1.

## État réel
- Dépôt privé / espace devMcp provisionnés sur touchdeck.
- UI Cordova dans `www/` : liste, ajout manuel, marqueur « visité », GPS **premier plan uniquement**.
- Catalogue de démonstration dans `data/places.sample.json` (source) et `www/data/places.sample.json` (copie embarquée dans l'app). Les deux doivent rester synchronisées.
- L'affichage de distance utilise Haversine (vol d'oiseau), **pas** un vrai itinéraire à pied.
- **Non implémentés** : plugin geofencing natif, notifications locales, synchronisation serveur, recherche MapKit, partage iOS, import Google Maps et builds natifs. Ne pas considérer l'application comme un tracker arrière-plan fonctionnel.

## Installation sur Mac (lors du retour)
Prérequis : Node.js, Cordova CLI, Xcode et outils iOS. Depuis le clone :
```sh
npm install
cordova platform add ios
```
Puis ouvrir / construire le projet iOS avec Xcode (signature Apple nécessaire). `cordova.js` est fourni par Cordova lors du build et absent en prévisualisation HTTP normale. Les autorisations GPS/notifications et le plugin natif seront ajoutés avant les essais arrière-plan.

## Android / ADB
Le serveur touchdeck héberge le workspace devMcp mais les autorisations d'actions ADB restent à configurer explicitement pour le projet. Le fait que d'autres projets comme MultiCam puissent interroger ADB ne signifie pas que Nearby Places peut le faire automatiquement. Ne pas installer sur des appareils physiques sans validation.

## Modèle de lieux V1
`schemaVersion`, `collection`, `categories`, `places[]`. Chaque lieu : `id`, `name`, `latitude`, `longitude`, `categories[]`, `notes`, `alert` (`enabled`, `walkingMinutes`, `cooldownHours`), `visited`, `source`.
La précision du GPS et les durées de marche ne doivent pas être présentées comme garanties.

## Feuille de route
1. Catalogue et validation JSON, synchronisation sécurisée via devMcp, sans jeton GitHub dans le client.
2. Plugin Swift Core Location iOS, autorisations explicites, géofencing dynamique (20 régions), journal des événements et notifications locales.
3. Plugin Kotlin Android GeofencingClient (100 zones), permissions Android modernes et tests ADB.
4. Recherche native et partage de lieux, imports Takeout Google Maps.
5. Test terrain avec iPhone verrouillé, réseau intermittent, consommation électrique, règles anti-spam.

## Tests
`npm test` (si Node.js disponible) vérifie le catalogue d'exemple. Les tests GPS réels restent à faire.
