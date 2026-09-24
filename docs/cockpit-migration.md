# Migration progressive vers Cockpit CMS

## Architecture

```text
Cockpit CMS (contenu privé)
          │  API-key GitHub Actions
          ▼
Export statique + médias téléchargés
          │
          ▼
      GitHub Pages
```

Le catalogue JSON reste la source par défaut. Cockpit n’est utilisé que lorsqu’un build est explicitement lancé avec `CATALOG_SOURCE=cockpit`. Le jeton Cockpit n’est jamais envoyé au navigateur.

## Collection `recipes`

| Champ Cockpit | Type | Champ du site |
|---|---|---|
| `title` | Texte, requis | `title` |
| `description` | Texte | `desc` |
| `category` | Sélecteur : `entree`, `plat`, `dessert`, `boisson` | `cat` |
| `tags` | Set | `tags` |
| `duration` | Texte ou nombre en minutes | `time` |
| `servings` | Nombre | `persons` |
| `price` | Nombre | `price` |
| `rating` | Nombre entre 0 et 5 | `rating` |
| `badge` | Texte | `badge` |
| `badgeClass` | Sélecteur : vide, `quick`, `veggie`, `gourmet` | `badgeClass` |
| `image` | Asset image | `image` |
| `imageCard` | Asset image, facultatif | `imageCard` |
| `imageThumb` | Asset image, facultatif | `imageThumb` |
| `ingredients` | Repeater avec un champ texte `text` | `ingredients` |
| `steps` | Repeater avec un champ texte `text` | `steps` |
| `status` | Sélecteur : `draft`, `published` | Filtre de publication |
| `featured` | Case à cocher | Carte mise en avant |
| `sortOrder` | Nombre | Ordre d’affichage |
| `videoUrl` | URL, facultatif | Lecteur vidéo |
| `sourceUrl` | URL, facultatif | Attribution |
| `sourcePlatform` | Texte, facultatif | Libellé de la source |Les Repeater peuvent aussi utiliser des objets structurés. L’adaptateur accepte notamment `{ quantity, unit, name }` pour les ingrédients et `{ instruction }` pour les étapes.

## Configuration sécurisée

Créer dans Cockpit une **API key personnalisée** avec un rôle strictement en lecture, limitée au contenu public. Ne pas activer la lecture directe depuis le navigateur.

Configurer les variables du dépôt :

```bash
gh variable set COCKPIT_URL --body "https://cms.votredomaine.fr"
gh variable set COCKPIT_RECIPES_MODEL --body "recipes"
gh variable set COCKPIT_PUBLISHED_FIELD --body "status"
gh variable set COCKPIT_PUBLISHED_VALUE --body "published"
gh secret set COCKPIT_API_TOKEN
```

`COCKPIT_API_TOKEN` est stocké comme secret GitHub. Ne pas le placer dans un fichier `.env` versionné.

## Prévisualisation locale

```bash
CATALOG_SOURCE=cockpit \
COCKPIT_URL="https://cms.votredomaine.fr" \
COCKPIT_API_TOKEN="..." \
COCKPIT_STRICT=true \
npm run build
```

Le résultat est inspectable dans `dist/`. Les images Cockpit protégées sont téléchargées dans `dist/img/cockpit/` et ne dépendent plus du jeton après le build.

## Prévisualisation GitHub sans bascule

1. Ouvrir **Actions → Deploy GitHub Pages → Run workflow**.
2. Choisir `catalog_source: cockpit`.
3. Décocher `deploy`.
4. Télécharger l’artefact `github-pages` et vérifier `dist/data/recipes.json` ainsi que `dist/data/catalog-meta.json`.

## Bascule progressive

1. Importer les recettes actuelles dans la collection Cockpit.
2. Vérifier les champs et les images dans l’aperçu.
3. Lancer le workflow avec `cockpit` et `deploy: true`.
4. Contrôler le site public.
5. Conserver `data/recipes.json` comme sauvegarde pendant au moins une semaine.

Les workflows déclenchés par `push` utilisent volontairement `CATALOG_SOURCE=json`. Un push de code ne bascule donc jamais le site par inadvertance vers Cockpit.

## Rollback immédiat

Relancer le workflow avec :

- `catalog_source: json`
- `deploy: true`

Le catalogue JSON connu est alors redéployé immédiatement. Il est également possible de revenir au dernier commit stable sur GitHub.

## Limites à conserver

Cockpit CMS remplace le stockage et l’administration des recettes. Il ne remplace pas les comptes utilisateurs, les favoris, la newsletter ou l’import vidéo/Whisper. Ces fonctions restent dans le backend local jusqu’à ce qu’une décision séparée soit prise.

## Automatisation ultérieure

Une fois la bascule validée, ajouter une planification GitHub Actions ou un webhook Cockpit pour reconstruire le site sans commit. Cette automatisation reste volontairement désactivée pendant la phase de migration.
