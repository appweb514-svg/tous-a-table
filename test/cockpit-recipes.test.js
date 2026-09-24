import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadCockpitCatalog,
  normalizeCockpitEntry,
  selectPublishedEntries,
} from '../scripts/cockpit-recipes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sampleEntry(overrides = {}) {
  return {
    _id: 'cockpit-recipe-1',
    _created: 1700000000,
    _modified: 1700000100,
    status: 'published',
    title: 'Tomates rôties au basilic',
    description: 'Une recette légère et parfumée.',
    category: { slug: 'entrees' },
    tags: { values: ['Été', { label: 'Végétarien' }] },
    duration: 25,
    servings: 4,
    price: '12',
    rating: 4.8,
    badge: 'Coup de cœur',
    badgeClass: 'quick',
    image: { _id: 'asset-1', mime: 'image/jpeg' },
    ingredients: [
      { quantity: '4', unit: 'tomates', name: 'rouges' },
      { text: 'Sel et poivre' },
    ],
    steps: [{ instruction: 'Rôtir les tomates.' }],
    featured: true,
    sortOrder: 1,
    sourceUrl: 'https://example.test/recette',
    ...overrides,
  };
}

test('ne conserve que les entrées Cockpit publiées', () => {
  const selected = selectPublishedEntries([
    sampleEntry(),
    sampleEntry({ _id: 'draft', status: 'draft' }),
    sampleEntry({ _id: 'boolean', status: true }),
    sampleEntry({ _id: 'without-status', status: undefined }),
  ]);

  assert.deepEqual(selected.map(entry => entry._id), ['cockpit-recipe-1', 'boolean', 'without-status']);
});

test('normalise les champs Cockpit vers le schéma du site', () => {
  const recipe = normalizeCockpitEntry(sampleEntry());

  assert.equal(recipe.id, 'cockpit-recipe-1');
  assert.equal(recipe.cat, 'entree');
  assert.equal(recipe.time, '25 min');
  assert.equal(recipe.persons, 4);
  assert.equal(recipe.price, 12);
  assert.equal(recipe.rating, '4.8');
  assert.deepEqual(recipe.tags, ['Été', 'Végétarien']);
  assert.deepEqual(recipe.ingredients, ['4 tomates rouges', 'Sel et poivre']);
  assert.deepEqual(recipe.steps, ['Rôtir les tomates.']);
  assert.equal(recipe.featured, true);
});

test('authentifie l’API et télécharge les médias Cockpit dans dist', async () => {
  const distDir = await mkdtemp(path.join(ROOT, '.test-tmp-'));
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/api/content/items/recipes')) {
      return new Response(JSON.stringify([sampleEntry()]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url).includes('/api/assets/image/asset-1')) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }
    throw new Error(`Appel inattendu : ${url}`);
  };

  try {
    const recipes = await loadCockpitCatalog({
      baseUrl: 'https://cms.example.test',
      token: 'secret-test-token',
      distDir,
      fetchImpl,
    });

    assert.equal(recipes.length, 1);
    assert.match(recipes[0].image, /^img\/cockpit\/cockpit-recipe-1-image\.jpg$/);
    assert.equal(recipes[0].imageCard, recipes[0].image);
    assert.equal(recipes[0].imageThumb, recipes[0].image);
    await access(path.join(distDir, ...recipes[0].image.split('/')));
    assert.deepEqual(await readFile(path.join(distDir, ...recipes[0].image.split('/'))), Buffer.from([1, 2, 3, 4]));
    assert.ok(calls.every(call => call.options.headers?.['api-key'] === 'secret-test-token'));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
