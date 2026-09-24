'use strict';

const STATIC_SITE = document.querySelector('meta[name="site-mode"]')?.content === 'static';

/* ═══════════════════════ RECIPE DATA ═══════════════════════ */
let recipes = [];

async function loadRecipes() {
  if (!STATIC_SITE) {
    try {
      const res = await fetch('/api/recipes');
      if (res.ok) {
        recipes = await res.json();
        syncHeroStats();
        syncPageMetadata();
        syncFeaturedRecipes();
        return;
      }
    } catch {
      /* API indisponible — fallback statique */
    }
  }
  const res = await fetch('data/recipes.json');
  if (!res.ok) throw new Error('Impossible de charger les recettes');
  recipes = await res.json();
  syncHeroStats();
  syncPageMetadata();
  syncFeaturedRecipes();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function syncHeroStats() {
  const values = {
    count: recipes.length,
    rating: recipes.length ? recipes.reduce((sum, r) => sum + (Number.parseFloat(r.rating) || 0), 0) / recipes.length : 0,
    categories: new Set(recipes.map(r => r.cat).filter(Boolean)).size,
  };
  counterObserver.disconnect();
  counterAnimation += 1;
  document.querySelectorAll('[data-stat]').forEach(el => {
    const value = values[el.dataset.stat] ?? 0;
    el.dataset.count = String(value);
    el.dataset.counted = 'false';
    el.textContent = el.dataset.decimal === 'true' ? '0.0' : '0';
    counterObserver.observe(el);
  });
}

function syncPageMetadata() {
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = `${location.origin}${location.pathname}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Recettes Tous à table',
    numberOfItems: recipes.length,
    itemListElement: recipes.slice(0, 20).map((recipe, position) => ({
      '@type': 'ListItem',
      position: position + 1,
      name: recipe.title,
      url: `${location.origin}${location.pathname}#recette-${encodeURIComponent(recipe.id || position)}`,
    })),
  };
  let script = document.getElementById('recipeSchema');
  if (!script) {
    script = document.createElement('script');
    script.id = 'recipeSchema';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

window.refreshRecipes = async function refreshRecipes() {
  await loadRecipes();
  renderGrid();
};

window.retryRecipes = async function retryRecipes() {
  const error = document.getElementById('siteError');
  error.hidden = true;
  paintSkeletons(8);
  try {
    await loadRecipes();
    renderGrid();
  } catch {
    error.hidden = false;
  }
};

/* ═══════════════════════ STATE ═══════════════════════ */
let currentFilter = 'all';
let searchQuery = '';
let lastFocusedEl = null;
let modalAnimFrame = null;
let activeRecipe = null;
let viewer = null;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
const categoryLabels = { entree: 'Entrée', plat: 'Plat', dessert: 'Dessert', boisson: 'Boisson' };

/* ═══════════════════════ HELPERS ═══════════════════════ */
function getYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  return m ? m[1] : null;
}

function getRecipeImageSrc(r) {
  const ytId = getYoutubeId(r.videoUrl || r.sourceUrl);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return r.imageCard || r.image || 'img/hero.jpg';
}

function formatPrice(value) {
  const price = Number(value);
  return price > 0 ? `≈ ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price)}` : 'Prix à estimer';
}

function getRecipeImageHTML(r, className, alt = '') {
  return `<img class="${className}" src="${getRecipeImageSrc(r)}" alt="${alt || r.title}" loading="lazy" decoding="async">`;
}

