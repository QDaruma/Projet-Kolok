// ─────────────────────────────────────────────────────────────
//  APP — rendu et interactions.
// ─────────────────────────────────────────────────────────────
import { USERS, STATUSES, RATINGS, statusById, userById, ratingByScore } from './config.js';
import { Store } from './store.js';
import { extractFromUrl, normalizeUrl } from './extract.js';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const icon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const state = {
  me: localStorage.getItem('kolok.me') || null,
  statuses: new Set(),          // vide = toutes les étapes
  q: '',
  maxPrice: null,
  sort: 'recent',
  view: 'board',                // 'board' | 'table'
  editingId: null,
  detailId: null,
};

// ═══════════════════ DÉMARRAGE ═══════════════════
(async function main() {
  buildStaticUI();
  await Store.init();
  Store.onChange(render);
  wireEvents();
  if (!state.me) $('#whoami').classList.remove('hidden'); else applyMe();
  render();
  if (Store.mode === 'local') {
    toast('Mode local : ces données ne sont visibles que sur cet appareil.', 6000);
  }
})();

// ═══════════════════ UI STATIQUE ═══════════════════
function buildStaticUI() {
  $('#whoBtns').innerHTML = USERS.map(u => `
    <button class="gate-btn" data-user="${u.id}">
      <span class="badge-initial" style="--c:${u.color}">${u.initial}</span>${esc(u.name)}
    </button>`).join('');

  $('#statusChips').innerHTML =
    `<button class="chip is-on" data-status="*">Toutes<b class="chip-count"></b></button>` +
    STATUSES.map(s => `<button class="chip" data-status="${s.id}" style="--c:${s.color}">
      <span class="chip-dot"></span>${esc(s.short)}<b class="chip-count"></b></button>`).join('');

  $('#fStatus').innerHTML = STATUSES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  $('#fContactedBy').innerHTML = `<option value="">Personne</option>` +
    USERS.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
}

// ═══════════════════ ÉVÉNEMENTS ═══════════════════
function wireEvents() {
  $('#whoBtns').addEventListener('click', e => {
    const b = e.target.closest('[data-user]'); if (!b) return;
    state.me = b.dataset.user;
    localStorage.setItem('kolok.me', state.me);
    $('#whoami').classList.add('hidden');
    applyMe(); render();
  });
  $('#btnMe').addEventListener('click', () => $('#whoami').classList.remove('hidden'));

  $('#btnTheme').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('kolok.theme', next);
  });

  $('#statusChips').addEventListener('click', e => {
    const c = e.target.closest('[data-status]'); if (!c) return;
    const id = c.dataset.status;
    if (id === '*') state.statuses.clear();
    else state.statuses.has(id) ? state.statuses.delete(id) : state.statuses.add(id);
    render();
  });

  $('#search').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); render(); });
  $('#maxPrice').addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    state.maxPrice = Number.isFinite(v) && v > 0 ? v : null; render();
  });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });

  $('#btnBoard').addEventListener('click', () => setView('board'));
  $('#btnCompare').addEventListener('click', () => setView('table'));

  $('#btnAdd').addEventListener('click', () => openEditor(null));

  // Ouverture d'une fiche, par délégation : les cartes et les lignes du
  // tableau sont reconstruites à chaque rendu, on n'y attache rien.
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-add]')) { openEditor(null); return; }
    if (e.target.closest('.link-out')) return;      // le lien externe garde son rôle
    const el = e.target.closest('.card[data-id], .cmp tbody tr[data-id]');
    if (el) window.__open(el.dataset.id);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('.card[data-id]');
    if (!el) return;
    e.preventDefault();
    window.__open(el.dataset.id);
  });
  $('#btnFetch').addEventListener('click', doFetch);
  $('#fPrice').addEventListener('input', showPriceHint);
  $('#fPriceMode').addEventListener('change', showPriceHint);
  $('#fUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doFetch(); } });
  $('#btnSave').addEventListener('click', saveFromForm);
  $('#btnDelete').addEventListener('click', deleteCurrent);

  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) closeModals();
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModals();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('#search').focus(); }
  });

  // Coller un lien n'importe où ouvre l'ajout, pré-rempli.
  document.addEventListener('paste', e => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const txt = (e.clipboardData?.getData('text') || '').trim();
    if (/^https?:\/\//i.test(txt)) { openEditor(null); $('#fUrl').value = txt; doFetch(); }
  });
}

