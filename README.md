# Prisme

Application Android de fonds d'écran : Unsplash, Pexels, packs curés et galerie du téléphone.
React + Vite + TypeScript, empaquetée avec Capacitor 8, avec un plugin natif Kotlin (WallpaperManager).

## Installer l'APK

Chaque push lance le workflow **Android** (onglet *Actions*). L'APK release est dans les
artefacts du run (`Prisme-x.y.z.N`). Un tag `v*` publie aussi une release GitHub.

## Secrets GitHub

*Settings → Secrets and variables → Actions → New repository secret* :

| Secret | Rôle |
|---|---|
| `UNSPLASH_ACCESS_KEY` | Access Key d'une application sur https://unsplash.com/oauth/applications |
| `PEXELS_API_KEY` | Clé obtenue sur https://www.pexels.com/api/new/ |
| `KEYSTORE_BASE64` | Clé de signature release (fichier PKCS12, alias `prisme`) encodée en base64 |
| `KEYSTORE_PASSWORD` | Mot de passe de cette clé (16 caractères minimum conseillés) |

Les clés API sont injectées au build et ne figurent jamais dans le code. Sans backend, elles
restent extractibles de l'APK : le risque se limite à l'usage du quota.

Sans `KEYSTORE_BASE64`/`KEYSTORE_PASSWORD`, l'APK est signé avec une clé de debug : il s'installe,
mais il faudra désinstaller l'app pour passer ensuite à un APK signé avec la vraie clé.

Créer la clé de signature (sur un ordinateur avec Java) :

```sh
keytool -genkeypair -storetype PKCS12 -keystore prisme.p12 -alias prisme \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 prisme.p12   # macOS : base64 -i prisme.p12
```

Garde `prisme.p12` et son mot de passe en lieu sûr : sans eux, impossible de publier une mise à jour
installable par-dessus l'app existante.

## Développement

```sh
npm install
cp .env.example .env.local   # facultatif : clés API pour le développement
npm run dev                  # app dans le navigateur (pont natif simulé)
npm test                     # tests unitaires (Vitest)
npm run e2e                  # tests e2e (Playwright, mobile simulé)
npm run build && npx cap sync android
cd android && ./gradlew testDebugUnitTest assembleDebug
```

## Structure

```
src/
  app/                 shell de l'application
  features/<feature>/  une fonctionnalité = un dossier (UI, logique, tests)
  shared/
    native/            pont TypeScript du plugin natif + implémentation web
    lib/               utilitaires
android/app/src/main/java/io/karelisio/prisme/
  wallpaper/           plugin Capacitor : application du fond, cache d'images, import, thème système
```