function syncFeaturedRecipes() {
  document.querySelectorAll('.featured-card[data-recipe-id]').forEach(card => {
    const recipe = recipes.find(item => item.id === card.dataset.recipeId);
    if (!recipe) return;
    const image = card.querySelector('.featured-img');
    if (image) {
      image.src = getRecipeImageSrc(recipe);
      image.alt = recipe.title;
    }
    const badge = card.querySelector('.featured-badge');
    if (badge) {
      badge.textContent = recipe.badge || '';
      badge.hidden = !recipe.badge;
    }
    const time = card.querySelector('.featured-time-value');
    if (time) time.textContent = recipe.time;
    const label = card.querySelector('.featured-label');
    if (label) label.textContent = `${categoryLabels[recipe.cat] || recipe.cat} · ${recipe.time}`;
    const title = card.querySelector('.featured-title');
    if (title) title.textContent = recipe.title;
    const desc = card.querySelector('.featured-desc');
    if (desc) desc.textContent = recipe.desc;
    const values = {
      persons: `${recipe.persons} personnes`,
      price: formatPrice(recipe.price),
      rating: recipe.rating,
      tags: (recipe.tags || []).join(' · '),
    };
    card.querySelectorAll('[data-featured-meta]').forEach(meta => {
      const value = meta.querySelector('[data-featured-value]');
      if (value) value.textContent = values[meta.dataset.featuredMeta] || '';
    });
    card.setAttribute('aria-label', `Voir la recette : ${recipe.title}`);
  });
}

function getCardHTML(r, i) {
  return `<article class="recipe-card reveal tilt-card" data-cats="${r.cat}${r.tags.some(t => t === 'Végétarien') ? ' vegetarien' : ''}${r.tags.some(t => t === 'Rapide') ? ' rapide' : ''}${r.tags.some(t => t === 'Gourmand') ? ' gourmand' : ''}" onclick="openRecipe(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRecipe(${i})}" role="button" tabindex="0" aria-label="Voir la recette : ${r.title}" style="transition-delay:${i * 0.04}s">
    <div class="recipe-card-shine" aria-hidden="true"></div>
    <div class="recipe-img-wrap">
      <img class="recipe-img" src="${getRecipeImageSrc(r)}" alt="" loading="lazy" decoding="async">
      ${r.badge ? `<span class="recipe-badge ${r.badgeClass}">${r.badge}</span>` : ''}
      <span class="recipe-time">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        ${r.time}
      </span>
    </div>
    <div class="recipe-body">
      <div class="recipe-tags">${r.tags.map((t, j) => `${j > 0 ? '<span class="recipe-tag sep">·</span>' : ''}<span class="recipe-tag">${t}</span>`).join('')}</div>
      <h3 class="recipe-title">${r.title}</h3>
      <p class="recipe-desc">${r.desc}</p>
      <div class="recipe-meta">
        <span class="recipe-meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          ${r.persons} pers.
        </span>
        <span class="recipe-meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          ${r.rating}
        </span>
        <span class="recipe-meta-item recipe-price" title="Budget estimatif">
          <span class="price-icon" aria-hidden="true">€</span>
          ${formatPrice(r.price)}
        </span>
      </div>
    </div>
  </article>`;
}

/* ═══════════════════════ RENDER ═══════════════════════ */
function renderGrid() {
  const grid = document.getElementById('recipeGrid');
  grid.innerHTML = recipes.map((r, i) => getCardHTML(r, i)).join('');
  applyFilters();
  document.getElementById('recipeCount').textContent = recipes.length + ' recettes';
  requestAnimationFrame(() => {
    observeReveals();
    initTiltCards();
  });
}

function cardMatchesCategory(cats, filter) {
  if (filter === 'all') return true;
  return (cats || '').split(/\s+/).filter(Boolean).includes(filter);
}

function applyFilters() {
  const cards = document.querySelectorAll('.recipe-card, .featured-card[data-cats]');
  let visible = 0;
  cards.forEach(card => {
    const cats = card.dataset.cats || '';
    const title = card.querySelector('.recipe-title, .featured-title')?.textContent.toLowerCase() || '';
    const desc = card.querySelector('.recipe-desc, .featured-desc')?.textContent.toLowerCase() || '';
    const matchCat = cardMatchesCategory(cats, currentFilter);
    const matchSearch = !searchQuery || title.includes(searchQuery) || desc.includes(searchQuery);
    if (matchCat && matchSearch) {
      card.classList.remove('hidden');
      if (card.classList.contains('recipe-card')) visible++;
    } else {
      card.classList.add('hidden');
    }
  });
  document.getElementById('noResults').classList.toggle('show', visible === 0);
  document.getElementById('recipeCount').textContent = visible + ' recette' + (visible !== 1 ? 's' : '');
}

