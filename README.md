# Prisme

Application Android de fonds d'écran : Unsplash (thème *Wallpapers* en priorité), Pexels, Wallhaven,
Pixabay, peintures du Cleveland Museum of Art, images de la NASA, packs curés et galerie du téléphone.
Interface Material You (Material 3, couleurs dynamiques, clair/sombre auto).

React + Vite + TypeScript, empaquetée avec Capacitor 8, avec des plugins natifs Kotlin
(WallpaperManager, WorkManager, WallpaperService).

## Fonctionnalités

**Base**
- Grille virtualisée à défilement infini, catégories, recherche (en français), filtres couleur et format.
- Images filtrées en portrait haute résolution ; miniatures basse résolution, pleine résolution
  téléchargée seulement au moment d'appliquer. Attribution du photographe sur chaque aperçu.
- Packs curés (`packs/packs.json`, modifiables sans republier l'app) et import depuis la galerie.
- Aperçu plein écran : zoom, recadrage, simulation de l'écran d'accueil et de verrouillage.
- Application sur l'accueil, le verrouillage ou les deux.
- Favoris, collections, historique, cache hors ligne (flux déjà vus, miniatures, favoris en pleine
  résolution).
- Partage (avec le crédit du photographe), enregistrement dans la galerie, passage au fond voisin
  d'un glissement, « Annuler » après une application et « Revenir au fond précédent ».
- Tuile « Fond suivant » (Réglages rapides) et raccourcis de l'icône : suivant, favori au hasard,
  rechercher.

**Découverte**
- Sources : Wallhaven (tout public, sans clé), Pixabay (clé facultative, 1280 px au plus, désactivée
  par défaut), Art (Cleveland Museum of Art, domaine public), Espace (NASA), activables une à une.
- Tendances, Nouveautés, Anime, Jeux vidéo ; « Fond du jour » en tête d'« À la une », avec
  notification quotidienne facultative à l'heure choisie.
- « Plus comme ça » (même sujet ou même couleur), « Pour toi » (suggestions calculées sur le téléphone
  d'après les favoris), suivre un photographe Unsplash (onglet « Abonnements »).
- Filtres : couleur au nuancier, AMOLED (noirs profonds) ; « Ne plus voir » un fond, un auteur ou un
  sujet, géré dans *Réglages → Contenus masqués*.
- Sauvegarde et restauration (fichier JSON), « HD seulement en Wi-Fi », retours haptiques.
- Mises à jour intégrées depuis les releases GitHub (APK vérifié : même appli, même signature).
- Journal d'erreurs (interface et natif) partageable depuis *Réglages → Diagnostic*.

**Options** (désactivées par défaut, *Réglages → Options avancées*)
- Fonds dynamiques : selon l'heure (heures fixes ou lever/coucher du soleil de ta ville), la météo
  (Open-Meteo, sans clé), la saison, la batterie ou le mode sombre du téléphone.
- Fond animé avec parallaxe (capteur coupé quand le fond est masqué ou en économie d'énergie) ;
  option « à chaque déverrouillage » : nouvelle image d'une liste (favoris, collection) tous les N
  déverrouillages, avec un fondu.
- Rotation à intervalle (WorkManager, 15 min à 24 h) : fonds pris au hasard en ligne (thème, mot-clé
  ou « Pour toi », sources activées, Wi-Fi seulement en option ; recherché par le natif, app fermée,
  3 fonds préchargés pour changer hors ligne), parmi les favoris et collections, ou les photos d'un
  dossier du téléphone ; rotation intelligente (pas de répétition, teintes variées, sombre la nuit).
- Fêtes et dates perso : Noël, Halloween, Pâques, anniversaires… fond choisi ou thème trouvé en ligne.
- Assombrir le soir : voile progressif après le coucher du soleil, effacé avant le lever.
- Selon le lieu : un fond par lieu (maison, travail…), rayon réglable ; position lue app fermée.
- Pochette de la musique : le fond devient la pochette du morceau en cours (fond flouté autour),
  puis le fond précédent revient quand la musique s'arrête.
- Éditeur : flou, assombrissement, grain, dégradé, texte, noir et blanc.
- Générateur de fonds minimalistes (uni, dégradés, aurore, vagues, formes).
- Aperçu de la palette Material You que donnera un fond.
- Fonds accueil/verrouillage liés (variante floue, sombre, gros plan…).
- Mode focus : fond épuré pendant des plages horaires, puis retour au fond habituel.

Les automatismes tournent app fermée. Priorités : pochette de la musique, mode focus, fête du jour,
lieu, fonds dynamiques, puis rotation ; quand l'un se termine, le suivant reprend ou le fond choisi à
la main revient.

## Installer l'APK

Chaque push lance le workflow **Android** (onglet *Actions*). L'APK release est dans les
artefacts du run (`Prisme-x.y.z.N`). Un tag `v*`, ou *Run workflow* avec l'option « release »,
publie aussi une release GitHub (tag `v` + version de `package.json`), toujours signée
avec la vraie clé : sans les secrets `ANDROID_KEYSTORE_*` valides, le run échoue dès le début (ajouter les
secrets puis *Re-run all jobs*).

## Secrets GitHub

*Settings → Secrets and variables → Actions → New repository secret* :

| Secret | Rôle |
|---|---|
| `UNSPLASH_ACCESS_KEY` | Access Key d'une application sur https://unsplash.com/oauth/applications |
| `PEXELS_API_KEY` | Clé obtenue sur https://www.pexels.com/api/new/ |
| `PIXABAY_API_KEY` | Facultatif : clé gratuite sur https://pixabay.com/api/docs/ (source Pixabay) |
| `ANDROID_KEYSTORE_BASE64` | Clé de signature release (fichier PKCS12 contenant une seule clé, alias lu automatiquement) encodée en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Mot de passe de cette clé |

Les clés API sont injectées au build et ne figurent jamais dans le code. Sans backend, elles
restent extractibles de l'APK : le risque se limite à l'usage du quota. Une application Unsplash
débute en mode « demo » (50 requêtes/heure) ; la demande de passage en production se fait depuis
la page de l'application sur unsplash.com.

Sans `ANDROID_KEYSTORE_BASE64`/`ANDROID_KEYSTORE_PASSWORD`, l'APK release est signé avec une clé de debug,
conservée d'un build à l'autre : chaque APK s'installe par-dessus le précédent. Passer ensuite à la
vraie clé impose de désinstaller l'app une fois.

Créer la clé de signature (sur un ordinateur avec Java) :

```sh
keytool -genkeypair -storetype PKCS12 -keystore prisme.p12 -alias prisme \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 prisme.p12   # macOS : base64 -i prisme.p12
```

Garde `prisme.p12` et son mot de passe en lieu sûr : sans eux, impossible de publier une mise à jour
installable par-dessus l'app existante.

## Permissions Android

| Permission | Pourquoi |
|---|---|
| `SET_WALLPAPER` | Appliquer les fonds |
| `INTERNET` | Sources d'images, Open-Meteo, packs, mises à jour |
| `ACCESS_COARSE_LOCATION` | Météo des fonds dynamiques, seulement si « Ma position » est utilisé |
| `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` | « Selon le lieu » seulement : savoir où tu es, app fermée |
| `ACCESS_NETWORK_STATE` | « HD seulement en Wi-Fi » : savoir si la connexion est limitée |
| `REQUEST_INSTALL_PACKAGES` | Mises à jour intégrées (Android demande l'accord une fois) |
| `WRITE_EXTERNAL_STORAGE` | Enregistrer dans la galerie, Android 9 et moins seulement |
| `POST_NOTIFICATIONS` | Notification « Fond du jour », demandée seulement si elle est activée (Android 13+) |

L'import passe par le sélecteur de photos du système : aucune permission de lecture du stockage.
« Pochette de la musique » demande l'accès aux notifications dans les réglages Android : il sert
seulement à voir le morceau en cours (aucune notification n'est lue).

## Publier une version

1. Monter `version` dans `package.json` et écrire `release-notes/<version>.md` (affichées aussi dans
   la feuille de mise à jour de l'app).
2. *Actions → Android → Run workflow* avec l'option « release » (ou pousser un tag `v<version>`).
3. Les téléphones équipés de Prisme proposent la mise à jour au lancement suivant.

## Développement

```sh
npm install
cp .env.example .env.local   # facultatif : clés API pour le développement
npm run dev                  # app dans le navigateur (plugins natifs simulés)
npm run typecheck
npm test                     # tests unitaires (Vitest)
npm run e2e                  # parcours e2e (Playwright, mobile simulé, API simulées)
npm run build && npx cap sync android
cd android && ./gradlew testDebugUnitTest assembleDebug
```

## Structure

```
src/
  app/                    shell : navigation, onglets, bouton retour, cache des requêtes
  features/
    browse/               Explorer : grille, catégories, recherche, filtres
    sources/              Unsplash, Pexels, Wallhaven, Pixabay, musée, NASA, galerie, filtres, flux
    discover/             fond du jour, plus comme ça, pour toi, abonnements, contenus masqués
    packs/                packs curés
    preview/              aperçu, recadrage, simulation, application
    library/              favoris, collections, historique, hors ligne, créations
    settings/             réglages et options avancées
    automation/           fonds dynamiques, rotation, mode focus, fêtes, soir, lieux (configuration)
    live/                 fond animé, liste « à chaque déverrouillage »
    music/                pochette de la musique
    editor/               éditeur
    generator/            générateur
    palette/              palette Material You
    linked/               fonds liés
    diagnostics/          journal d'erreurs, test du plugin natif sur l'appareil
    updates/              mises à jour intégrées (releases GitHub)
    backup/               sauvegarde et restauration
  shared/                 thème Material 3, composants, ponts natifs, utilitaires
android/app/src/main/java/io/karelisio/prisme/
  wallpaper/              application des fonds, cache d'images, import, thème système
  automation/             moteur de règles, WorkManager, météo, soleil, fêtes, lieux, dossier
  live/                   service de fond animé (parallaxe, déverrouillage)
  music/                  écoute des sessions média, composition de la pochette
  quick/                  tuile « Fond suivant », raccourcis de l'icône
  system/                 version, mises à jour, réseau, fichiers, vibrations, journal d'erreurs,
                          notification « Fond du jour »
packs/packs.json          manifeste des packs curés
```