const effectiveTheme = () => document.documentElement.dataset.theme
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function setView(v) {
  state.view = v;
  $('#btnBoard').classList.toggle('is-on', v === 'board');
  $('#btnCompare').classList.toggle('is-on', v === 'table');
  render();
}

function applyMe() {
  const u = userById(state.me);
  if (!u) return;
  $('#btnMe').textContent = u.initial;
  $('#btnMe').style.setProperty('--c', u.color);
  $('#btnMe').title = `${u.name} — changer d'utilisateur`;
}

// ═══════════════════ FILTRAGE / TRI ═══════════════════
function sortRows(rows) {
  const s = state.sort;
  return rows.sort((a, b) => {
    if (s === 'price_asc')  return (a.price ?? 1e9) - (b.price ?? 1e9);
    if (s === 'price_desc') return (b.price ?? -1) - (a.price ?? -1);
    if (s === 'surface')    return (b.surface ?? -1) - (a.surface ?? -1);
    if (s === 'score')      return (Store.avgScore(b.id) ?? -1) - (Store.avgScore(a.id) ?? -1);
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

function visibleListings() {
  let rows = [...Store.listings];
  if (state.statuses.size) rows = rows.filter(r => state.statuses.has(r.status));
  if (state.maxPrice) rows = rows.filter(r => r.price == null || r.price <= state.maxPrice);
  if (state.q) {
    rows = rows.filter(r => [r.title, r.city, r.notes, r.url,
      ...Store.opinionsFor(r.id).map(o => o.comment)].join(' ').toLowerCase().includes(state.q));
  }
  return sortRows(rows);
}

// ═══════════════════ RENDU ═══════════════════
function render() {
  renderChips();
  renderSummary();
  const rows = visibleListings();

  const table = state.view === 'table';
  $('#compare').classList.toggle('hidden', !table);
  $('#grid').classList.toggle('hidden', table);
  $('#empty').classList.toggle('hidden', rows.length > 0);

  if (table) renderCompare(rows); else renderBoard(rows);
  if (state.detailId && !$('#detail').classList.contains('hidden')) renderDetail(state.detailId);
}

function renderChips() {
  $$('#statusChips .chip').forEach(c => {
    const id = c.dataset.status;
    const count = id === '*' ? Store.listings.length
                             : Store.listings.filter(r => r.status === id).length;
    c.querySelector('.chip-count').textContent = count || '';
    c.classList.toggle('is-on', id === '*' ? state.statuses.size === 0 : state.statuses.has(id));
  });
}

function renderSummary() {
  const all = Store.listings;
  const prices = all.map(r => r.price).filter(p => p != null);
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const share = avg != null ? Math.round(avg / USERS.length) : null;
  const todo = all.filter(r => r.status === 'a_contacter').length;
  const soon = all.filter(r => r.visit_at && new Date(r.visit_at) >= new Date(Date.now() - 864e5)).length;

  const bits = [`<b>${all.length}</b> logement${all.length > 1 ? 's' : ''}`];
  if (avg != null)  bits.push(`<b>${fmt(avg)} €</b> de loyer moyen`);
  if (share != null) bits.push(`<b>${fmt(share)} €</b> par personne`);
  if (todo)  bits.push(`<b>${todo}</b> à contacter`);
  if (soon)  bits.push(`<b>${soon}</b> visite${soon > 1 ? 's' : ''} à venir`);
  bits.push(Store.mode === 'cloud'
    ? '<span class="mode-pill cloud">synchronisé</span>'
    : '<span class="mode-pill">hors ligne</span>');

  $('#stats').innerHTML = bits.join('<span class="sep">·</span>');
}

// ── Vue par étapes ───────────────────────────────────────────
function renderBoard(rows) {
  const groups = STATUSES
    .map(s => ({ s, items: rows.filter(r => r.status === s.id) }))
    .filter(g => g.items.length);

  $('#grid').innerHTML = groups.map(({ s, items }) => {
    const prices = items.map(r => r.price).filter(p => p != null);
    const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
    return `<section class="stage" style="--c:${s.color}">
      <header class="stage-head">
        <span class="stage-dot"></span>
        <h2>${esc(s.label)}</h2>
        <span class="stage-count">${items.length}</span>
        <span class="stage-rule"></span>
        ${avg != null ? `<span class="stage-sum">${fmt(avg)} € en moyenne</span>` : ''}
      </header>
      <div class="cards">${items.map(cardHTML).join('')}</div>
    </section>`;
  }).join('');
}

function cardHTML(r) {
  const perM2  = (r.price && r.surface) ? Math.round(r.price / r.surface) : null;
  const share  = r.price ? Math.round(r.price / USERS.length) : null;

  const voters = USERS.map(u => {
    const o  = Store.getOpinion(r.id, u.id);
    const rt = o?.score ? ratingByScore(o.score) : null;
    const tip = `${u.name} : ${rt ? rt.label : 'pas encore d’avis'}${o?.comment ? ' — a commenté' : ''}`;
    return `<span class="voter ${rt ? '' : 'none'}" ${rt ? `style="--r-color:${rt.color}"` : ''}
      title="${esc(tip)}">${u.initial}${o?.comment ? '<i class="said"></i>' : ''}</span>`;
  }).join('');

  const flag = r.visit_at
    ? `<span class="card-flag">${icon('calendar')}Visite le ${dateFR(r.visit_at)}</span>`
    : r.contacted_by
      ? `<span class="card-flag">${icon('phone')}${esc(userById(r.contacted_by)?.name || '?')}</span>`
      : '';

  // <article> plutôt que <button> : une carte contient une liste et un lien,
  // qu'un bouton n'a pas le droit d'englober. Le clavier est géré à part.
  return `<article class="card ${r.image_url ? '' : 'no-media'}" role="button" tabindex="0" data-id="${r.id}">
    ${r.image_url ? `<img class="card-media" src="${esc(r.image_url)}" alt="" loading="lazy"
       onerror="this.closest('.card').classList.add('no-media');this.remove()">` : ''}
    <div class="card-body">
      <span class="card-price">
        <b>${r.price != null ? fmt(r.price) + ' €' : '— €'}</b>
        ${share ? `<span class="per">${fmt(share)} € / pers.</span>` : ''}
        ${perM2 ? `<span class="perm2">${perM2} €/m²</span>` : ''}
      </span>
      <span class="card-title">${esc(r.title || 'Sans titre')}</span>
      <ul class="card-meta">
        ${r.surface ? `<li>${icon('area')}${fmt(r.surface)} m²</li>` : ''}
        ${r.rooms   ? `<li>${icon('bed')}${r.rooms} ch.</li>` : ''}
        ${r.city    ? `<li>${icon('pin')}<span class="truncate">${esc(r.city)}</span></li>` : ''}
      </ul>
      <div class="card-foot">
        <span class="voters">${voters}</span>
        ${flag}
        ${r.url ? `<a class="link-out" href="${esc(r.url)}" target="_blank" rel="noopener"
           title="Ouvrir l’annonce" aria-label="Ouvrir l’annonce">${icon('link')}</a>` : ''}
      </div>
    </div>
  </article>`;
}

// ── Tableau comparatif ───────────────────────────────────────
function renderCompare(rows) {
  if (!rows.length) { $('#compare').innerHTML = ''; return; }
  const head = ['Logement', 'Loyer', '€/m²', 'Par pers.', 'Surface', 'Ch.', 'Ville', 'Étape',
    ...USERS.map(u => u.name), 'Moy.'];
  $('#compare').innerHTML = `<div class="table-wrap"><table class="cmp">
    <thead><tr>${head.map((h, i) => `<th class="${i && i < 7 || h === 'Moy.' || USERS.some(u => u.name === h) ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => {
      const st = statusById(r.status);
      const avg = Store.avgScore(r.id);
      const perM2 = (r.price && r.surface) ? Math.round(r.price / r.surface) : null;
      const share = r.price ? Math.round(r.price / USERS.length) : null;
      return `<tr data-id="${r.id}" tabindex="0">
        <td class="cmp-name">${esc(r.title || 'Sans titre')}</td>
        <td class="n">${r.price != null ? fmt(r.price) + ' €' : '—'}</td>
        <td class="n">${perM2 ?? '—'}</td>
        <td class="n">${share ? fmt(share) + ' €' : '—'}</td>
        <td class="n">${r.surface ? fmt(r.surface) : '—'}</td>
        <td class="n">${r.rooms || '—'}</td>
        <td>${esc(r.city || '—')}</td>
        <td><span class="stage-tag" style="--c:${st.color}"><span class="dot"></span>${esc(st.short)}</span></td>
        ${USERS.map(u => {
          const o = Store.getOpinion(r.id, u.id);
          const rt = o?.score ? ratingByScore(o.score) : null;
          return `<td class="n" title="${esc(o?.comment || (rt ? rt.label : ''))}">
            <span class="vote ${rt ? '' : 'none'}" ${rt ? `style="--r-color:${rt.color}"` : ''}></span></td>`;
        }).join('')}
        <td class="n"><b>${avg != null ? avg.toFixed(1) : '—'}</b></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ── Fiche détaillée ──────────────────────────────────────────
window.__open = (id) => { state.detailId = id; renderDetail(id); $('#detail').classList.remove('hidden'); };

const DRAFT_FIELDS = ['myComment', 'sharedNotes'];
let renderedDrafts = {};

/**
 * La fiche est re-rendue à CHAQUE changement de données, y compris ceux
 * d'un colocataire en temps réel. On relève donc d'abord la saisie en
 * cours pour la restituer ensuite, sinon elle serait effacée.
 */
function renderDetail(id) {
  const r = Store.listings.find(x => x.id === id);
  if (!r) { closeModals(); return; }

  const host = $('#detailCard');
  const same = host.dataset.listing === id;
  const active = document.activeElement;
  const drafts = {};
  if (same) {
    for (const key of DRAFT_FIELDS) {
      const el = host.querySelector('#' + key);
      if (el && el.value !== renderedDrafts[key]) {
        drafts[key] = { value: el.value, focused: el === active,
                        start: el.selectionStart, end: el.selectionEnd };
      }
    }
  }
  const scroll = same ? host.querySelector('.sheet-body')?.scrollTop || 0 : 0;

  const me    = state.me;
  const meU   = userById(me);
  const perM2 = (r.price && r.surface) ? Math.round(r.price / r.surface) : null;
  const share = r.price ? Math.round(r.price / USERS.length) : null;
  const mine  = Store.getOpinion(id, me);

  host.innerHTML = `
    <header class="sheet-head">
      <h2>${esc(r.title || 'Sans titre')}</h2>
      <button class="icon-btn" data-close aria-label="Fermer">${icon('close')}</button>
    </header>

    <div class="sheet-body">
      ${r.image_url ? `<img class="d-media" src="${esc(r.image_url)}" alt=""
         onerror="this.remove()">` : ''}

      <div class="facts">
        <div><b>${r.price != null ? fmt(r.price) + ' €' : '—'}</b><span>par mois</span></div>
        ${share   ? `<div><b>${fmt(share)} €</b><span>par personne</span></div>` : ''}
        ${r.surface ? `<div><b>${fmt(r.surface)} m²</b><span>surface</span></div>` : ''}
        ${perM2   ? `<div><b>${perM2} €</b><span>par m²</span></div>` : ''}
        ${r.rooms ? `<div><b>${r.rooms}</b><span>chambres</span></div>` : ''}
        ${r.city  ? `<div><b style="font-size:13px">${esc(r.city)}</b><span>secteur</span></div>` : ''}
      </div>

      <section class="block">
        <h3>Où on en est</h3>
        <div class="pips">
          ${STATUSES.map(s => `<button class="pip ${s.id === r.status ? 'is-on' : ''}"
             style="--c:${s.color}" data-setstatus="${s.id}">${esc(s.label)}</button>`).join('')}
        </div>
        <div class="track">
          <label>Contacté par
            <select data-field="contacted_by">
              <option value="">Personne</option>
              ${USERS.map(u => `<option value="${u.id}" ${r.contacted_by === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            </select>
          </label>
          <label>Date de visite
            <input type="date" data-field="visit_at" value="${(r.visit_at || '').slice(0, 10)}">
          </label>
        </div>
        ${r.contacted_at ? `<p class="note">Premier contact le ${dateFR(r.contacted_at)}.</p>` : ''}
      </section>

      <section class="block">
        <h3>Mon avis <span class="who-tag" style="--c:${meU?.color}">${esc(meU?.name || '')}</span></h3>
        <div class="rate">
          ${RATINGS.map(rt => `<button class="rate-btn ${mine?.score === rt.score ? 'is-on' : ''}"
             style="--c:${rt.color}" data-score="${rt.score}">${esc(rt.label)}</button>`).join('')}
        </div>
        <textarea id="myComment" rows="2" placeholder="Ce que j’en pense — visible par tout le monde"
          >${esc(mine?.comment || '')}</textarea>
        <div><button class="btn btn-outline" id="btnComment">Enregistrer mon avis</button></div>
      </section>

      <section class="block">
        <h3>L’avis du groupe</h3>
        <div class="opinions">
          ${USERS.map(u => {
            const o  = Store.getOpinion(id, u.id);
            const rt = o?.score ? ratingByScore(o.score) : null;
            return `<div class="op ${o?.comment ? 'has-text' : ''} ${o ? '' : 'empty'}">
              <span class="badge-initial" style="--c:${u.color}">${u.initial}</span>
              <span class="op-name">${esc(u.name)}</span>
              <span class="op-score" ${rt ? `style="--r-color:${rt.color}"` : ''}>${rt ? esc(rt.label) : 'sans avis'}</span>
              ${o?.comment ? `<span class="op-text">${esc(o.comment)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="block">
        <h3>Notes partagées</h3>
        <textarea id="sharedNotes" rows="3" placeholder="Charges, disponibilité, contact de l’agence, code d’accès…"
          >${esc(r.notes || '')}</textarea>
        <div><button class="btn btn-outline" id="btnNotes">Enregistrer les notes</button></div>
      </section>
    </div>

    <footer class="sheet-foot">
      ${r.url ? `<a class="btn btn-quiet" href="${esc(r.url)}" target="_blank" rel="noopener">
        ${icon('link')}<span>Voir l’annonce</span></a>` : ''}
      <span class="grow"></span>
      <button class="btn btn-quiet" id="btnEditThis">Modifier</button>
      <button class="btn btn-solid" data-close>Fermer</button>
    </footer>`;

  // Restauration de la saisie, du curseur et du défilement.
  host.dataset.listing = id;
  renderedDrafts = {};
  for (const key of DRAFT_FIELDS) {
    const el = host.querySelector('#' + key);
    if (el) renderedDrafts[key] = el.value;
  }
  for (const [key, d] of Object.entries(drafts)) {
    const el = host.querySelector('#' + key);
    if (!el) continue;
    el.value = d.value;
    if (d.focused) { el.focus(); el.setSelectionRange(d.start, d.end); }
  }
  if (scroll) host.querySelector('.sheet-body').scrollTop = scroll;

  host.querySelectorAll('[data-setstatus]').forEach(b => b.onclick = () =>
    Store.patchListing(id, { status: b.dataset.setstatus }));
  host.querySelectorAll('[data-field]').forEach(el => el.onchange = () =>
    Store.patchListing(id, { [el.dataset.field]: el.value || null }));
  host.querySelectorAll('[data-score]').forEach(b => b.onclick = () =>
    Store.saveOpinion({ listing_id: id, user_id: me, score: +b.dataset.score }));
  host.querySelector('#btnComment').onclick = async () => {
    await Store.saveOpinion({ listing_id: id, user_id: me, comment: host.querySelector('#myComment').value });
    toast('Avis enregistré');
  };
  host.querySelector('#btnNotes').onclick = async () => {
    await Store.patchListing(id, { notes: host.querySelector('#sharedNotes').value });
    toast('Notes enregistrées');
  };
  host.querySelector('#btnEditThis').onclick = () => { $('#detail').classList.add('hidden'); openEditor(id); };
}

// ═══════════════════ FORMULAIRE ═══════════════════
function openEditor(id) {
  state.editingId = id;
  const r = id ? Store.listings.find(x => x.id === id) : null;
  $('#editTitle').textContent = r ? 'Modifier le logement' : 'Nouveau logement';
  $('#btnDelete').classList.toggle('hidden', !r);
  $('#fetchMsg').textContent = '';
  $('#fUrl').value      = r?.url || '';
  $('#fTitle').value    = r?.title || '';
  $('#fPrice').value    = r?.price ?? '';
  $('#fSurface').value  = r?.surface ?? '';
  $('#fRooms').value    = r?.rooms ?? '';
  $('#fCity').value     = r?.city || '';
  $('#fStatus').value   = r?.status || 'a_contacter';
  $('#fContactedBy').value = r?.contacted_by || '';
  $('#fVisitAt').value  = (r?.visit_at || '').slice(0, 10);
  $('#fImage').value    = r?.image_url || '';
  $('#fNotes').value    = r?.notes || '';
  // En base le loyer est TOUJOURS le total du logement : à l'ouverture on
  // repart donc de « pour tout le logement ».
  $('#fPriceMode').value = 'total';
  showPriceHint();
  $('#editModal').classList.remove('hidden');
  setTimeout(() => $(r ? '#fTitle' : '#fUrl').focus(), 50);
}

/**
 * Certains sites affichent le loyer du logement entier, d'autres le prix
 * d'une chambre. On lève l'ambiguïté en montrant les deux montants avant
 * d'enregistrer.
 */
function showPriceHint() {
  const v = parseFloat($('#fPrice').value);
  const h = $('#priceHint');
  if (!Number.isFinite(v) || v <= 0) { h.textContent = ''; h.className = 'note'; return; }
  const perPerson = $('#fPriceMode').value === 'person';
  const total = perPerson ? v * USERS.length : v;
  h.textContent = `${fmt(total)} € au total, soit ${fmt(Math.round(total / USERS.length))} € `
                + `par personne à ${USERS.length}.`;
  h.className = 'note ok';
}

async function doFetch() {
  const url = $('#fUrl').value.trim();
  if (!url) return;
  const msg = $('#fetchMsg');
  $('#btnFetch').disabled = true;
  msg.textContent = 'Lecture de l’annonce…'; msg.className = 'note';
  try {
    const d = await extractFromUrl(url);
    $('#fUrl').value = d.url || normalizeUrl(url);
    const set = (sel, v) => { if (v != null && v !== '' && !$(sel).value) $(sel).value = v; };
    set('#fTitle', d.title); set('#fPrice', d.price); set('#fSurface', d.surface);
    set('#fRooms', d.rooms); set('#fCity', d.city);  set('#fImage', d.image_url);
    const got = ['title', 'price', 'surface', 'rooms', 'city'].filter(k => d[k] != null && d[k] !== '');
    msg.textContent = got.length
      ? `Trouvé : ${got.join(', ')}. Vérifiez et corrigez si besoin.`
      : 'Rien d’exploitable sur cette page — remplissez à la main.';
    msg.className = got.length ? 'note ok' : 'note warn';
  } catch {
    msg.textContent = 'Ce site bloque la lecture automatique. Remplissez les champs à la main, ça marche pareil.';
    msg.className = 'note warn';
  } finally { $('#btnFetch').disabled = false; }
}

function priceAsTotal() {
  const v = parseFloat($('#fPrice').value);
  if (!Number.isFinite(v)) return '';
  return $('#fPriceMode').value === 'person' ? v * USERS.length : v;
}

async function saveFromForm() {
  const cur = state.editingId ? Store.listings.find(x => x.id === state.editingId) : null;
  try {
    const { isNew } = await Store.saveListing({
      ...(cur || {}),
      id: state.editingId || undefined,
      url: normalizeUrl($('#fUrl').value),
      title: $('#fTitle').value.trim() || 'Sans titre',
      // Toujours stocker le loyer du logement entier.
      price: priceAsTotal(), surface: $('#fSurface').value, rooms: $('#fRooms').value,
      city: $('#fCity').value.trim(),
      status: $('#fStatus').value,
      contacted_by: $('#fContactedBy').value,
      visit_at: $('#fVisitAt').value || null,
      image_url: $('#fImage').value.trim(),
      notes: $('#fNotes').value,
      added_by: cur?.added_by || state.me || '',
    });
    closeModals();
    toast(isNew ? 'Logement ajouté' : 'Modifications enregistrées');
  } catch (e) { toast('Erreur : ' + (e.message || e), 6000); }
}

async function deleteCurrent() {
  if (!state.editingId) return;
  const r = Store.listings.find(x => x.id === state.editingId);
  if (!confirm(`Supprimer « ${r?.title || 'ce logement'} » pour tout le monde ?`)) return;
  await Store.deleteListing(state.editingId);
  closeModals();
  toast('Logement supprimé');
}

function closeModals() {
  $('#editModal').classList.add('hidden');
  $('#detail').classList.add('hidden');
  $('#detailCard').dataset.listing = '';
  renderedDrafts = {};
  state.detailId = null;
}

// ═══════════════════ UTILITAIRES ═══════════════════
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt = n => new Intl.NumberFormat('fr-FR').format(n);
const dateFR = d => { try { return new Date(d).toLocaleDateString('fr-FR',
  { day: 'numeric', month: 'short' }); } catch { return ''; } };

let toastTimer;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
