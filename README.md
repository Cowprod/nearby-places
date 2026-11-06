# Nearby Places

Application Cordova iOS-first (Android plus tard) pour mémoriser des lieux et recevoir, à terme, une notification quand on passe à proximité. Dépôt public `Cowprod/nearby-places`.

## Première version à compiler sur Mac : V0.2.2 expérimentale
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
- L'import accepte les URL complètes Apple Plans avec coordonnées (`ll`, `coordinate`, `daddr` ou `q` numérique). Une **tentative** de résolution HTTP des liens courts `maps.apple/p/...` et `maps.app.goo.gl/...` est effectuée, mais elle peut échouer dans WKWebView (CORS ou redirection réservée au navigateur). Aucun lieu n'est créé sans coordonnées vérifiées.
- Une Share Extension est désormais **déclarée** via `cordova-plugin-openwith-ios`, mais son fonctionnement, sa signature et son affichage dans la feuille Partager restent à valider sur Mac/iPhone ; le raccourci iOS reste une solution de repli.
- Les lieux restent dans `localStorage` avec les mêmes clés et sont immédiatement transmis au module de géofencing.
- Ne pas supprimer l'app lors de la mise à jour. Sauvegarder les lieux personnels avec **Exporter JSON** avant toute opération risquée.

## Essai des lieux pendant le séjour
- **Rayon local** : saisir une distance de 200 à 2000 m dans « Rayon de déclenchement », valeur initiale 500 m. Ce choix est conservé localement et les zones natives sont resynchronisées si le module est prêt. iOS peut déclencher avec du retard; 500 m est une distance géographique et non une garantie de précision au mètre.
- **Notification sur écran verrouillé** : appuyer sur « Tester une notification dans 10 s », accepter les notifications, puis verrouiller l'iPhone. Cette notification est planifiée par le plugin natif indépendamment du GPS et doit être validée sur téléphone.
- **Depuis Apple Plans** : copier une URL longue avec `ll`, `coordinate` ou `daddr`; coller dans l'import. Une URL `https://maps.apple.com/place?coordinate=35.7,139.7&name=Exemple` est acceptée.
- **Depuis Google Maps** : coller une URL complète contenant des coordonnées (par ex. `https://www.google.com/maps/search/?api=1&query=35.7%2C139.7` ou une URL de fiche avec `!3d...!4d...`). Une URL raccourcie `maps.app.goo.gl` fait l'objet d'une résolution native par le plugin local lorsqu'il est installé ; cette voie n'est pas validée sur iPhone.
- **Depuis une conversation ChatGPT** : demander un lien au format `nearbyplaces://import?ll=LATITUDE,LONGITUDE&name=NOM_ENCODE`, puis le coller dans le champ Importer. Exemple : `nearbyplaces://import?ll=35.7001,139.7702&name=Lieu%20ChatGPT`. Pour l'ouverture automatique, un raccourci iOS peut recevoir ce lien et utiliser **Ouvrir les URL**. Cette fonction n'est pas une intégration native ChatGPT.
- Le code de réception du partage natif est présent mais **n'a pas été validé sur iOS réel**. Collage et Raccourcis restent les méthodes de test fiables ; un `npm test` réussi ne démontre pas le fonctionnement de la Share Extension.

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
- **Partager** : l'option Raccourcis iOS reste la voie de repli tant que la Share Extension n'est pas validée. Les liens courts font l'objet d'une tentative de résolution par `fetch`, qui peut être bloquée par CORS : l'échec ne doit jamais inventer de coordonnées ni modifier les lieux existants.

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

## Robustesse géofencing et tests du 6 novembre 2026

