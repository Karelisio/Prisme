# Packs curés

`packs.json` est lu par l'app au démarrage depuis la branche `main` du dépôt : une modification
est visible sans republier l'APK (la copie embarquée sert de secours hors ligne).

Chaque pack a un `id`, un `title`, une `description`, deux `colors` (vignette) et des `sources` :

| Type | Champs | Exemple |
|---|---|---|
| `unsplash-collection` | `id` | une collection créée sur unsplash.com avec les photos choisies à la main |
| `pexels-collection` | `id` | une collection Pexels |
| `unsplash-search` / `pexels-search` | `query`, `color` facultatif | `{ "type": "unsplash-search", "query": "desert dunes" }` |
| `unsplash-topic` | `slug` | `wallpapers` |
| `images` | `items` : `url`, `width`, `height`, `thumb`, `author`… | images hébergées dans ce dossier |

Pour une sélection 100 % manuelle, le plus simple est une collection Unsplash : crée-la sur le site,
ajoute les photos, puis remplace les sources du pack par `{ "type": "unsplash-collection", "id": "…" }`.
