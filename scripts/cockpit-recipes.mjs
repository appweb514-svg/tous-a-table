import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CATEGORY_ALIASES = new Map([
  ['entree', 'entree'],
  ['entrees', 'entree'],
  ['starter', 'entree'],
  ['plat', 'plat'],
  ['plats', 'plat'],
  ['main', 'plat'],
  ['dessert', 'dessert'],
  ['desserts', 'dessert'],
  ['boisson', 'boisson'],
  ['boissons', 'boisson'],
  ['drink', 'boisson'],
]);

const BADGE_CLASSES = new Set(['', 'quick', 'veggie', 'gourmet']);
const MEDIA_FIELDS = ['image', 'imageCard', 'imageThumb'];
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapEntry(entry) {
  const source = isObject(entry) ? entry : {};
  const data = isObject(source.data) ? source.data : source;
  return { data, meta: source };
}

function pick(data, keys) {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function toText(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ');
  if (isObject(value)) return toText(pick(value, ['text', 'label', 'title', 'name', 'value', 'slug']));
  return String(value).trim();
}

export function slugify(value) {
  return toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCategory(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const raw = isObject(candidate)
    ? pick(candidate, ['slug', 'name', 'title', 'value', '_id', 'id'])
    : candidate;
  return CATEGORY_ALIASES.get(slugify(raw)) || 'plat';
}

function normalizeTag(value) {
  if (isObject(value)) return toText(pick(value, ['label', 'title', 'name', 'value', 'text']));
  return toText(value);
}

function normalizeTags(value) {
  let list = value;
  if (isObject(value) && Array.isArray(value.values)) list = value.values;
  if (list === undefined || list === null || list === '') return [];
  return (Array.isArray(list) ? list : [list]).map(normalizeTag).filter(Boolean);
}

function normalizeDuration(value) {
  if (isObject(value)) value = pick(value, ['minutes', 'duration', 'value', 'text']);
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.round(value)} min`;
  const text = toText(value);
  if (!text) return '';
  return /\d/.test(text) ? text : `${text} min`;
}

function normalizeServings(value) {
  if (isObject(value)) value = pick(value, ['value', 'count', 'servings', 'persons', 'text']);
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function normalizeNumber(value, fallback = 0) {
  if (isObject(value)) value = pick(value, ['value', 'amount', 'number']);
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'featured'].includes(slugify(value));
}

function repeaterText(item, kind) {
  if (!isObject(item)) return toText(item);
  if (kind === 'ingredient') {
    const direct = toText(pick(item, ['text', 'label', 'ingredient']));
    if (direct) return direct;
    return [pick(item, ['quantity', 'amount']), toText(pick(item, ['unit', 'unity'])), toText(pick(item, ['name', 'item']))]
      .filter(value => value !== undefined && value !== null && toText(value) !== '')
      .join(' ');
  }
  return toText(pick(item, ['text', 'instruction', 'description', 'step']));
}

function normalizeRepeater(value, kind) {
  const list = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
  return list.map(item => repeaterText(item, kind)).filter(Boolean);
}

function normalizeBadgeClass(value) {
  const candidate = slugify(value);
  return BADGE_CLASSES.has(candidate) ? candidate : '';
}

function entryStatus(entry, field) {
  const { data, meta } = unwrapEntry(entry);
  const value = data?.[field] ?? meta?.[field];
  if (isObject(value)) return pick(value, ['slug', 'value', 'name', 'title', '_id', 'id']);
  return value;
}

export function selectPublishedEntries(entries, { field = 'status', value = 'published' } = {}) {
  if (!Array.isArray(entries)) throw new Error('La réponse Cockpit doit être un tableau.');
  if (!field || value === undefined || value === null || value === '') return [...entries];
  const expected = slugify(value);
  return entries.filter(entry => {
    const status = entryStatus(entry, field);
    if (status === undefined || status === null || status === '') return true;
    if (typeof status === 'boolean') return status;
    return slugify(status) === expected;
  });
}

export function normalizeCockpitEntry(entry, index = 0) {
  const { data, meta } = unwrapEntry(entry);
  const title = toText(pick(data, ['title', 'name']));
  if (!title) throw new Error(`La recette Cockpit n° ${index + 1} n’a pas de titre.`);

  const id = toText(pick(data, ['id', 'code', 'slug']) || meta?._id || meta?.id || `cockpit-${index + 1}`);
  const image = pick(data, ['image', 'cover', 'photo', 'heroImage']) ?? null;
  const imageCard = pick(data, ['imageCard', 'cardImage', 'image']) ?? image;
  const imageThumb = pick(data, ['imageThumb', 'thumbnail', 'image']) ?? image;
  const rating = normalizeNumber(pick(data, ['rating', 'note']), 0);

  return {
    id,
    title,
    desc: toText(pick(data, ['description', 'desc', 'excerpt', 'summary'])),
    cat: normalizeCategory(pick(data, ['category', 'cat', 'type'])),
    tags: normalizeTags(pick(data, ['tags', 'labels', 'keywords'])),
    time: normalizeDuration(pick(data, ['duration', 'time', 'preparationTime'])),
    persons: normalizeServings(pick(data, ['persons', 'servings', 'portions', 'yield'])),
    price: normalizeNumber(pick(data, ['price', 'estimatedPrice', 'budget']), 0),
    rating: String(rating),
    badge: toText(pick(data, ['badge', 'label'])),
    badgeClass: normalizeBadgeClass(pick(data, ['badgeClass', 'badge_class', 'style'])),
    image,
    imageCard,
    imageThumb,
    ingredients: normalizeRepeater(pick(data, ['ingredients', 'ingredientList']), 'ingredient'),
    steps: normalizeRepeater(pick(data, ['steps', 'preparation', 'instructions']), 'step'),
    featured: normalizeBoolean(pick(data, ['featured', 'highlight', 'coupDeCoeur'])),
    sortOrder: normalizeNumber(pick(data, ['sortOrder', 'order', 'position']), index + 1),
    videoUrl: toText(pick(data, ['videoUrl', 'videoURL', 'video'])),
    sourceUrl: toText(pick(data, ['sourceUrl', 'sourceURL', 'originUrl'])),
    sourcePlatform: toText(pick(data, ['sourcePlatform', 'platform'])),
    importedAt: toText(pick(data, ['importedAt']) || meta?._created || ''),
    publishedAt: toText(pick(data, ['publishedAt', 'published_at']) || meta?._modified || ''),
  };
}

function normalizeBaseUrl(value) {
  if (!value) throw new Error('COCKPIT_URL est manquant.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('COCKPIT_URL doit être une URL HTTP(S) sans identifiants.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

export function isCockpitConfigured(env = process.env) {
  return Boolean(toText(env.COCKPIT_URL) && toText(env.COCKPIT_API_TOKEN));
}

export async function fetchCockpitEntries({
  baseUrl,
  token,
  model = 'recipes',
  pageSize = 200,
  maxPages = 50,
  timeoutMs = 15000,
  fetchImpl = fetch,
}) {
  const base = normalizeBaseUrl(baseUrl);
  const entries = [];
  let skip = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`api/content/items/${encodeURIComponent(model)}`, base);
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('skip', String(skip));
    url.searchParams.set('populate', '1');

    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'api-key': token },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`L’API Cockpit a répondu HTTP ${response.status}.`);

    const pageEntries = await response.json();
    if (!Array.isArray(pageEntries)) throw new Error('La réponse Cockpit contient des données inattendues.');
    entries.push(...pageEntries);
    if (pageEntries.length < pageSize) return entries;
    skip += pageSize;
  }

  throw new Error(`La collection Cockpit dépasse la limite de ${maxPages * pageSize} entrées.`);
}

function assetFromValue(value) {
  if (Array.isArray(value)) return value.map(assetFromValue).find(Boolean) || null;
  if (!value) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    if (/^(?:https?:)?\/\//.test(text) || text.startsWith('/') || text.startsWith('img/')) return { url: text };
    if (text.startsWith('data:')) return { data: text };
    return { id: text };
  }
  if (!isObject(value)) return null;

  const nested = isObject(value.asset) ? value.asset : isObject(value.data) ? value.data : null;
  const id = toText(pick(value, ['_id', 'id', 'uuid']) || pick(nested || {}, ['_id', 'id', 'uuid']));
  const url = toText(pick(value, ['url', 'publicUrl', 'public_url']) || pick(nested || {}, ['url', 'publicUrl', 'public_url']));
  const assetPath = toText(pick(value, ['path', 'filepath', 'filePath']) || pick(nested || {}, ['path', 'filepath', 'filePath']));
  const mime = toText(pick(value, ['mime', 'mimetype', 'mimeType']) || pick(nested || {}, ['mime', 'mimetype', 'mimeType']));
  if (!id && !url && !assetPath) return null;
  return { id, url, path: assetPath, mime };
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function resolveAssetUrl(asset, base) {
  const candidate = asset.url || asset.path;
  if (candidate) {
    if (/^https?:\/\//i.test(candidate)) return new URL(candidate);
    if (candidate.startsWith('/')) return new URL(candidate.replace(/^\//, ''), base);
    if (candidate.startsWith('storage/')) return new URL(candidate, base);
    return new URL(`storage/assets/${candidate.replace(/^\/+/, '')}`, base);
  }
  if (asset.id) {
    const url = new URL(`api/assets/image/${encodeURIComponent(asset.id)}`, base);
    url.searchParams.set('o', '1');
    return url;
  }
  return null;
}

function extensionFor(contentType, url, asset) {
  const type = toText(contentType || asset?.mime).split(';')[0].toLowerCase();
  const types = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  if (types[type]) return types[type];
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'].includes(extension)) {
      return extension === '.jpeg' ? 'jpg' : extension.slice(1);
    }
  } catch {}
  return 'jpg';
}

async function downloadAsset({ asset, base, token, recipeId, field, distDir, fetchImpl }) {
  const key = asset.id || asset.url || asset.path;
  const targetUrl = resolveAssetUrl(asset, base);
  if (!targetUrl) throw new Error(` Média Cockpit illisible pour la recette ${recipeId}.`);

  const headers = {};
  if (targetUrl.origin === base.origin) headers['api-key'] = token;
  const response = await fetchImpl(targetUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Un média Cockpit a répondu HTTP ${response.status}.`);

  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_MEDIA_BYTES) throw new Error(`Un média Cockpit dépasse ${MAX_MEDIA_BYTES / 1024 / 1024} Mo.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error(`Un média Cockpit dépasse ${MAX_MEDIA_BYTES / 1024 / 1024} Mo.`);

  const safeRecipeId = slugify(recipeId) || 'recette';
  const safeField = slugify(field) || 'image';
  const relativePath = path.posix.join('img', 'cockpit', `${safeRecipeId}-${safeField}.${extensionFor(response.headers.get('content-type'), targetUrl, asset)}`);
  const outputPath = path.join(distDir, ...relativePath.split('/'));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  return { key, relativePath };
}

export async function localizeRecipeAssets({ recipes, baseUrl, token, distDir, fetchImpl = fetch }) {
  const base = normalizeBaseUrl(baseUrl);
  const cache = new Map();

  for (const recipe of recipes) {
    for (const field of MEDIA_FIELDS) {
      const rawValue = recipe[field];
      if (typeof rawValue === 'string' && (rawValue.startsWith('img/') || safeHttpUrl(rawValue))) {
        const remote = safeHttpUrl(rawValue);
        if (!remote || remote.origin !== base.origin) continue;
      }

      const asset = assetFromValue(rawValue);
      if (!asset) {
        recipe[field] = 'img/hero.jpg';
        continue;
      }
      if (asset.data) {
        recipe[field] = asset.data;
        continue;
      }

      const key = asset.id || asset.url || asset.path;
      if (cache.has(key)) {
        recipe[field] = cache.get(key);
        continue;
      }
      const downloaded = await downloadAsset({ asset, base, token, recipeId: recipe.id, field, distDir, fetchImpl });
      cache.set(downloaded.key, downloaded.relativePath);
      recipe[field] = downloaded.relativePath;
    }
  }

  return recipes;
}

export async function loadCockpitCatalog({
  baseUrl,
  token,
  model = 'recipes',
  publishedField = 'status',
  publishedValue = 'published',
  distDir,
  fetchImpl = fetch,
}) {
  if (!toText(token)) throw new Error('COCKPIT_API_TOKEN est manquant.');
  const entries = await fetchCockpitEntries({ baseUrl, token, model, fetchImpl });
  const published = selectPublishedEntries(entries, { field: publishedField, value: publishedValue });
  if (published.length === 0) throw new Error('Cockpit ne contient aucune recette publiée.');

  const recipes = published.map(normalizeCockpitEntry);
  recipes.sort((a, b) => a.sortOrder - b.sortOrder);
  await localizeRecipeAssets({ recipes, baseUrl, token, distDir, fetchImpl });
  return recipes;
}