- Les opérations natives `removeGeofences`, `addGeofences`, `startGeofences` et `stop` passent désormais par une file Promise séquentielle. Modifier plusieurs fois le rayon ou le catalogue n'entrelace plus les transactions du SDK.
- Appuyer sur **Arrêter la surveillance** invalide immédiatement toute activation encore en attente de permission, désactive les notifications de proximité JavaScript, puis programme l'arrêt natif en ordre. Ce garde-fou ne constitue pas un contrôle de la fiabilité iOS après suspension.
- Les tests Node simulent un SDK lent, une activation et un arrêt concurrents, la notification à +10 secondes, ainsi qu'un lien Apple court résolu ou bloqué par CORS. Ils n'évaluent ni la livraison sur écran verrouillé, ni la signature CocoaPods/Xcode, ni la disponibilité des callbacks après terminaison.
- Pour un premier contrôle sur Mac **sans appareil physique** : conserver la plateforme iOS existante, effectuer `git pull --ff-only`, puis `npm test` et `npm run ios:build` (si les dépendances natives sont installées). Ne jamais réinitialiser `platforms/ios` ni désinstaller l'application pour dépanner sans sauvegarde préalable.

## Résolveur Maps natif et sauvegarde du projet iOS (build 0.2.2)

- Le nouveau plugin privé est versionné sous `local-plugins/cordova-plugin-nearby-resolver/`. La dépendance `file:local-plugins/cordova-plugin-nearby-resolver` de `package.json` doit être résolue depuis la racine du dépôt, **pas** depuis le dossier `plugins/` que Cordova administre et peut supprimer.
- Le résolveur iOS utilise `NSURLSession` pour tenter les liens courts Apple Plans / Google Maps. Il refuse les URL initiales non HTTPS, les redirections hors des hôtes Maps explicitement autorisés et les réponses HTTP non 2xx. En cas de page HTML Maps avec une URL canonique contenant les coordonnées, le JavaScript peut utiliser ce repli après validation stricte du domaine et des coordonnées. Un échec **ne crée aucun lieu**.
- Les contrôles `npm test` incluent des scénarios simulés de résolution, redirection HTML, refus de destination tierce, callback natif nul et erreur HTTP, ainsi qu'une inspection **statique** du code Objective-C. **Ils ne compilent pas Objective-C, ne démarrent pas Core Location et ne démontrent pas la présentation de la notification sur écran verrouillé.**
- Pour préserver la plateforme et les données locales sur le Mac : vérifier l'état Git avant de récupérer les commits, conserver `platforms/ios` et le workspace Xcode existant, ne pas supprimer l'application installée ni exécuter `cordova platform rm ios`. Après synchronisation et installation des dépendances, `cordova prepare ios` et un build Xcode **sans installation sur appareil** sont les prochaines validations.
- Les précédents fichiers suivis historiquement dans `plugins/cordova-plugin-nearby-resolver` ne sont pas la source à utiliser : `local-plugins/` fait autorité. Des suppressions locales sous `plugins/` peuvent provenir de Cordova ; ne pas restaurer ces fichiers comme source de plugin.
- Sur le Mac, la notification de diagnostic `+10 s` doit encore être testée après compilation : autoriser les notifications, programmer la notification, verrouiller l'écran puis constater la bannière réellement présentée. Le journal `add/trigger/click` ne remplace pas ce constat.

## Partage iOS : démarrage à froid et champs de l'extension (contrôles hors appareil)

- Un lien profond `nearbyplaces://import` reçu **après chargement de `app.js` mais avant `deviceready`** est placé dans une file mémoire (10 liens maximum), puis importé lorsque les plugins Cordova sont disponibles. Les liens successifs ne s'écrasent plus. L'app ne stocke pas ces liens dans le catalogue tant qu'ils ne sont pas validés et dédoublonnés.
- L'extension de partage `cordova-plugin-openwith-ios` peut envoyer le **titre descriptif** dans `intent.text`, tandis que l'URL se trouve dans `intent.items[].data`. L'application privilégie les URL des items, ignore les chaînes sans lien et essaie l'URL suivante si la précédente est rejetée.
- Les tests Node simulent `deviceready`, deux liens arrivant avant l'initialisation et plusieurs champs d'un intent de partage. Ils ne prouvent **ni** la réception d'un lien avant que la fonction JavaScript `handleOpenURL` soit installée **ni** la remise d'un intent après terminaison du processus iOS. Ces cas restent à vérifier dans Xcode/simulateur puis sur iPhone seulement avec autorisation.
- Aucune modification des clés `localStorage`, des cibles Xcode, de `platforms/ios` ni des identifiants de signature n'est nécessaire pour cette correction JavaScript. L'installation de l'extension reste à valider sur Mac.


