// ─────────────────────────────────────────────────────────────
//  APP — rendu et interactions.
// ─────────────────────────────────────────────────────────────
import { USERS, STATUSES, RATINGS, statusById, userById, ratingByScore } from './config.js';
import { Store } from './store.js';
import { extractFromUrl, normalizeUrl } from './extract.js';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  me: localStorage.getItem('kolok.me') || null,
  statuses: new Set(),          // vide = tous
  q: '',
  maxPrice: null,
  sort: 'recent',
  compare: false,
  editingId: null,
  detailId: null,
};

// ═══════════════════ DÉMARRAGE ═══════════════════
(async function main() {
  buildStaticUI();
  await Store.init();
  Store.onChange(render);
  wireEvents();
  if (!state.me) openWhoami(); else applyMe();
  render();
  if (Store.mode === 'local') {
    toast('Mode local : les données restent sur cet appareil. Voir le README pour le mode partagé.', 6000);
  }
})();

// ═══════════════════ UI STATIQUE ═══════════════════
function buildStaticUI() {
  // Écran "qui es-tu"
  $('#whoBtns').innerHTML = USERS.map(u => `
    <button class="who-btn" data-user="${u.id}" style="--c:${u.color}">
      <span class="who-emoji">${u.emoji}</span><span>${esc(u.name)}</span>
    </button>`).join('');

  // Puces de statut
  $('#statusChips').innerHTML =
    `<button class="chip chip-all is-on" data-status="*">Tous</button>` +
    STATUSES.map(s => `<button class="chip" data-status="${s.id}" style="--c:${s.color}">
        <i></i>${esc(s.short)}<b class="chip-count"></b></button>`).join('');

  // Selects du formulaire
  $('#fStatus').innerHTML = STATUSES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  $('#fContactedBy').innerHTML = `<option value="">— personne —</option>` +
    USERS.map(u => `<option value="${u.id}">${u.emoji} ${esc(u.name)}</option>`).join('');
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
  $('#btnMe').addEventListener('click', openWhoami);

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
  $('#btnCompare').addEventListener('click', () => {
    state.compare = !state.compare;
    $('#btnCompare').classList.toggle('is-on', state.compare);
    render();
  });

  $('#btnAdd').addEventListener('click', () => openEditor(null));
  $('#btnFetch').addEventListener('click', doFetch);
  $('#fUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doFetch(); } });
  $('#btnSave').addEventListener('click', saveFromForm);
  $('#btnDelete').addEventListener('click', deleteCurrent);

  // Fermeture des modales : croix, bouton annuler, clic sur le fond, Échap.
  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) closeModals();
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModals();
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT'
        && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#search').focus(); }
  });

  // Coller un lien n'importe où sur la page ouvre l'ajout pré-rempli.
  document.addEventListener('paste', e => {
    if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const txt = (e.clipboardData?.getData('text') || '').trim();
    if (/^https?:\/\//i.test(txt)) { openEditor(null); $('#fUrl').value = txt; doFetch(); }
  });
}

function applyMe() {
  const u = userById(state.me);
  if (!u) return;
  $('#btnMe').innerHTML = `<span>${u.emoji}</span>`;
  $('#btnMe').style.setProperty('--c', u.color);
}
function openWhoami() { $('#whoami').classList.remove('hidden'); }

