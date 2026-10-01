# Prisme

Application Android de fonds d'écran : Unsplash (thème *Wallpapers* en priorité), Pexels, packs curés
et galerie du téléphone. Interface Material You (Material 3, couleurs dynamiques, clair/sombre auto).

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

**Options** (désactivées par défaut, *Réglages → Options avancées*)
- Fonds dynamiques : selon l'heure, la météo (Open-Meteo, sans clé), la saison ou la batterie.
- Fond animé avec parallaxe (capteur coupé quand le fond est masqué ou en économie d'énergie).
- Rotation à intervalle (WorkManager, 15 min à 24 h).
- Éditeur : flou, assombrissement, grain, dégradé, texte, noir et blanc.
- Générateur de fonds minimalistes (uni, dégradés, aurore, vagues, formes).
- Aperçu de la palette Material You que donnera un fond.
- Fonds accueil/verrouillage liés (variante floue, sombre, gros plan…).
- Mode focus : fond épuré pendant des plages horaires, puis retour au fond habituel.

Les automatismes (fonds dynamiques, rotation, mode focus) tournent app fermée. Priorités :
mode focus, puis fonds dynamiques, puis rotation.

## Installer l'APK

Chaque push lance le workflow **Android** (onglet *Actions*). L'APK release est dans les
artefacts du run (`Prisme-x.y.z.N`). Un tag `v*` publie aussi une release GitHub, toujours signée
avec la vraie clé : sans les secrets `KEYSTORE_*` valides, le run échoue dès le début (ajouter les
secrets puis *Re-run all jobs*).

## Secrets GitHub

*Settings → Secrets and variables → Actions → New repository secret* :

| Secret | Rôle |
|---|---|
| `UNSPLASH_ACCESS_KEY` | Access Key d'une application sur https://unsplash.com/oauth/applications |
| `PEXELS_API_KEY` | Clé obtenue sur https://www.pexels.com/api/new/ |
| `KEYSTORE_BASE64` | Clé de signature release (fichier PKCS12, alias `prisme`) encodée en base64 |
| `KEYSTORE_PASSWORD` | Mot de passe de cette clé |

Les clés API sont injectées au build et ne figurent jamais dans le code. Sans backend, elles
restent extractibles de l'APK : le risque se limite à l'usage du quota. Une application Unsplash
débute en mode « demo » (50 requêtes/heure) ; la demande de passage en production se fait depuis
la page de l'application sur unsplash.com.

Sans `KEYSTORE_BASE64`/`KEYSTORE_PASSWORD`, l'APK release est signé avec une clé de debug,
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
| `INTERNET` | Unsplash, Pexels, Open-Meteo, packs |
| `ACCESS_COARSE_LOCATION` | Météo des fonds dynamiques, seulement si « Ma position » est utilisé |

L'import passe par le sélecteur de photos du système : aucune permission de stockage.

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
    sources/              Unsplash, Pexels, galerie, filtres, flux paginés
    packs/                packs curés
    preview/              aperçu, recadrage, simulation, application
    library/              favoris, collections, historique, hors ligne, créations
    settings/             réglages et options avancées
    automation/           fonds dynamiques, rotation, mode focus (configuration)
    live/                 fond animé
    editor/               éditeur
    generator/            générateur
    palette/              palette Material You
    linked/               fonds liés
    diagnostics/          test du plugin natif sur l'appareil
  shared/                 thème Material 3, composants, ponts natifs, utilitaires
android/app/src/main/java/io/karelisio/prisme/
  wallpaper/              application des fonds, cache d'images, import, thème système
  automation/             moteur de règles, WorkManager, météo
  live/                   service de fond animé (parallaxe)
packs/packs.json          manifeste des packs curés
```
