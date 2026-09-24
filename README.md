# Tous à table

Catalogue de recettes statique publié automatiquement avec **GitHub Pages**.

🌐 **Site en ligne :** https://appweb514-svg.github.io/tous-a-table/

## Prévisualiser la version publiée localement

Aucune dépendance n’est nécessaire : le projet utilise uniquement HTML, CSS et JavaScript natifs.

```bash
node scripts/build-pages.mjs
python3 -m http.server 4173 --directory dist
```

Ouvrez ensuite http://localhost:4173.

## Mettre le site à jour

1. Modifiez les fichiers dans `index.html`, `css/`, `js/`, `img/` ou `data/recipes.json`.
2. Lancez `node scripts/build-pages.mjs` pour vérifier la version statique.
3. Poussez vos modifications sur la branche `main`.
4. Le workflow **Deploy GitHub Pages** reconstruit et publie automatiquement le site.

## Migration Cockpit CMS

Le build fonctionne par défaut avec `data/recipes.json`. Cockpit n’est activé que manuellement via `CATALOG_SOURCE=cockpit`, ce qui permet de tester le nouveau contenu sans modifier le site public lors d’un simple `git push`.

Le guide complet — modèle de collection, secrets GitHub, aperçu, bascule et rollback — se trouve dans [`docs/cockpit-migration.md`](docs/cockpit-migration.md).

```bash
npm run verify
```

Cette commande contrôle la syntaxe, exécute les tests de migration Cockpit et construit GitHub Pages.

## Ce qui est publié

Le dépôt public contient uniquement le catalogue, le design et les images nécessaires. Le backend local, les comptes, les favoris, les imports, les sauvegardes et les clés API ne sont pas publiés.