// ═══════════════════ FILTRAGE / TRI ═══════════════════
function visibleListings() {
  let rows = [...Store.listings];

  if (state.statuses.size) rows = rows.filter(r => state.statuses.has(r.status));
  if (state.maxPrice) rows = rows.filter(r => r.price == null || r.price <= state.maxPrice);

  if (state.q) {
    rows = rows.filter(r => {
      const hay = [r.title, r.city, r.notes, r.url,
        ...Store.opinionsFor(r.id).map(o => o.comment)].join(' ').toLowerCase();
      return hay.includes(state.q);
    });
  }

  const s = state.sort;
  rows.sort((a, b) => {
    if (s === 'price_asc')  return (a.price ?? 1e9) - (b.price ?? 1e9);
    if (s === 'price_desc') return (b.price ?? -1) - (a.price ?? -1);
    if (s === 'surface')    return (b.surface ?? -1) - (a.surface ?? -1);
    if (s === 'score')      return (Store.avgScore(b.id) ?? -1) - (Store.avgScore(a.id) ?? -1);
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return rows;
}

// ═══════════════════ RENDU ═══════════════════
function render() {
  renderChipCounts();
  renderStats();
  const rows = visibleListings();

  $('#compare').classList.toggle('hidden', !state.compare);
  $('#grid').classList.toggle('hidden', state.compare);
  $('#empty').classList.toggle('hidden', rows.length > 0);

  if (state.compare) renderCompare(rows);
  else $('#grid').innerHTML = rows.map(cardHTML).join('');

  if (!$('#detail').classList.contains('hidden') && state.detailId) renderDetail(state.detailId);
}

function renderChipCounts() {
  $$('#statusChips .chip').forEach(c => {
    const id = c.dataset.status;
    if (id === '*') { c.classList.toggle('is-on', state.statuses.size === 0); return; }
    c.classList.toggle('is-on', state.statuses.has(id));
    c.querySelector('.chip-count').textContent = Store.listings.filter(r => r.status === id).length || '';
  });
}

function renderStats() {
  const all = Store.listings;
  const prices = all.map(r => r.price).filter(p => p != null);
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const todo = all.filter(r => r.status === 'a_contacter').length;
  const visits = all.filter(r => r.visit_at && new Date(r.visit_at) >= new Date(Date.now() - 864e5)).length;

  $('#stats').innerHTML = [
    stat('🏠', all.length, 'logements'),
    stat('📞', todo, 'à contacter'),
    stat('📅', visits, 'visites à venir'),
    stat('💶', avg != null ? fmt(avg) + ' €' : '—', 'loyer moyen'),
    `<span class="mode-pill ${Store.mode}">${Store.mode === 'cloud' ? '☁️ partagé' : '💾 local'}</span>`,
  ].join('');
}
const stat = (e, v, l) => `<div class="stat"><span class="stat-e">${e}</span>
  <b>${v}</b><small>${l}</small></div>`;

// ── Carte ────────────────────────────────────────────────────
function cardHTML(r) {
  const st = statusById(r.status);
  const ops = Store.opinionsFor(r.id);
  const avg = Store.avgScore(r.id);
  const perM2 = (r.price && r.surface) ? Math.round(r.price / r.surface) : null;

  const avatars = USERS.map(u => {
    const o = ops.find(x => x.user_id === u.id);
    const rt = o && o.score ? ratingByScore(o.score) : null;
    return `<span class="av ${rt ? '' : 'av-off'}" style="--c:${u.color}"
      title="${esc(u.name)} : ${rt ? esc(rt.label) : 'pas encore d\'avis'}">
      ${rt ? rt.emoji : u.emoji}${o?.comment ? '<i class="av-dot"></i>' : ''}</span>`;
  }).join('');

  return `<article class="card" data-id="${r.id}" onclick="window.__open('${r.id}')">
    <div class="card-img ${r.image_url ? '' : 'card-img-empty'}"
         ${r.image_url ? `style="background-image:url('${esc(r.image_url)}')"` : ''}>
      ${r.image_url ? '' : '<span class="card-img-ph">🏙️</span>'}
      <span class="badge" style="--c:${st.color}">${esc(st.label)}</span>
      ${avg != null ? `<span class="badge-score" title="Note moyenne du groupe">${'★'.repeat(Math.round(avg))}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-price">
        <b>${r.price != null ? fmt(r.price) + ' €' : '— €'}</b><small>/mois</small>
        ${perM2 ? `<span class="perm2">${perM2} €/m²</span>` : ''}
      </div>
      <h3 class="card-title">${esc(r.title || 'Sans titre')}</h3>
      <div class="card-meta">
        ${r.surface ? `<span>📐 ${fmt(r.surface)} m²</span>` : ''}
        ${r.rooms   ? `<span>🛏️ ${r.rooms} ch.</span>` : ''}
        ${r.city    ? `<span>📍 ${esc(r.city)}</span>` : ''}
      </div>
      ${r.contacted_by ? `<div class="card-flag">📞 contacté par
        ${esc(userById(r.contacted_by)?.name || '?')} ${r.contacted_at ? '· ' + dateFR(r.contacted_at) : ''}</div>` : ''}
      ${r.visit_at ? `<div class="card-flag card-flag-v">📅 visite le ${dateFR(r.visit_at)}</div>` : ''}
      <div class="card-foot">
        <div class="avs">${avatars}</div>
        ${r.url ? `<a class="link-out" href="${esc(r.url)}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" title="Ouvrir l'annonce">↗</a>` : ''}
      </div>
    </div>
  </article>`;
}

// ── Comparatif ───────────────────────────────────────────────
function renderCompare(rows) {
  if (!rows.length) { $('#compare').innerHTML = ''; return; }
  const head = ['Logement','Prix','€/m²','Surface','Ch.','Ville','Statut',
    ...USERS.map(u => u.emoji + ' ' + u.name),'Moy.'];
  $('#compare').innerHTML = `<div class="table-wrap"><table class="cmp">
    <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => {
      const st = statusById(r.status);
      const avg = Store.avgScore(r.id);
      const perM2 = (r.price && r.surface) ? Math.round(r.price / r.surface) : null;
      return `<tr onclick="window.__open('${r.id}')">
        <td class="cmp-name">${esc(r.title || 'Sans titre')}</td>
        <td class="num">${r.price != null ? fmt(r.price) + ' €' : '—'}</td>
        <td class="num">${perM2 ? perM2 : '—'}</td>
        <td class="num">${r.surface ? fmt(r.surface) : '—'}</td>
        <td class="num">${r.rooms || '—'}</td>
        <td>${esc(r.city || '—')}</td>
        <td><span class="dot" style="--c:${st.color}"></span>${esc(st.short)}</td>
        ${USERS.map(u => {
          const o = Store.getOpinion(r.id, u.id);
          const rt = o?.score ? ratingByScore(o.score) : null;
          return `<td class="num" title="${esc(o?.comment || '')}">${rt ? rt.emoji : '·'}</td>`;
        }).join('')}
        <td class="num"><b>${avg != null ? avg.toFixed(1) : '—'}</b></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ── Détail ───────────────────────────────────────────────────
window.__open = (id) => { state.detailId = id; renderDetail(id); $('#detail').classList.remove('hidden'); };

// Champs de saisie libre de la fiche, à protéger des rafraîchissements.
const DRAFT_FIELDS = ['myComment', 'sharedNotes'];
let renderedDrafts = {};   // valeurs telles qu'affichées au dernier rendu

/**
 * Reconstruit la fiche détaillée. Elle est re-rendue à CHAQUE changement de
 * données — y compris ceux d'un colocataire en temps réel — donc on relève
 * d'abord ce que l'utilisateur est en train de taper pour le lui rendre
 * ensuite. Sans ça, noter un logement effaçait le commentaire en cours.
 */
function renderDetail(id) {
  const r = Store.listings.find(x => x.id === id);
  if (!r) { closeModals(); return; }

  const host = $('#detailCard');
  const sameListing = host.dataset.listing === id;
  const active = document.activeElement;
  const drafts = {};
  if (sameListing) {
    for (const key of DRAFT_FIELDS) {
      const el = host.querySelector('#' + key);
      // « Modifié » = différent de ce qu'on avait affiché, donc tapé par l'utilisateur.
      if (el && el.value !== renderedDrafts[key]) {
        drafts[key] = { value: el.value, focused: el === active,
                        start: el.selectionStart, end: el.selectionEnd };
      }
    }
  }
  const scroll = sameListing ? host.querySelector('.modal-body')?.scrollTop || 0 : 0;
  const st = statusById(r.status);
  const me = state.me;
  const perM2 = (r.price && r.surface) ? Math.round(r.price / r.surface) : null;
  const share = USERS.length && r.price ? Math.round(r.price / USERS.length) : null;

  host.innerHTML = `
    <header class="modal-head">
      <h2>${esc(r.title || 'Sans titre')}</h2>
      <button class="icon-btn" data-close>✕</button>
    </header>

    <div class="modal-body">
      ${r.image_url ? `<div class="d-img" style="background-image:url('${esc(r.image_url)}')"></div>` : ''}

      <div class="d-facts">
        <div><b>${r.price != null ? fmt(r.price) + ' €' : '—'}</b><small>par mois</small></div>
        ${share  ? `<div><b>${fmt(share)} €</b><small>par personne</small></div>` : ''}
        ${r.surface ? `<div><b>${fmt(r.surface)} m²</b><small>surface</small></div>` : ''}
        ${perM2  ? `<div><b>${perM2} €</b><small>par m²</small></div>` : ''}
        ${r.rooms ? `<div><b>${r.rooms}</b><small>chambres</small></div>` : ''}
        ${r.city ? `<div><b>${esc(r.city)}</b><small>localisation</small></div>` : ''}
      </div>

      <section class="d-block">
        <h4>Avancement</h4>
        <div class="pipeline">
          ${STATUSES.map(s => `<button class="pip ${s.id === r.status ? 'is-on' : ''}"
             style="--c:${s.color}" data-setstatus="${s.id}">${esc(s.label)}</button>`).join('')}
        </div>
        <div class="d-track">
          <label>Contacté par
            <select data-field="contacted_by">
              <option value="">— personne —</option>
              ${USERS.map(u => `<option value="${u.id}" ${r.contacted_by === u.id ? 'selected' : ''}>
                ${u.emoji} ${esc(u.name)}</option>`).join('')}
            </select>
          </label>
          <label>Date de visite
            <input type="date" data-field="visit_at" value="${(r.visit_at || '').slice(0,10)}">
          </label>
        </div>
        ${r.contacted_at ? `<p class="hint">Premier contact enregistré le ${dateFR(r.contacted_at)}.</p>` : ''}
      </section>

      <section class="d-block">
        <h4>Ton avis <span class="who-tag" style="--c:${userById(me)?.color}">${userById(me)?.emoji} ${esc(userById(me)?.name || '')}</span></h4>
        <div class="rate">
          ${RATINGS.map(rt => {
            const on = Store.getOpinion(id, me)?.score === rt.score;
            return `<button class="rate-btn ${on ? 'is-on' : ''}" style="--c:${rt.color}"
              data-score="${rt.score}"><span>${rt.emoji}</span>${esc(rt.label)}</button>`;
          }).join('')}
        </div>
        <textarea id="myComment" rows="2" placeholder="Ton commentaire (visible par tout le monde)…"
          >${esc(Store.getOpinion(id, me)?.comment || '')}</textarea>
        <button class="btn btn-ghost btn-sm" id="btnComment">Enregistrer mon commentaire</button>
      </section>

      <section class="d-block">
        <h4>Ce qu'en pense le groupe</h4>
        <div class="opinions">
          ${USERS.map(u => {
            const o = Store.getOpinion(id, u.id);
            const rt = o?.score ? ratingByScore(o.score) : null;
            return `<div class="op ${o ? '' : 'op-empty'}" style="--c:${u.color}">
              <div class="op-head"><span class="av" style="--c:${u.color}">${u.emoji}</span>
                <b>${esc(u.name)}</b>
                <span class="op-score" ${rt ? `style="color:${rt.color}"` : ''}>
                  ${rt ? rt.emoji + ' ' + esc(rt.label) : 'pas encore d\'avis'}</span></div>
              ${o?.comment ? `<p>${esc(o.comment)}</p>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="d-block">
        <h4>Notes communes</h4>
        <textarea id="sharedNotes" rows="3" placeholder="Charges, dispo, contact de l'agence, code d'accès…"
          >${esc(r.notes || '')}</textarea>
        <button class="btn btn-ghost btn-sm" id="btnNotes">Enregistrer les notes</button>
      </section>
    </div>

    <footer class="modal-foot">
      ${r.url ? `<a class="btn btn-ghost" href="${esc(r.url)}" target="_blank" rel="noopener">↗ Voir l'annonce</a>` : ''}
      <div class="spacer"></div>
      <button class="btn btn-ghost" id="btnEditThis">Modifier</button>
      <button class="btn btn-primary" data-close>Fermer</button>
    </footer>`;

  // Restauration de la saisie en cours, du curseur et du défilement.
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
  if (scroll) host.querySelector('.modal-body').scrollTop = scroll;

  // Interactions du détail
  const card = host;
  card.querySelectorAll('[data-setstatus]').forEach(b => b.onclick = () =>
    Store.patchListing(id, { status: b.dataset.setstatus }));
  card.querySelectorAll('[data-field]').forEach(el => el.onchange = () =>
    Store.patchListing(id, { [el.dataset.field]: el.value || null }));
  card.querySelectorAll('[data-score]').forEach(b => b.onclick = () =>
    Store.saveOpinion({ listing_id: id, user_id: me, score: +b.dataset.score }));
  card.querySelector('#btnComment').onclick = async () => {
    await Store.saveOpinion({ listing_id: id, user_id: me, comment: card.querySelector('#myComment').value });
    toast('Commentaire enregistré');
  };
  card.querySelector('#btnNotes').onclick = async () => {
    await Store.patchListing(id, { notes: card.querySelector('#sharedNotes').value });
    toast('Notes enregistrées');
  };
  card.querySelector('#btnEditThis').onclick = () => { $('#detail').classList.add('hidden'); openEditor(id); };
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
  $('#editModal').classList.remove('hidden');
  setTimeout(() => $(r ? '#fTitle' : '#fUrl').focus(), 50);
}

async function doFetch() {
  const url = $('#fUrl').value.trim();
  if (!url) return;
  const msg = $('#fetchMsg');
  $('#btnFetch').disabled = true;
  msg.textContent = '⏳ Lecture de l\'annonce…'; msg.className = 'hint';
  try {
    const d = await extractFromUrl(url);
    $('#fUrl').value = d.url || normalizeUrl(url);
    const set = (sel, v) => { if (v != null && v !== '' && !$(sel).value) $(sel).value = v; };
    set('#fTitle', d.title); set('#fPrice', d.price); set('#fSurface', d.surface);
    set('#fRooms', d.rooms); set('#fCity', d.city);  set('#fImage', d.image_url);
    const got = ['title','price','surface','rooms','city'].filter(k => d[k] != null && d[k] !== '');
    msg.textContent = got.length
      ? `✅ Trouvé : ${got.join(', ')}. Vérifie et corrige si besoin.`
      : '⚠️ Rien d\'exploitable trouvé — remplis à la main.';
    msg.className = got.length ? 'hint ok' : 'hint warn';
  } catch {
    msg.textContent = '⚠️ Page illisible automatiquement (site protégé). Remplis les champs à la main, ça marche pareil.';
    msg.className = 'hint warn';
  } finally { $('#btnFetch').disabled = false; }
}

async function saveFromForm() {
  const cur = state.editingId ? Store.listings.find(x => x.id === state.editingId) : null;
  const data = {
    ...(cur || {}),
    id: state.editingId || undefined,
    url: normalizeUrl($('#fUrl').value),
    title: $('#fTitle').value.trim() || 'Sans titre',
    price: $('#fPrice').value, surface: $('#fSurface').value, rooms: $('#fRooms').value,
    city: $('#fCity').value.trim(),
    status: $('#fStatus').value,
    contacted_by: $('#fContactedBy').value,
    visit_at: $('#fVisitAt').value || null,
    image_url: $('#fImage').value.trim(),
    notes: $('#fNotes').value,
    added_by: cur?.added_by || state.me || '',
  };
  try {
    const { isNew } = await Store.saveListing(data);
    closeModals();
    toast(isNew ? '🏠 Logement ajouté' : '✅ Modifications enregistrées');
  } catch (e) { toast('❌ Erreur : ' + (e.message || e), 6000); }
}

async function deleteCurrent() {
  if (!state.editingId) return;
  const r = Store.listings.find(x => x.id === state.editingId);
  if (!confirm(`Supprimer « ${r?.title || 'ce logement'} » pour tout le monde ?`)) return;
  await Store.deleteListing(state.editingId);
  closeModals();
  toast('🗑️ Supprimé');
}

function closeModals() {
  $('#editModal').classList.add('hidden');
  $('#detail').classList.add('hidden');
  // Repartir d'une fiche neuve à la prochaine ouverture : on ne veut pas
  // ressusciter un brouillon abandonné.
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
  { day: '2-digit', month: 'short' }); } catch { return ''; } };

let toastTimer;
function toast(msg, ms = 3000) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