## Garde-fous iOS du build 0.2.2 (6 novembre 2026)

- `js/deeplink-bootstrap.js` installe `handleOpenURL` **avant** `cordova.js` et conserve au plus dix liens reçus après le chargement de la WebView, avant `app.js`. L'application les rejoue après `deviceready`. Il ne récupère **pas** une URL perdue en code natif avant le chargement de JavaScript : le démarrage à froid avec `cordova-ios@8.1.1` reste à valider sur Mac/iPhone.
- Une URL Google Maps de fiche `/maps/place/…/@latitude,longitude` **sans** marqueur `!3d…!4d…` ou coordonnées explicites est refusée : `@` indique le centre de la caméra et peut pointer loin du commerce. Les URL de vue de carte `/maps/@…` gardent leur sens de point de carte, sans être présentées comme une fiche d'établissement.
- Le bouton de notification à +10 s journalise maintenant la **demande JavaScript**. Le retour d'appel à `schedule()` n'est pas une preuve de planification iOS. Les événements `add`, `trigger` et `click` sont journalisés distinctement lorsqu'ils sont effectivement transmis au JavaScript ; leur absence écran verrouillé ne permet pas de conclure à un défaut de livraison native.
- Les tests du bootstrap et du filtrage du viewport utilisent Node/VM. Ils vérifient la logique JavaScript, **pas** le transport des URL par iOS, la compilation Objective-C ni la Share Extension. Aucun lieu local n'est effacé ou modifié par ces corrections.

## Vérifications iOS du 6 novembre 2026 (build 0.2.3)

- La version du widget Cordova (`config.xml`), celle du paquet npm et celle affichée à l'écran sont alignées sur **0.2.3**. Un test Node vérifie cette cohérence. Le bundle ID `fr.cowprod.nearbyplaces`, les déclarations GPS, les plugins et les clés de stockage sont inchangés.
- Lorsqu'un lien `nearbyplaces://import?url=...` contient une URL Apple Plans courte encodée (cas d'un collage depuis Raccourcis ou ChatGPT), l'application décode et tente de résoudre **l'URL interne** via le résolveur natif avant d'ouvrir le formulaire de confirmation. Les tests simulés couvrent un lien Apple accepté et une destination non autorisée rejetée sans création de lieu.
- L'enregistrement n'est réalisé **qu'après confirmation explicite** du libellé, de la catégorie et de l'éventuel commentaire. La résolution seule ne modifie pas le catalogue personnel.
- Le diagnostic de notification à **+10 secondes** reste une demande JavaScript au plugin. Un retour `add` ou `trigger` journalisé dépend de l'événement effectivement reçu par la WebView. **Aucune livraison sur écran verrouillé n'est établie sans test iPhone.**
- Le contrôle hors appareil reste `npm test` sur TouchDeck. Le build Cordova/Xcode, la signature de ShareExtension et les essais iOS après terminaison de l'application ne sont pas validés sous Linux. Conserver `platforms/ios` et ne pas désinstaller l'application pour faire une mise à jour.

## Diagnostic de plusieurs notifications locales (+10 s)

- Chaque pression sur « Tester une notification dans 10 s » utilise désormais un **identifiant numérique distinct**, réservé dans la plage `2100000000–2139999999` (Int32 signé), afin qu'une seconde pression ne remplace pas une notification encore en attente. Le compteur `nearby-places-test-notification-seq-v1` reste local et n'efface aucun lieu.
- Les événements `add`, `trigger` et `click` sont journalisés avec l'identifiant correspondant ; l'ancien identifiant de test `1999999999` reste reconnu pour les événements déjà programmés avant la mise à jour. Un appel JS à `schedule` n'est **pas** une preuve de livraison sur iPhone verrouillé.
- `npm test` vérifie hors appareil deux demandes consécutives, les identifiants distincts, leur persistance après une relance JavaScript simulée, le filtrage d'un événement étranger et les callbacks simulés. La présentation réelle sur l'écran verrouillé, la réception après suspension/terminaison et le comportement iOS ne sont **pas** validés.


## Import depuis un partage texte — protections supplémentaires (6 novembre 2026)

