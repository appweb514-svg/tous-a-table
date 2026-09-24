import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCockpitConfigured, loadCockpitCatalog } from './cockpit-recipes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://appweb514-svg.github.io/tous-a-table/';
const REQUESTED_SOURCE = (process.env.CATALOG_SOURCE || 'json').toLowerCase();
const STRICT_COCKPIT = ['1', 'true', 'yes', 'on'].includes(String(process.env.COCKPIT_STRICT || '').toLowerCase());

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

async function readFallbackRecipes() {
  const recipes = JSON.parse(await readFile(path.join(ROOT, 'data', 'recipes.json'), 'utf8'));
  if (!Array.isArray(recipes) || recipes.length === 0) {
    throw new Error('data/recipes.json doit contenir au moins une recette.');
  }
  return recipes;
}

async function resolveRecipes() {
  if (REQUESTED_SOURCE === 'json') {
    return { recipes: await readFallbackRecipes(), source: 'json' };
  }
  if (REQUESTED_SOURCE !== 'cockpit') {
    throw new Error(`CATALOG_SOURCE invalide : ${REQUESTED_SOURCE}`);
  }

  try {
    if (!isCockpitConfigured()) throw new Error('COCKPIT_URL ou COCKPIT_API_TOKEN est manquant.');
    const recipes = await loadCockpitCatalog({
      baseUrl: process.env.COCKPIT_URL,
      token: process.env.COCKPIT_API_TOKEN,
      model: process.env.COCKPIT_RECIPES_MODEL || 'recipes',
      publishedField: process.env.COCKPIT_PUBLISHED_FIELD || 'status',
      publishedValue: process.env.COCKPIT_PUBLISHED_VALUE || 'published',
      distDir: DIST,
    });
    return { recipes, source: 'cockpit' };
  } catch (error) {
    if (STRICT_COCKPIT) {
      throw new Error(`Source Cockpit indisponible : ${error.message}`, { cause: error });
    }
    console.warn(`⚠ Cockpit indisponible (${error.message}) — repli sur data/recipes.json.`);
    return { recipes: await readFallbackRecipes(), source: 'json-fallback' };
  }
}

await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'data'), { recursive: true });

for (const directory of ['css', 'js', 'img']) {
  await cp(path.join(ROOT, directory), path.join(DIST, directory), { recursive: true });
}
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

const { recipes, source } = await resolveRecipes();
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

await writeFile(path.join(DIST, 'data', 'recipes.json'), `${JSON.stringify(recipes, null, 2)}\n`, 'utf8');
await writeFile(path.join(DIST, 'data', 'catalog-meta.json'), `${JSON.stringify({
  source,
  requestedSource: REQUESTED_SOURCE,
  recipeCount: recipes.length,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`, 'utf8');

console.log(`✓ Export GitHub Pages prêt : ${path.relative(ROOT, DIST)} (${recipes.length} recettes, source ${source})`);
