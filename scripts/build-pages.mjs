import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://appweb514-svg.github.io/tous-a-table/';

async function assertLocalAsset(relativePath, recipeTitle) {
  if (!relativePath || /^(?:https?:)?\/\//.test(relativePath) || relativePath.startsWith('data:')) return;
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`Chemin d’image invalide pour « ${recipeTitle} » : ${relativePath}`);
  }
  try {
    await access(path.join(DIST, relativePath));
  } catch {
    throw new Error(`Image manquante pour « ${recipeTitle} » : ${relativePath}`);
  }
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const directory of ['css', 'js', 'img']) {
  await cp(path.join(ROOT, directory), path.join(DIST, directory), { recursive: true });
}
await cp(path.join(ROOT, 'data', 'recipes.json'), path.join(DIST, 'data', 'recipes.json'));
await cp(path.join(ROOT, '.nojekyll'), path.join(DIST, '.nojekyll'));

let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const localModeMarker = '<meta name="site-mode" content="local">';
if (!html.includes(localModeMarker)) {
  throw new Error('Le marqueur de mode local est absent de index.html.');
}
html = html.replace(localModeMarker, '<meta name="site-mode" content="static">');
if (!html.includes(`rel="canonical" href="${SITE_URL}"`)) {
  throw new Error(`L’URL canonique doit pointer vers ${SITE_URL}`);
}
if (!html.includes(`property="og:image" content="${SITE_URL}img/hero.jpg"`)) {
  throw new Error('L’image Open Graph doit utiliser une URL absolue.');
}
await writeFile(path.join(DIST, 'index.html'), html);

const recipes = JSON.parse(await readFile(path.join(ROOT, 'data', 'recipes.json'), 'utf8'));
if (!Array.isArray(recipes) || recipes.length === 0) {
  throw new Error('data/recipes.json doit contenir au moins une recette.');
}

const ids = new Set();
for (const recipe of recipes) {
  if (!recipe.id || ids.has(recipe.id)) throw new Error(`Identifiant de recette absent ou en double : ${recipe.id || '(vide)'}`);
  ids.add(recipe.id);
  if (!recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
    throw new Error(`Recette incomplète : ${recipe.id}`);
  }
  for (const field of ['image', 'imageCard', 'imageThumb']) {
    await assertLocalAsset(recipe[field], recipe.title);
  }
}

console.log(`✓ Export GitHub Pages prêt : ${path.relative(ROOT, DIST)} (${recipes.length} recettes)`);