- Une URL courte Apple Plans (`maps.apple/p/...`) ou Google Maps (`maps.app.goo.gl/...`) copiée avec une ponctuation finale dans un message est nettoyée avant l'appel au résolveur iOS. Les URL non autorisées restent rejetées.
- Les enveloppes `nearbyplaces://import?url=...` imbriquées sont acceptées jusqu'à quatre niveaux, puis refusées explicitement. Un rejet ne crée aucun lieu : la confirmation du formulaire reste obligatoire.
- Les tests Node vérifient ce nettoyage, la limite d'imbrication et la conservation du catalogue local en cas d'erreur. Le résolveur Objective-C, l'extension de partage et la remise native des URL après démarrage à froid ne sont toujours **pas** validés par un build Xcode ou par un essai sur iPhone.

## Protection des imports et des rafraîchissements concurrents (7 novembre 2026 JST)

- Chaque appel à **Actualiser GitHub** ou rechargement possède une génération interne. Une réponse HTTP d'un ancien appel, y compris un repli sur le catalogue embarqué, ne peut plus écraser le catalogue ou son cache après une actualisation plus récente. Les ajouts personnels et leurs clés `localStorage` restent inchangés.
- **Confirmer le lieu** vérifie les doublons une seconde fois juste avant l'enregistrement : un lieu inséré par une autre opération pendant que le formulaire Apple Plans est ouvert ne peut pas être ajouté deux fois.
- Scénarios Node exécutés : réponse réseau ancienne arrivant après la plus récente ; ajout manuel concurrent pendant un import en attente. Il s'agit de tests JavaScript simulés, **pas** d'une validation WKWebView, Xcode, Core Location ou iPhone verrouillé.
- La notification locale à +10 secondes et les liens Apple Plans natifs nécessitent toujours un build iOS, puis un essai réel sur iPhone uniquement sur instruction. Préserver `platforms/ios`, la signature Xcode et l'application installée ; ne pas désinstaller l'application pour effectuer une mise à jour.

## Garde-fou de compatibilité ShareExtension (7 novembre 2026 JST)

- Le hook versionné `scripts/patch-share-extension.js` s'exécute après `cordova prepare ios`, **uniquement si le fichier natif de l'extension existe**. Lorsqu'une version d'OpenWith contient déjà un gestionnaire `public.url` qui fournit `item.data`, le hook conserve ce fichier tel quel : il n'injecte pas un deuxième gestionnaire de liens.
- Pour un ancien gabarit connu dépourvu de cette prise en charge, la transformation reste déterministe et idempotente. En cas de gabarit inconnu, elle refuse l'écriture plutôt que de risquer de corrompre la cible Xcode ; un échec de prepare doit être diagnostiqué sur Mac, **sans supprimer `platforms/ios`**.
- `npm test` inclut désormais `tests/share-extension.patch.test.js` : cas URL déjà natif, transformation d'une fixture synthétique, idempotence et refus de gabarits inattendus, avec interception des accès disque. Ce contrôle est purement **Node/statique** : il ne démontre ni que le plugin publié correspond à la fixture, ni une compilation Objective-C, ni l'apparition de Nearby Places dans la feuille Partager d'Apple Plans.
- Aucun changement des identifiants Cordova, des permissions, des clés `localStorage`, des entitlements Xcode ou des données sur iPhone. La validation de la notification à +10 secondes, écran verrouillé, demeure strictement **non réalisée sur appareil**.

## Robustesse des zones iOS — contrôle hors appareil du 7 novembre 2026

- Le catalogue local peut contenir des données malformées après une restauration ou une ancienne version. Le module de géofencing ignore maintenant les entrées nulles, sans identifiant texte non vide ou dont latitude/longitude sont non finies ou hors limites (±90° / ±180°). Les entrées locales sont **conservées** : cette protection ne nettoie pas ni ne réécrit `localStorage`.
- Un callback `ENTER` ancien visant un lieu devenu invalide est également ignoré : seuls les lieux encore admissibles à la surveillance peuvent produire une demande de notification de proximité.
- `npm test` vérifie ce filtrage avec un SDK JavaScript simulé (`NaN`, `Infinity`, coordonnées hors bornes, type texte, identifiant invalide), puis vérifie qu'un lieu valide continue de notifier. **Aucun SDK Core Location réel, aucune notification à +10 s sur écran verrouillé et aucun import Apple Plans natif n'ont été validés par ces tests.**