function filterByCategory(cat, el) {
  const pill = el?.closest?.('.cat-pill') || el;
  currentFilter = pill?.dataset?.cat || cat;
  document.querySelectorAll('.cat-pill').forEach(p => {
    p.classList.remove('active');
    p.setAttribute('aria-selected', 'false');
  });
  if (pill) {
    pill.classList.add('active');
    pill.setAttribute('aria-selected', 'true');
  }
  applyFilters();
  if (currentFilter !== 'all') {
    document.getElementById('recettes')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

function initCategoryFilters() {
  const bar = document.getElementById('categoryFilters');
  if (!bar || bar.dataset.bound === 'true') return;
  bar.dataset.bound = 'true';
  bar.addEventListener('click', e => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    filterByCategory(pill.dataset.cat, pill);
  });
}

function filterRecipes(value) {
  const input = document.getElementById('searchInput');
  const mobileInput = document.getElementById('mobileSearchInput');
  searchQuery = (value ?? input?.value ?? '').toLowerCase().trim();
  if (input && input.value !== searchQuery) input.value = value ?? searchQuery;
  if (mobileInput && mobileInput.value !== searchQuery) mobileInput.value = value ?? searchQuery;
  applyFilters();
}

/* ═══════════════════════ SCROLL REVEAL ═══════════════════════ */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

function observeReveals() {
  document.querySelectorAll('.reveal:not(.revealed), .reveal-scale:not(.revealed)').forEach(el => observer.observe(el));
}

/* ═══════════════════════ COUNTER ANIMATION ═══════════════════════ */
let counterAnimation = 0;
const counterObserver = new IntersectionObserver((entries) => {
  const animation = counterAnimation;
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const decimal = el.dataset.decimal === 'true';
      const duration = prefersReducedMotion ? 0 : 1600;
      const start = performance.now();

      function tick(now) {
        if (animation !== counterAnimation) return;
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const val = decimal ? (target * eased).toFixed(1) : Math.floor(target * eased);
        el.textContent = val + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }

      if (duration === 0) {
        el.textContent = (decimal ? target.toFixed(1) : target) + suffix;
      } else {
        requestAnimationFrame(tick);
      }
      el.dataset.counted = 'true';
      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

/* ═══════════════════════ MODAL ═══════════════════════ */
function getModalMediaHTML(r) {
  const ytId = getYoutubeId(r.videoUrl || r.sourceUrl);
  if (ytId) {
    return `<iframe src="https://www.youtube.com/embed/${ytId}" title="Vidéo : ${r.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>`;
  }
  return `<img src="${getRecipeImageSrc(r)}" alt="${r.title}"><div class="modal-img-overlay" aria-hidden="true"></div>`;
}

function getVideoEmbedHTML(r) {
  if (!r.videoUrl || getYoutubeId(r.videoUrl || r.sourceUrl)) return '';
  return `<div class="modal-video-link"><a href="${r.videoUrl}" target="_blank" rel="noopener noreferrer">Voir la vidéo originale sur ${r.sourcePlatform || 'la plateforme'}</a></div>`;
}

function openRecipeById(id) {
  const index = recipes.findIndex(recipe => recipe.id === id);
  if (index >= 0) openRecipe(index);
}

function openRecipe(index) {
  const r = recipes[index];
  if (!r) return;
  activeRecipe = r;
  const imgEl = document.getElementById('modalImg');
  imgEl.style.background = '';
  imgEl.innerHTML = getModalMediaHTML(r);
  imgEl.setAttribute('aria-label', r.title);

  document.getElementById('modalBody').innerHTML = `
    ${r.badge ? `<span class="modal-badge">${r.badge}</span>` : ''}
    <h2 id="modalTitle">${r.title}</h2>
    <p class="modal-desc" id="modalDescription">${r.desc}</p>
    ${getVideoEmbedHTML(r)}
    <div class="modal-meta-row">
      <span class="modal-meta-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <strong>${r.time}</strong>
      </span>
      <span class="modal-meta-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <strong>${r.persons} personnes</strong>
      </span>
      <span class="modal-meta-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <strong>${r.rating}/5</strong>
      </span>
      <span class="modal-meta-item">
        <span class="price-icon" aria-hidden="true">€</span>
        <strong>${formatPrice(r.price)}</strong>
      </span>
    </div>
    <div class="modal-section">
      <h3>Ingrédients</h3>
      <ul class="ingredients-list">${r.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>
    <div class="modal-section">
      <h3>Préparation</h3>
      <ol class="steps-list">${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    </div>
    <div class="modal-actions">
      ${STATIC_SITE ? '' : '<button id="favoriteButton" class="btn btn-ghost" type="button" onclick="toggleFavorite()">Ajouter aux favoris</button>'}
      <button class="btn btn-accent" type="button" onclick="shareRecipe()">Partager</button>
      <button class="btn btn-ghost" type="button" onclick="window.print()">Imprimer</button>
    </div>`;

  lastFocusedEl = document.activeElement;
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  document.body.classList.add('modal-open');
  history.replaceState(null, '', `#recette-${encodeURIComponent(r.id || index)}`);
  document.getElementById('recipeModal').scrollTop = 0;
  cancelAnimationFrame(modalAnimFrame);
  modalAnimFrame = requestAnimationFrame(() => {
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
  });
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.classList.remove('modal-open');
  if (location.hash.startsWith('#recette-')) history.replaceState(null, '', '#recettes');
  if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
    setTimeout(() => lastFocusedEl.focus(), 100);
  }
}

function openRecipeFromHash() {
  if (!location.hash.startsWith('#recette-')) return;
  const value = decodeURIComponent(location.hash.slice('#recette-'.length));
  const index = recipes.findIndex((recipe, i) => String(recipe.id || i) === value);
  if (index >= 0) openRecipe(index);
}

async function shareRecipe() {
  if (!activeRecipe) return;
  const url = `${location.origin}${location.pathname}#recette-${encodeURIComponent(activeRecipe.id || '')}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: activeRecipe.title, text: activeRecipe.desc, url });
      showToast('Recette partagée.');
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié.');
    }
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Impossible de partager cette recette.');
  }
}

async function toggleFavorite() {
  if (!activeRecipe) return;
  if (STATIC_SITE) return showToast('Les favoris sont disponibles dans l’application complète.');
  if (!viewer) return showToast('Connectez-vous depuis Mon compte pour ajouter un favori.');
  const res = await fetch(`/api/favorites/${activeRecipe.id}`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) return showToast(data.error || 'Favori impossible');
  const button = document.getElementById('favoriteButton');
  if (button) button.textContent = data.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris';
  showToast(data.favorite ? 'Ajouté aux favoris.' : 'Retiré des favoris.');
}

async function loadViewer() {
  if (STATIC_SITE) return;
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) viewer = (await res.json()).user;
  } catch {
    viewer = null;
  }
}

function applyRuntimeMode() {
  if (!STATIC_SITE) return;
  document.querySelectorAll('[data-requires-api]').forEach(element => element.remove());
}

document.addEventListener('keydown', e => {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay.classList.contains('open')) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Tab') {
    const modal = document.getElementById('recipeModal');
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* ═══════════════════════ NEWSLETTER ═══════════════════════ */
function subscribeNewsletter(e) {
  e.preventDefault();
  const email = document.getElementById('newsletterEmail').value;
  document.getElementById('newsletterSuccess').style.display = 'block';
  document.getElementById('newsletterEmail').value = '';
  showToast('Merci ! Vous êtes inscrit(e) à notre newsletter.');
  setTimeout(() => { document.getElementById('newsletterSuccess').style.display = 'none'; }, 5000);
}

/* ═══════════════════════ TOAST ═══════════════════════ */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ═══════════════════════ MOBILE NAV ═══════════════════════ */
function toggleMobileNav() {
  const nav = document.getElementById('mainNav');
  const btn = document.getElementById('mobileToggle');
  const overlay = document.getElementById('mobileNavOverlay');
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
  overlay.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeMobileNav() {
  const nav = document.getElementById('mainNav');
  const btn = document.getElementById('mobileToggle');
  const overlay = document.getElementById('mobileNavOverlay');
  nav.classList.remove('open');
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ═══════════════════════ HEADER ILLUSTRATION PARALLAX ═══════════════════════ */
if (!prefersReducedMotion && hasFinePointer) {
  const headerMain = document.querySelector('.header-main');
  const floats = document.querySelectorAll('.header-float');
  if (headerMain && floats.length) {
    headerMain.addEventListener('mousemove', e => {
      const r = headerMain.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width - 0.5;
      const my = (e.clientY - r.top) / r.height - 0.5;
      floats.forEach((el, i) => {
        const depth = (i + 1) * 4;
        el.style.transform = `translate(${mx * depth}px, ${my * depth}px)`;
      });
    });
    headerMain.addEventListener('mouseleave', () => {
      floats.forEach(el => { el.style.transform = ''; });
    });
  }
}

/* ═══════════════════════ SCROLL PROGRESS + PARALLAX ═══════════════════════ */
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 0 ? (y / docH) * 100 : 0;
    document.getElementById('scrollProgress').style.width = pct + '%';
    document.getElementById('siteHeader').classList.toggle('scrolled', y > 10);
    if (!prefersReducedMotion && y < window.innerHeight) {
      const mesh = document.querySelector('.hero-mesh');
      if (mesh) mesh.style.transform = `translate3d(0, ${y * 0.2}px, 0) scale(${1 + y * 0.0003})`;
    }
    scrollTicking = false;
  });
}, { passive: true });

/* ═══════════════════════ MAGNETIC BUTTONS ═══════════════════════ */
if (!prefersReducedMotion && hasFinePointer) {
  document.querySelectorAll('.magnetic').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const mx = (e.clientX - r.left - r.width / 2) / r.width;
      const my = (e.clientY - r.top - r.height / 2) / r.height;
      btn.classList.add('magnetic-active');
      btn.style.transform = `translate(${mx * 5}px, ${my * 3}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.classList.remove('magnetic-active');
      btn.style.transform = '';
    });
  });
}