## Résilience du catalogue local (7 novembre 2026)

- L'affichage tolère des entrées historiques incomplètes (coordonnées hors schéma, catégories incorrectes, enregistrements nuls) et n'ouvre pas d'itinéraire pour des coordonnées invalides. L'enregistrement brut reste conservé pour récupération ; aucune correction silencieuse des lieux de l'utilisateur n'est effectuée.
- Une réponse GitHub ne supprime plus les entrées locales manuelles malformées ni les enregistrements historiques sans identifiant. Les lieux valides du catalogue distant continuent de se mettre à jour normalement.
- Si `nearby-places-v1` contient un JSON illisible ou un objet inattendu plutôt qu'un tableau, la synchronisation est suspendue **sans réécrire cette clé**. Utiliser la sauvegarde disponible ou examiner les données avant une réinitialisation explicite ; ne pas désinstaller l'app.
- Les tests `npm test` couvrent ces scénarios dans un environnement JavaScript simulé : **ni le stockage WKWebView réel ni la présentation d'une notification sur écran verrouillé ne sont validés**. `config.xml`, les plugins Cordova, les clés de stockage et les cibles Xcode restent inchangés.

## Consentement et diagnostic iOS (7 novembre 2026)

- Au démarrage, `BackgroundGeolocation.ready()` peut signaler un SDK déjà actif (reprise système ou redémarrage). Ce seul état ne vaut **pas consentement** : si la clé locale existante `nearby-places-proximity-v1` ne porte pas explicitement `enabled:true`, l'application refuse les alertes JavaScript et appelle `stop()` sur le SDK. Si l'arrêt échoue, l'initialisation retourne un échec et affiche le diagnostic, sans prétendre que la surveillance native est arrêtée. Un opt-in précédemment enregistré reste respecté si le SDK est déjà actif.
- Les callbacks du plugin de notification `add`, `trigger` et `click` enregistrent maintenant, lorsqu'ils sont fournis, `foreground` et `queued`, en plus de l'identifiant du test à +10 secondes. `queued=true` indique un événement différé reçu par le JavaScript, **pas une preuve de bannière sur écran verrouillé**.
- La suite Node simule un SDK restauré au démarrage sans consentement, un refus enregistré, un consentement enregistré et un échec de `stop()` ; elle contrôle également les indicateurs de callback. La compilation Xcode, la remise des événements après suspension et la présentation iOS restent non vérifiées. Ne pas déployer ou désinstaller l'app sur iPhone sans instruction ; conserver `platforms/ios` et les données locales.

## Retrait de consentement et arrêt natif asynchrone (7 novembre 2026)

- Le bouton **Arrêter la surveillance** écrit désormais immédiatement `enabled:false` dans la clé **existante** `nearby-places-proximity-v1`, avant toute opération `stop()` du SDK. Le callback JS est également désactivé immédiatement. Ainsi, une fermeture de la WebView, un rejet de `stop()` ou un appui avant `deviceready` ne laisse plus un ancien opt-in en place pour le prochain démarrage.
- L'application distingue explicitement **retrait du consentement local** et **arrêt natif confirmé**. En cas d'échec du SDK, elle affiche l'erreur : le service natif peut encore fonctionner jusqu'à un arrêt réussi. Lors d'une initialisation suivante, si le SDK déclare être actif sans consentement, l'application retente `stop()` ; cela ne remplace pas une vérification physique.
- `npm test` simule le rejet de `stop()`, une reprise où le SDK est encore actif et un appui sur Arrêter avant `deviceready`. Le test contrôle aussi que `nearby-places-v1` n'est pas modifiée. Il ne prouve **pas** l'arrêt effectif de Core Location ni l'affichage d'une notification à +10 s sur écran verrouillé.
- `config.xml`, la plateforme `platforms/ios`, les plugins et les identifiants iOS ne sont pas modifiés par ce correctif. Aucun déploiement sur iPhone.