/* ═══════════════════════ 3D CARD TILT ═══════════════════════ */
function initTiltCards() {
  if (prefersReducedMotion || !hasFinePointer) return;
  document.querySelectorAll('.tilt-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const rx = ((e.clientY - r.top - r.height / 2) / r.height) * -5;
      const ry = ((e.clientX - r.left - r.width / 2) / r.width) * 5;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-8px) scale(1.01)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/* ═══════════════════════ RIPPLE EFFECT ═══════════════════════ */
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', function (e) {
    if (prefersReducedMotion) return;
    const rect = this.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    this.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
});

/* ═══════════════════════ SKELETON FIRST PAINT ═══════════════════════ */
function paintSkeletons(n) {
  const grid = document.getElementById('recipeGrid');
  let html = '';
  for (let i = 0; i < n; i++) {
    html += '<div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-body"><div class="skeleton skeleton-line tags"></div><div class="skeleton skeleton-line medium"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div></div>';
  }
  grid.innerHTML = html;
}

/* ═══════════════════════ INIT ═══════════════════════ */
paintSkeletons(8);
initCategoryFilters();

async function initApp() {
  applyRuntimeMode();
  initCategoryFilters();
  await loadViewer();
  try {
    await loadRecipes();
    document.getElementById('recipeCount').textContent = recipes.length + ' recettes';
  } catch (err) {
    document.getElementById('siteError').hidden = false;
    showToast('Erreur de chargement des recettes');
    console.error(err);
  }
  setTimeout(() => document.getElementById('pageLoader')?.classList.add('hidden'), 400);
  setTimeout(() => {
    renderGrid();
    requestAnimationFrame(() => observeReveals());
    openRecipeFromHash();
  }, prefersReducedMotion ? 0 : 600);
}

if (document.readyState === 'complete') {
  initApp();
} else {
  window.addEventListener('load', initApp);
}

Object.assign(window, {
  filterByCategory,
  filterRecipes,
  openRecipe,
  shareRecipe,
  toggleFavorite,
  closeModal,
  toggleMobileNav,
  closeMobileNav,
  subscribeNewsletter,
});

/* Close mobile nav on resize */
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeMobileNav();
});

/* Featured card keyboard support */
document.querySelectorAll('.featured-card').forEach(card => {
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.click();
    }
  });
});
