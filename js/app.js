// ─────────────────────────────────────────────────────────────
//  APP — rendu et interactions.
// ─────────────────────────────────────────────────────────────
import { USERS, STATUSES, RATINGS, LESSORS, ROOM_CHECKS, CRITERIA,
         statusById, userById, ratingByScore, lessorById, roomCheckById,
         inTargetArea } from './config.js';
import { Store } from './store.js';
import { extractFromUrl, normalizeUrl } from './extract.js';
import { loadSeen, initSeen, changeOf, markSeen, markAllSeen } from './changes.js';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const icon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** Une valeur stockée peut avoir survécu à un renommage dans config.js. */
const savedMe = localStorage.getItem('kolok.me');

const state = {
  me: userById(savedMe) ? savedMe : null,
  statuses: new Set(),          // vide = toutes les étapes
  q: '',
  maxPerPerson: null,
  onlyArea: false,
  onlyFurnished: false,
  sort: 'recent',
  view: 'board',                // 'board' | 'table'
  editingId: null,
  detailId: null,
  lastFocus: null,              // à qui rendre le focus en fermant un panneau
  seen: { since: null, seen: {} },
  onlyChanged: false,
};

/** Ce qui a bougé sur une fiche depuis que je l'ai vue, ou null. */
const changeFor = r => changeOf(r, Store.opinionsFor(r.id), state.me, state.seen);

// ═══════════════════ DÉMARRAGE ═══════════════════
(async function main() {
  buildStaticUI();
  // Les écouteurs AVANT l'attente réseau : sinon, pendant les secondes que
  // prennent l'import du SDK et les deux requêtes, l'interface est affichée
  // mais entièrement morte au clic, sans que rien ne l'indique.
  wireEvents();
  if (!state.me) $('#whoami').classList.remove('hidden');
  showSkeleton();
  await Store.init();
  Store.onChange(render);
  if (state.me) applyMe();
  render();
})();

function showSkeleton() {
  $('#grid').innerHTML = `<div class="skeleton" aria-hidden="true">
    ${'<div class="sk-card"></div>'.repeat(3)}</div>`;
  $('#stats').innerHTML = '<span class="sk-line"></span>';
}

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
  $('#fContactedBy').innerHTML = `<option value="">Pas encore</option>` +
    USERS.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  $('#fRoomsChecked').innerHTML =
    ROOM_CHECKS.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
  $('#btnArea').lastElementChild.textContent = CRITERIA.quartier;
}

// ═══════════════════ ÉVÉNEMENTS ═══════════════════
function wireEvents() {
  $('#whoBtns').addEventListener('click', e => {
    const b = e.target.closest('[data-user]'); if (!b) return;
    state.me = b.dataset.user;
    try { localStorage.setItem('kolok.me', state.me); } catch { /* stockage bloqué */ }
    $('#whoami').classList.add('hidden');
    applyMe(); render();
  });
  $('#btnMe').addEventListener('click', () => {
    // Le bouton « Annuler » n'a de sens que si quelqu'un est déjà choisi :
    // au tout premier lancement, il n'y a nulle part où revenir.
    $('#gateCancel').classList.toggle('hidden', !state.me);
    $('#whoami').classList.remove('hidden');
  });
  // Sans cette sortie, un appui accidentel sur l'avatar obligeait à
  // re-choisir un utilisateur ou à recharger la page.
  $('#gateCancel').addEventListener('click', () => $('#whoami').classList.add('hidden'));

  $('#btnTheme').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', next === 'dark' ? '#0F1216' : '#f2f3f5');
    try { localStorage.setItem('kolok.theme', next); } catch { /* stockage bloqué */ }
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
    state.maxPerPerson = Number.isFinite(v) && v > 0 ? v : null; render();
  });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });

  $('#btnArea').addEventListener('click', () => {
    state.onlyArea = !state.onlyArea;
    $('#btnArea').setAttribute('aria-pressed', String(state.onlyArea));
    $('#btnArea').classList.toggle('is-on', state.onlyArea);
    render();
  });
  $('#btnFurnished').addEventListener('click', () => {
    state.onlyFurnished = !state.onlyFurnished;
    $('#btnFurnished').setAttribute('aria-pressed', String(state.onlyFurnished));
    $('#btnFurnished').classList.toggle('is-on', state.onlyFurnished);
    render();
  });
  $('#btnOnlyChanged').addEventListener('click', () => {
    state.onlyChanged = !state.onlyChanged;
    render();
  });
  $('#btnSeenAll').addEventListener('click', () => {
    state.seen = markAllSeen(state.me, state.seen);
    state.onlyChanged = false;
    render();
    toast('C’est noté, tout est marqué comme lu.');
  });
  $('#btnRetry').addEventListener('click', async () => {
    const b = $('#btnRetry'); b.disabled = true; b.textContent = 'Connexion…';
    const ok = await Store.retry();
    b.disabled = false; b.textContent = 'Réessayer';
    toast(ok ? 'Connecté : vos ajouts sont de nouveau partagés.'
             : 'Toujours injoignable. Réessayez dans un instant.', 5000);
    render();
  });

  $('#btnBoard').addEventListener('click', () => setView('board'));
  $('#btnCompare').addEventListener('click', () => setView('table'));

  $('#btnAdd').addEventListener('click', () => openEditor(null));

  // Ouverture d'une fiche, par délégation : les cartes et les lignes du
  // tableau sont reconstruites à chaque rendu, on n'y attache rien.
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-add]')) { openEditor(null); return; }
    if (e.target.closest('[data-clear-filters]')) { clearFilters(); return; }
    if (e.target.closest('.link-out')) return;      // le lien externe garde son rôle
    const el = e.target.closest('.card[data-id], .cmp tbody tr[data-id]');
    if (el) openDetail(el.dataset.id);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Même exclusion que pour le clic : sans elle, Entrée sur le lien
    // « Annonce » d'une carte ouvrait la fiche au lieu de suivre le lien,
    // rendant l'annonce inatteignable au clavier.
    if (e.target.closest?.('.link-out')) return;
    const el = e.target.closest?.('.card[data-id], .cmp tbody tr[data-id]');
    if (!el) return;
    e.preventDefault();
    openDetail(el.dataset.id);
  });
  $('#btnFetch').addEventListener('click', doFetch);
  $('#fLessorType').addEventListener('change', syncLessorField);
  // Le store applique la règle de toute façon ; on la montre ici pour que le
  // formulaire n'affiche pas un statut différent de ce qui sera enregistré.
  $('#fContactedBy').addEventListener('change', () => {
    if ($('#fContactedBy').value && $('#fStatus').value === 'a_contacter') {
      $('#fStatus').value = 'contacte';
    }
  });
  $('#fPrice').addEventListener('input', showPriceHint);
  $('#fPriceMode').addEventListener('change', showPriceHint);
  $('#fUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doFetch(); } });
  $('#btnSave').addEventListener('click', saveFromForm);
  $('#btnDelete').addEventListener('click', deleteCurrent);

  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) closeModals();
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModals(); return; }
    if (e.key === 'Tab' && anyModalOpen()) { trapFocus(e); return; }
    // Sans le test de panneau ouvert, « / » envoyait le focus dans la
    // recherche DERRIÈRE la fiche : on filtrait un tableau invisible.
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (e.key === '/' && !typing && !anyModalOpen()) { e.preventDefault(); $('#search').focus(); }
  });

  // Coller un lien n'importe où ouvre l'ajout, pré-rempli.
  document.addEventListener('paste', e => {
    // SELECT manquait : on perdait un formulaire entièrement saisi à la main
    // quand l'utilisateur collait l'URL juste après avoir choisi une étape.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (anyModalOpen()) return;          // sinon le formulaire s'ouvre derrière la fiche
    const txt = (e.clipboardData?.getData('text') || '').trim();
    if (/^https?:\/\//i.test(txt)) { openEditor(null); $('#fUrl').value = txt; doFetch(); }
  });
}

const anyModalOpen = () =>
  !$('#editModal').classList.contains('hidden') || !$('#detail').classList.contains('hidden');

/** Le focus doit tourner DANS le panneau ouvert, pas filer derrière lui. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
function trapFocus(e) {
  const modal = $('#editModal').classList.contains('hidden') ? $('#detail') : $('#editModal');
  const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/**
 * Toutes les écritures de la fiche partaient sans filet : hors réseau, un
 * clic sur une étape ne faisait rien du tout, sans le moindre message.
 */
const guard = (promise, done) => promise.then(done).catch(err => {
  console.error(err);
  toast('Échec de l’enregistrement. ' + friendlyError(err), 6000);
});

function friendlyError(err) {
  const m = String(err?.message || err || '');
  if (/Déjà dans la liste/.test(m)) return m;
  if (/Stockage local/.test(m)) return m;
  if (/fetch|network|Failed to fetch/i.test(m)) return 'Pas de réseau — réessayez.';
  return 'Réessayez dans un instant.';
}

function clearFilters() {
  state.q = ''; state.maxPerPerson = null; state.statuses.clear();
  state.onlyArea = false; state.onlyFurnished = false;
  $('#search').value = ''; $('#maxPrice').value = '';
  for (const id of ['#btnArea', '#btnFurnished']) {
    $(id).classList.remove('is-on'); $(id).setAttribute('aria-pressed', 'false');
  }
  render();
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
  Store.actor = u.id;
  state.seen = initSeen(state.me, loadSeen(state.me));
  $('#btnMe').textContent = u.initial;
  $('#btnMe').style.setProperty('--c', u.color);
  $('#btnMe').title = `${u.name} — changer d’utilisateur`;
}

// ═══════════════════ FILTRAGE / TRI ═══════════════════
/** Part mensuelle par personne : c'est en ces termes que le groupe raisonne. */
const perPerson = r => r.price != null ? Math.round(r.price / USERS.length) : null;

/**
 * Le €/m² n'a de sens que si le loyer couvre bien tout le logement. Quand on
 * ne prend que 3 chambres sur 4, diviser par la surface totale sous-évaluait
 * le prix de 30 % — et classait les annonces les plus chères comme les plus
 * économiques.
 */
function perM2(r) {
  if (!r.price || !r.surface) return null;
  if (r.rooms_total && r.rooms && r.rooms_total > r.rooms) return null;
  return Math.round(r.price / r.surface);
}

function sortRows(rows) {
  const s = state.sort;
  return rows.sort((a, b) => {
    if (s === 'price_asc')  return (a.price ?? 1e9) - (b.price ?? 1e9);
    if (s === 'price_desc') return (b.price ?? -1) - (a.price ?? -1);
    if (s === 'surface')    return (b.surface ?? -1) - (a.surface ?? -1);
    if (s === 'score') {
      // À moyenne égale, celle qui a le plus de votants passe devant : un 4
      // donné par une seule personne ne vaut pas un 4 à l'unanimité.
      const d = (Store.avgScore(b.id) ?? -1) - (Store.avgScore(a.id) ?? -1);
      return d || Store.voteCount(b.id) - Store.voteCount(a.id);
    }
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

function visibleListings() {
  let rows = [...Store.listings];
  if (state.statuses.size) rows = rows.filter(r => state.statuses.has(r.status));
  // Le filtre porte sur la part de chacun, pas sur le total : personne ne
  // pense son budget en « 1 650 € », tout le monde le pense en « 550 € ».
  if (state.maxPerPerson) {
    rows = rows.filter(r => r.price == null || perPerson(r) <= state.maxPerPerson);
  }
  if (state.onlyArea)      rows = rows.filter(r => inTargetArea(r.city));
  if (state.onlyFurnished) rows = rows.filter(r => r.furnished === true);
  if (state.onlyChanged)   rows = rows.filter(r => changeFor(r));
  if (state.q) {
    rows = rows.filter(r => [r.title, r.city, r.notes, r.url, r.lessor_name,
      ...Store.opinionsFor(r.id).map(o => o.comment)].join(' ').toLowerCase().includes(state.q));
  }
  return sortRows(rows);
}

const anyFilter = () => !!(state.q || state.maxPerPerson || state.statuses.size
                        || state.onlyArea || state.onlyFurnished || state.onlyChanged);

// ═══════════════════ RENDU ═══════════════════
function render() {
  renderChips();
  renderSummary();
  renderBanner();
  renderNews();
  const rows = visibleListings();

  const table = state.view === 'table';
  $('#compare').classList.toggle('hidden', !table || !rows.length);
  $('#grid').classList.toggle('hidden', table || !rows.length);
  renderEmpty(rows);

  if (rows.length) { if (table) renderCompare(rows); else renderBoard(rows); }
  if (state.detailId && !$('#detail').classList.contains('hidden')) renderDetail(state.detailId);
}

/**
 * « Rien à cette étape » s'affichait dans trois situations très différentes,
 * dont deux où le message était faux : premier lancement, et recherche sans
 * résultat. Dans ce dernier cas il proposait même d'ajouter un logement,
 * alors que la bonne action est d'effacer le filtre.
 */
function renderEmpty(rows) {
  const box = $('#empty');
  box.classList.toggle('hidden', rows.length > 0);
  if (rows.length) return;

  if (!Store.listings.length) {
    box.innerHTML = `<h2>Aucun logement pour l’instant</h2>
      <p>Collez le lien d’une annonce n’importe où sur la page&nbsp;: la plupart des
         informations se remplissent toutes seules. Sur téléphone, passez par «&nbsp;Ajouter&nbsp;».</p>
      <button class="btn btn-solid" data-open-add>${icon('plus')}<span>Ajouter un logement</span></button>`;
  } else if (anyFilter()) {
    const masked = Store.listings.length;
    box.innerHTML = `<h2>Aucun résultat</h2>
      <p>${masked} logement${masked > 1 ? 's sont masqués' : ' est masqué'} par les filtres en cours.</p>
      <button class="btn btn-solid" data-clear-filters>Effacer les filtres</button>`;
  } else {
    box.innerHTML = `<h2>Rien à cette étape</h2>
      <p>Aucun logement n’est à cette étape de la recherche pour le moment.</p>`;
  }
}

function renderBanner() {
  const b = $('#banner');
  b.classList.toggle('hidden', !Store.degraded);
  b.setAttribute('aria-hidden', String(!Store.degraded));
}

/**
 * Le résumé des nouveautés. Il n'apparaît que s'il y a quelque chose à dire,
 * et il rétrécit tout seul à mesure qu'on ouvre les fiches concernées.
 */
function renderNews() {
  const bar = $('#news');
  const changed = Store.listings.map(r => [r, changeFor(r)]).filter(([, c]) => c);
  if (!changed.length) {
    bar.classList.add('hidden');
    if (state.onlyChanged) { state.onlyChanged = false; }
    return;
  }

  const added = changed.filter(([, c]) => c.kind === 'new');
  const edits = changed.filter(([, c]) => c.kind === 'edit' || c.kind === 'both');
  const votes = changed.filter(([, c]) => c.kind === 'opinion' || c.kind === 'both');
  const names = ids => [...new Set(ids.filter(Boolean))]
    .map(id => userById(id)?.name).filter(Boolean);

  const bits = [];
  if (added.length) {
    const who = names(added.map(([r]) => r.added_by));
    bits.push(`<b>${added.length}</b> logement${added.length > 1 ? 's' : ''} ajouté${
      added.length > 1 ? 's' : ''}${who.length ? ' par ' + enumerate(who) : ''}`);
  }
  if (edits.length) {
    const who = names(edits.map(([, c]) => c.by));
    bits.push(`<b>${edits.length}</b> fiche${edits.length > 1 ? 's' : ''} modifiée${
      edits.length > 1 ? 's' : ''}${who.length ? ' par ' + enumerate(who) : ''}`);
  }
  if (votes.length) {
    const who = names(votes.flatMap(([, c]) => (c.votes || []).map(o => o.user_id)));
    const n = votes.reduce((s, [, c]) => s + (c.votes?.length || 0), 0);
    bits.push(`<b>${n}</b> avis${who.length ? ' de ' + enumerate(who) : ''}`);
  }

  $('#newsText').innerHTML = 'Depuis votre dernière visite&nbsp;: ' + bits.join(', ') + '.';
  $('#btnOnlyChanged').textContent = state.onlyChanged ? 'Tout afficher' : 'Voir';
  bar.classList.remove('hidden');
}

function renderChips() {
  $$('#statusChips .chip').forEach(c => {
    const id = c.dataset.status;
    const count = id === '*' ? Store.listings.length
                             : Store.listings.filter(r => r.status === id).length;
    c.querySelector('.chip-count').textContent = count || '';
    const on = id === '*' ? state.statuses.size === 0 : state.statuses.has(id);
    c.classList.toggle('is-on', on);
    // L'état sélectionné n'existait que comme couleur : invisible pour un
    // lecteur d'écran comme pour un daltonien.
    c.setAttribute('aria-pressed', String(on));
  });
}

function renderSummary() {
  const all = Store.listings;
  // Un logement écarté ne doit pas peser sur le budget prévisionnel : la
  // moyenne était tirée vers le bas par des fiches déjà refusées.
  const live = all.filter(r => r.status !== 'refuse');
  const shares = live.map(perPerson).filter(p => p != null);
  const share = shares.length
    ? Math.round(shares.reduce((a, b) => a + b, 0) / shares.length) : null;
  const todo = live.filter(r => r.status === 'a_contacter').length;
  // Une visite sur une fiche refusée n'est plus « à venir ». Et la date est
  // comparée à aujourd'hui minuit, en heure locale : « visit_at » est un jour
  // civil, pas un instant, et le comparer à Date.now() faisait disparaître la
  // visite du jour dès la première heure de la journée.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soon = live.filter(r => r.visit_at && !['refuse', 'valide'].includes(r.status)
                              && dayStart(r.visit_at) >= today).length;

  const bits = [`<b>${live.length}</b> logement${live.length > 1 ? 's' : ''} en course`];
  if (all.length > live.length) bits.push(`<b>${all.length - live.length}</b> écarté${all.length - live.length > 1 ? 's' : ''}`);
  if (share != null) bits.push(`<b>${fmt(share)}&nbsp;€</b> par personne en moyenne`);
  if (todo)  bits.push(`<b>${todo}</b> à contacter`);
  if (soon)  bits.push(`<b>${soon}</b> visite${soon > 1 ? 's' : ''} à venir`);
  bits.push(Store.mode === 'cloud'
    ? '<span class="mode-pill cloud">synchronisé</span>'
    : '<span class="mode-pill">sur cet appareil</span>');

  $('#stats').innerHTML = bits.join('<span class="sep">·</span>');
}

/** Un « 2026-08-15 » lu comme un jour civil local, pas comme minuit UTC. */
function dayStart(d) {
  const m = String(d).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
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
        ${avg != null ? `<span class="stage-sum">${fmt(avg)} € en moyenne</span>` : ''}
      </header>
      <div class="cards">${items.map(cardHTML).join('')}</div>
    </section>`;
  }).join('');
}

/** Chambres libres, et sur combien. « 3 libres / 4 » quand une est prise. */
function roomsLabel(r) {
  if (!r.rooms) return '';
  const chk = roomCheckById(r.rooms_checked);
  const n = r.rooms_total && r.rooms_total > r.rooms
    ? `${r.rooms} libres / ${r.rooms_total}`
    : `${r.rooms} chambre${r.rooms > 1 ? 's' : ''}`;
  const mark = r.rooms_checked === 'confirme' ? '✓' : r.rooms_checked === 'faux' ? '✕' : '?';
  return `<li title="${esc(chk.label)}">${icon('bed')}${n}
    <b class="chk chk-${r.rooms_checked || 'todo'}" aria-label="${esc(chk.label)}">${mark}</b></li>`;
}

function cardHTML(r) {
  const m2    = perM2(r);
  const share = perPerson(r);
  const off   = r.city && !inTargetArea(r.city);

  const voters = USERS.map(u => {
    const o  = Store.getOpinion(r.id, u.id);
    const rt = o?.score ? ratingByScore(o.score) : null;
    const tip = `${u.name} : ${rt ? rt.label : 'pas encore d’avis'}${o?.comment ? ' — a commenté' : ''}`;
    return `<span class="voter ${rt ? '' : 'none'}" ${rt ? `style="--r-color:${rt.color}"` : ''}
      title="${esc(tip)}">${u.initial}${o?.comment ? '<i class="said"></i>' : ''}</span>`;
  }).join('');

  const lsr = lessorById(r.lessor_type);
  const lsrLabel = lsr && r.lessor_type === 'agence' && r.lessor_name ? r.lessor_name
                 : lsr ? lsr.label : '';

  // Une visite passée n'est plus « à venir » : le libellé bascule au lieu
  // d'annoncer indéfiniment une date vieille de trois semaines.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past  = r.visit_at && dayStart(r.visit_at) < today;
  const who   = userById(r.contacted_by);
  const flag = r.visit_at
    ? `<span class="card-flag">${icon('calendar')}${past ? 'Visité le' : 'Visite le'} ${dateFR(r.visit_at)}</span>`
    : who
      ? `<span class="card-flag">${icon('phone')}${esc(who.name)}</span>`
      : '';

  const chg = changeFor(r);
  return `<article class="card ${r.image_url ? '' : 'no-media'} ${chg ? 'is-new' : ''}"
     tabindex="0" data-id="${r.id}" aria-label="${esc(cardLabel(r))}">
    ${chg ? `<span class="news-dot" title="${esc(changeLabel(chg))}">
       <span class="sr-only">${esc(changeLabel(chg))}</span></span>` : ''}
    ${r.image_url ? `<img class="card-media" src="${esc(r.image_url)}" alt="" loading="lazy"
       onerror="this.closest('.card').classList.add('no-media');this.remove()">` : ''}
    <div class="card-body">
      <span class="card-price">
        <b>${share != null ? fmt(share) + ' €' : '— €'}</b>
        <span class="per">par personne</span>
        ${r.price != null ? `<span class="perm2">${fmt(r.price)} € au total</span>` : ''}
      </span>
      <span class="card-title">${esc(r.title || 'Sans titre')}</span>
      <ul class="card-meta">
        ${r.surface ? `<li>${icon('area')}${fmt(r.surface)} m²${m2 ? ` · ${m2} €/m²` : ''}</li>` : ''}
        ${roomsLabel(r)}
        ${r.city ? `<li>${icon('pin')}<span class="truncate">${esc(r.city)}</span></li>` : ''}
        ${lsr ? `<li>${icon(lsr.icon)}<span class="truncate">${esc(lsrLabel)}</span></li>` : ''}
      </ul>
      <div class="card-tags">
        ${r.furnished === true ? '<span class="tag tag-ok">Meublé</span>' : ''}
        ${r.furnished === false ? '<span class="tag">Non meublé</span>' : ''}
        ${off ? `<span class="tag tag-warn">Hors ${esc(CRITERIA.quartier)}</span>` : ''}
        ${r.upfront_cost ? `<span class="tag">${fmt(r.upfront_cost)} € à l’entrée</span>` : ''}
      </div>
      <div class="card-foot">
        <span class="voters">${voters}</span>
        ${flag}
        ${r.url ? `<a class="link-out" href="${esc(r.url)}" target="_blank" rel="noopener"
           title="Ouvrir l’annonce dans un nouvel onglet">${icon('link')}<span>Annonce</span></a>` : ''}
      </div>
    </div>
  </article>`;
}

/** Nom lisible pour un lecteur d'écran, au lieu de tout le contenu concaténé. */
function cardLabel(r) {
  const bits = [r.title || 'Sans titre'];
  const share = perPerson(r);
  if (share != null) bits.push(`${share} € par personne`);
  if (r.rooms) bits.push(`${r.rooms} chambre${r.rooms > 1 ? 's' : ''}`);
  if (r.city) bits.push(r.city);
  bits.push(statusById(r.status).label);
  const chg = changeFor(r);
  if (chg) bits.push(changeLabel(chg));
  return bits.join(', ');
}

function changeLabel(c) {
  const by = userById(c.by)?.name;
  const when = dateFR(c.at);
  if (c.kind === 'new')  return `Ajouté${by ? ' par ' + by : ''} le ${when}`;
  if (c.kind === 'edit') return `Modifié${by ? ' par ' + by : ''} le ${when}`;
  if (c.kind === 'both') return `Modifié et commenté${by ? ' par ' + by : ''} le ${when}`;
  const who = [...new Set((c.votes || []).map(o => userById(o.user_id)?.name).filter(Boolean))];
  return `Nouvel avis${who.length ? ' de ' + enumerate(who) : ''} le ${when}`;
}

// ── Tableau comparatif ───────────────────────────────────────
function renderCompare(rows) {
  if (!rows.length) { $('#compare').innerHTML = ''; return; }
  // Colonnes chiffrées, alignées à droite. « Ville » et « Bailleur » sont du
  // texte : leur en-tête était aligné à droite au-dessus de cellules à gauche.
  const head = [
    { t: 'Logement' },        { t: 'Par pers.', n: 1 }, { t: 'Total', n: 1 },
    { t: 'Surface (m²)', n: 1 }, { t: '€/m²', n: 1 },   { t: 'Chambres', n: 1 },
    { t: 'À l’entrée', n: 1 }, { t: 'Meublé' },         { t: 'Ville' },
    { t: 'Bailleur' },        { t: 'Étape' },
    ...USERS.map(u => ({ t: u.name, n: 1 })), { t: 'Moyenne', n: 1 },
  ];
  $('#compare').innerHTML = `<div class="table-wrap"><table class="cmp">
    <caption class="sr-only">Comparaison des ${rows.length} logements affichés</caption>
    <thead><tr>${head.map(h =>
      `<th scope="col" class="${h.n ? 'n' : ''}">${esc(h.t)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => {
      const st = statusById(r.status);
      const avg = Store.avgScore(r.id);
      const votes = Store.voteCount(r.id);
      const m2 = perM2(r);
      const share = perPerson(r);
      const chk = roomCheckById(r.rooms_checked);
      const off = r.city && !inTargetArea(r.city);
      return `<tr data-id="${r.id}" tabindex="0">
        <th scope="row" class="cmp-name">${esc(r.title || 'Sans titre')}</th>
        <td class="n"><b>${share != null ? fmt(share) + ' €' : '—'}</b></td>
        <td class="n">${r.price != null ? fmt(r.price) + ' €' : '—'}</td>
        <td class="n">${r.surface ? fmt(r.surface) : '—'}</td>
        <td class="n">${m2 ?? '—'}</td>
        <td class="n">${r.rooms ? `${r.rooms}${r.rooms_total && r.rooms_total > r.rooms ? '/' + r.rooms_total : ''}
          <b class="chk chk-${r.rooms_checked || 'todo'}" title="${esc(chk.label)}">${
            r.rooms_checked === 'confirme' ? '✓' : r.rooms_checked === 'faux' ? '✕' : '?'}</b>` : '—'}</td>
        <td class="n">${r.upfront_cost ? fmt(r.upfront_cost) + ' €' : '—'}</td>
        <td>${r.furnished == null ? '—' : r.furnished ? 'Oui' : 'Non'}</td>
        <td class="${off ? 'off-area' : ''}">${esc(r.city || '—')}</td>
        <td>${(() => { const l = lessorById(r.lessor_type); return l
          ? esc(l.id === 'agence' && r.lessor_name ? r.lessor_name : l.label) : '—'; })()}</td>
        <td><span class="stage-tag" style="--c:${st.color}"><span class="dot"></span>${esc(st.short)}</span></td>
        ${USERS.map(u => {
          const o = Store.getOpinion(r.id, u.id);
          const rt = o?.score ? ratingByScore(o.score) : null;
          // Le chiffre dans la pastille : la couleur seule excluait les
          // daltoniens et n'était lisible par personne au doigt.
          return `<td class="n">
            <span class="sr-only">${esc(u.name)} : ${esc(rt ? rt.label : 'pas encore d’avis')}${
              o?.comment ? '. ' + esc(o.comment) : ''}</span>
            <span class="vote ${rt ? '' : 'none'}" aria-hidden="true"
              ${rt ? `style="--r-color:${rt.color}"` : ''}>${rt ? rt.score : '·'}</span></td>`;
        }).join('')}
        <td class="n"><b>${avg != null ? avg.toFixed(1) : '—'}</b>${
          votes ? `<span class="votes">/${votes}</span>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ── Fiche détaillée ──────────────────────────────────────────
function openDetail(id) {
  state.lastFocus = document.activeElement;
  state.detailId = id;
  // La marque « nouveau » s'efface en lisant : c'est tout le contrat de
  // cette fonctionnalité. Pas de bouton à cliquer, pas de liste à purger.
  const wasNew = !!changeFor(Store.listings.find(x => x.id === id));
  renderDetail(id);
  $('#detail').classList.remove('hidden');
  lockScroll(true);
  $('#detailCard').focus();
  if (wasNew) { touched(id); render(); }
}

/**
 * Ce que je viens de toucher, je l'ai vu. Marquer à l'écriture évite de
 * s'annoncer ses propres modifications — y compris avant que la colonne
 * « updated_by » n'existe en base, où rien ne permet de les distinguer.
 */
function touched(id) {
  state.seen = markSeen(state.me, state.seen, Store.listings.find(x => x.id === id));
}

/** Sans ça, arrivé en bas du panneau, le geste continue et fait défiler la page derrière. */
function lockScroll(on) { document.body.classList.toggle('no-scroll', on); }

const DRAFT_FIELDS = ['myComment', 'sharedNotes', 'lessorName'];
let renderedDrafts = {};

/**
 * La fiche est re-rendue à CHAQUE changement de données, y compris ceux
 * d'un colocataire en temps réel. On relève donc d'abord la saisie en
 * cours pour la restituer ensuite, sinon elle serait effacée.
 */
function renderDetail(id) {
  const r = Store.listings.find(x => x.id === id);
  // Un colocataire peut supprimer la fiche pendant qu'on la lit : la fermer
  // sans un mot laissait croire à un bug.
  if (!r) { closeModals(); toast('Ce logement vient d’être supprimé par un colocataire.', 5000); return; }

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
  const m2    = perM2(r);
  const share = perPerson(r);
  const mine  = Store.getOpinion(id, me);
  const chk   = roomCheckById(r.rooms_checked);
  const off   = r.city && !inTargetArea(r.city);

  host.innerHTML = `
    <header class="sheet-head">
      <h2 id="detailTitle">${esc(r.title || 'Sans titre')}</h2>
      <button class="icon-btn" data-close aria-label="Fermer la fiche">${icon('close')}</button>
    </header>

    <div class="sheet-body">
      ${r.image_url ? `<img class="d-media" src="${esc(r.image_url)}" alt=""
         onerror="this.remove()">` : ''}

      <div class="facts">
        ${share != null ? `<div><b>${fmt(share)} €</b><span>par personne</span></div>` : ''}
        <div><b>${r.price != null ? fmt(r.price) + ' €' : '—'}</b><span>au total</span></div>
        ${r.surface ? `<div><b>${fmt(r.surface)} m²</b><span>surface</span></div>` : ''}
        ${m2      ? `<div><b>${m2} €</b><span>par m²</span></div>` : ''}
        ${r.rooms ? `<div><b>${r.rooms}${r.rooms_total && r.rooms_total > r.rooms ? ` / ${r.rooms_total}` : ''}</b>
           <span>chambre${r.rooms > 1 ? 's' : ''} libre${r.rooms > 1 ? 's' : ''}</span></div>` : ''}
        ${r.upfront_cost ? `<div><b>${fmt(r.upfront_cost)} €</b><span>à l’entrée</span></div>` : ''}
        ${r.city  ? `<div><b style="font-size:13px">${esc(r.city)}</b><span>ville</span></div>` : ''}
      </div>

      <div class="card-tags">
        <span class="tag chk-${r.rooms_checked || 'todo'}">Chambres&nbsp;: ${esc(chk.label.toLowerCase())}</span>
        ${r.furnished === true ? '<span class="tag tag-ok">Meublé — préavis 1 mois</span>' : ''}
        ${r.furnished === false ? '<span class="tag">Non meublé</span>' : ''}
        ${r.furnished == null ? '<span class="tag tag-warn">Meublé&nbsp;? à vérifier</span>' : ''}
        ${off ? `<span class="tag tag-warn">Hors ${esc(CRITERIA.quartier)}</span>` : ''}
      </div>

      <section class="block">
        <h3>Où on en est</h3>
        <div class="pips">
          ${STATUSES.map(s => `<button class="pip ${s.id === r.status ? 'is-on' : ''}"
             style="--c:${s.color}" data-setstatus="${s.id}"
             ${s.id === r.status ? 'aria-current="true"' : ''}>${esc(s.label)}</button>`).join('')}
        </div>
        <div class="track">
          <label>Chambres vérifiées&nbsp;?
            <select data-field="rooms_checked">
              ${ROOM_CHECKS.map(c => `<option value="${c.id}" ${
                (r.rooms_checked || '') === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
          </label>
          <label>Meublé&nbsp;?
            <select data-field="furnished">
              <option value="" ${r.furnished == null ? 'selected' : ''}>À vérifier</option>
              <option value="oui" ${r.furnished === true ? 'selected' : ''}>Oui</option>
              <option value="non" ${r.furnished === false ? 'selected' : ''}>Non</option>
            </select>
          </label>
          <label>Contacté par
            <select data-field="contacted_by">
              <option value="">Pas encore</option>
              ${USERS.map(u => `<option value="${u.id}" ${r.contacted_by === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            </select>
          </label>
          <label>Date de visite
            <input type="date" data-field="visit_at" value="${esc((r.visit_at || '').slice(0, 10))}">
          </label>
          <label>Qui loue
            <select data-field="lessor_type">
              <option value="">Non précisé</option>
              ${LESSORS.map(l => `<option value="${l.id}" ${r.lessor_type === l.id ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
            </select>
          </label>
          ${r.lessor_type === 'agence' ? `<label>Nom de l’agence
            <input id="lessorName" type="text" data-field="lessor_name" placeholder="Foncia, Century 21…"
                   value="${esc(r.lessor_name || '')}">
          </label>` : ''}
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
              <span class="op-score" ${rt ? `style="--r-color:${rt.color}"` : ''}>${rt ? esc(rt.label) : 'pas encore d’avis'}</span>
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

  // Ce que je viens de modifier, je l'ai forcément vu : on le marque lu au
  // passage, pour ne jamais s'annoncer ses propres changements.
  const seen = fn => () => { touched(id); fn?.(); };

  host.querySelectorAll('[data-setstatus]').forEach(b => b.onclick = () =>
    guard(Store.patchListing(id, { status: b.dataset.setstatus }), seen()));
  host.querySelectorAll('[data-field]').forEach(el => el.onchange = () => {
    const f = el.dataset.field;
    // « rooms_checked » a une valeur vide légitime (« annoncé, pas vérifié ») :
    // la convertir en null la ferait retomber au défaut côté base.
    const v = f === 'furnished' ? ({ oui: true, non: false })[el.value] ?? null
            : f === 'rooms_checked' ? el.value
            : (el.value || null);
    guard(Store.patchListing(id, { [f]: v }), seen());
  });
  // Le texte tapé disparaissait sans un mot si on touchait le fond du panneau
  // ou la touche Échap. On enregistre en quittant le champ.
  host.querySelector('#myComment').onblur = e => {
    if (e.target.value === (mine?.comment || '')) return;
    guard(Store.saveOpinion({ listing_id: id, user_id: me, comment: e.target.value }), seen());
  };
  host.querySelector('#sharedNotes').onblur = e => {
    if (e.target.value === (r.notes || '')) return;
    guard(Store.patchListing(id, { notes: e.target.value }), seen());
  };
  host.querySelectorAll('[data-score]').forEach(b => b.onclick = () =>
    guard(Store.saveOpinion({ listing_id: id, user_id: me, score: +b.dataset.score }), seen()));
  host.querySelector('#btnComment').onclick = () =>
    guard(Store.saveOpinion({ listing_id: id, user_id: me, comment: host.querySelector('#myComment').value }),
          seen(() => toast('Avis enregistré')));
  host.querySelector('#btnNotes').onclick = () =>
    guard(Store.patchListing(id, { notes: host.querySelector('#sharedNotes').value }),
          seen(() => toast('Notes enregistrées')));
  host.querySelector('#btnEditThis').onclick = () => { closeModals(); openEditor(id); };
}

// ═══════════════════ FORMULAIRE ═══════════════════
function openEditor(id) {
  if (!anyModalOpen()) state.lastFocus = document.activeElement;
  state.editingId = id;
  // Toute extraction encore en vol appartient au formulaire précédent : sans
  // ce jeton, une réponse lente écrasait l'URL et les champs du logement
  // qu'on venait d'ouvrir avec les données de l'annonce d'avant.
  fetchToken++;
  const r = id ? Store.listings.find(x => x.id === id) : null;
  $('#editTitle').textContent = r ? 'Modifier le logement' : 'Ajouter un logement';
  $('#btnDelete').classList.toggle('hidden', !r);
  $('#fetchMsg').textContent = '';
  $('#fetchMsg').className = 'note';      // sinon la couleur du message précédent reste
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
  $('#fLessorType').value = r?.lessor_type || '';
  $('#fLessorName').value = r?.lessor_name || '';
  $('#fRoomsTotal').value = r?.rooms_total ?? '';
  $('#fRoomsChecked').value = r?.rooms_checked || '';
  $('#fUpfront').value = r?.upfront_cost ?? '';
  $('#fFurnished').value = r?.furnished == null ? '' : (r.furnished ? 'oui' : 'non');
  syncLessorField();
  $('#fPriceMode').value = 'total';
  showPriceHint();
  $('#editModal').classList.remove('hidden');
  lockScroll(true);
  setTimeout(() => $(r ? '#fTitle' : '#fUrl').focus(), 50);
}

/**
 * Certains sites affichent le loyer du logement entier, d'autres le prix
 * d'une chambre. On lève l'ambiguïté en montrant les deux montants avant
 * d'enregistrer.
 */
/** Le nom n'a de sens que pour une agence. */
function syncLessorField() {
  $('#lessorNameField').classList.toggle('hidden', $('#fLessorType').value !== 'agence');
}

function showPriceHint() {
  const v = parseFloat($('#fPrice').value);
  const h = $('#priceHint');
  if (!Number.isFinite(v) || v <= 0) { h.textContent = ''; h.className = 'note'; return; }
  const total = $('#fPriceMode').value === 'person' ? v * USERS.length : v;
  h.textContent = `${fmt(total)} € au total, soit ${fmt(Math.round(total / USERS.length))} € `
                + `par personne pour ${USERS.length} colocataires.`;
  h.className = 'note ok';
}

/** Identifie le formulaire courant : une réponse d'un formulaire abandonné est jetée. */
let fetchToken = 0;

/** Noms lisibles : l'utilisateur lisait « Trouvé : title, price, rooms ». */
const FIELD_FR = { title: 'le titre', price: 'le loyer', surface: 'la surface',
                   rooms: 'les chambres', city: 'la ville' };

/** « a, b et c » plutôt que « a, b, c ». */
const enumerate = list => list.length < 2 ? (list[0] || '')
  : list.slice(0, -1).join(', ') + ' et ' + list.at(-1);

async function doFetch() {
  const url = $('#fUrl').value.trim();
  if (!url) return;
  const mine = ++fetchToken;
  const msg = $('#fetchMsg');
  $('#btnFetch').disabled = true;
  msg.textContent = 'Lecture de l’annonce…'; msg.className = 'note';
  try {
    const d = await extractFromUrl(url);
    if (mine !== fetchToken) return;          // le formulaire a changé entre-temps
    $('#fUrl').value = d.url || normalizeUrl(url);
    const set = (sel, v) => { if (v != null && v !== '' && !$(sel).value) $(sel).value = v; };
    set('#fTitle', d.title); set('#fPrice', d.price); set('#fSurface', d.surface);
    set('#fRooms', d.rooms); set('#fCity', d.city);  set('#fImage', d.image_url);
    // Écrire .value par programmation ne déclenche pas « input » : sans cet
    // appel, l'indicateur restait vide et un loyer récupéré en mode « par
    // personne » partait multiplié par trois, en silence.
    showPriceHint();
    const got = ['title', 'price', 'surface', 'rooms', 'city']
      .filter(k => d[k] != null && d[k] !== '').map(k => FIELD_FR[k]);
    msg.textContent = got.length
      ? `Trouvé ${enumerate(got)}. Vérifiez et corrigez si besoin.`
      : 'Rien d’exploitable sur cette page. Remplissez les champs à la main.';
    msg.className = got.length ? 'note ok' : 'note warn';
  } catch (err) {
    if (mine !== fetchToken) return;
    // Toutes les causes aboutissaient au même message, qui accusait le site
    // d'un blocage même quand c'était le réseau ou un simple délai dépassé.
    msg.textContent = fetchError(err);
    msg.className = 'note warn';
  } finally { if (mine === fetchToken) $('#btnFetch').disabled = false; }
}

function fetchError(err) {
  const m = String(err?.message || err || '');
  if (err?.name === 'AbortError' || /aborted|timeout/i.test(m))
    return 'Le site met trop de temps à répondre. Réessayez, ou remplissez à la main.';
  if (/anti-robot|protégée/i.test(m))
    return 'Ce site bloque la lecture automatique (CAPTCHA). Remplissez les champs à la main, ça marche pareil.';
  if (/exploitable|vide/i.test(m))
    return 'Page lue, mais rien d’exploitable dedans. Remplissez les champs à la main.';
  if (/HTTP 4|HTTP 5/.test(m))
    return `Le lecteur de pages a répondu « ${m} ». Réessayez, ou remplissez à la main.`;
  if (/fetch|network/i.test(m))
    return 'Pas de réseau. Vérifiez votre connexion, ou remplissez à la main.';
  return 'Lecture impossible. Remplissez les champs à la main, ça marche pareil.';
}

function priceAsTotal() {
  const v = parseFloat($('#fPrice').value);
  if (!Number.isFinite(v)) return '';
  return $('#fPriceMode').value === 'person' ? v * USERS.length : v;
}

async function saveFromForm() {
  const cur = state.editingId ? Store.listings.find(x => x.id === state.editingId) : null;
  const btn = $('#btnSave');
  // En 3G, l'upsert puis le rechargement complet prennent plusieurs secondes,
  // pendant lesquelles le bouton semblait mort : un second appui créait un
  // second logement, avec un nouvel identifiant.
  if (btn.disabled) return;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Enregistrement…';
  try {
    const { row, isNew } = await Store.saveListing({
      ...(cur || {}),
      id: state.editingId || undefined,
      url: normalizeUrl($('#fUrl').value),
      title: $('#fTitle').value.trim() || 'Sans titre',
      // Toujours stocker ce que nous trois paierions au total.
      price: priceAsTotal(), surface: $('#fSurface').value, rooms: $('#fRooms').value,
      rooms_total: $('#fRoomsTotal').value,
      city: $('#fCity').value.trim(),
      status: $('#fStatus').value,
      contacted_by: $('#fContactedBy').value,
      visit_at: $('#fVisitAt').value || null,
      image_url: $('#fImage').value.trim(),
      notes: $('#fNotes').value,
      added_by: cur?.added_by || state.me || '',
      lessor_type: $('#fLessorType').value,
      lessor_name: $('#fLessorName').value.trim(),
      rooms_checked: $('#fRoomsChecked').value,
      upfront_cost: $('#fUpfront').value,
      furnished: ({ oui: true, non: false })[$('#fFurnished').value] ?? null,
    });
    touched(row.id);
    closeModals();
    toast(isNew ? 'Logement ajouté' : 'Modifications enregistrées');
  } catch (e) {
    console.error(e);
    toast(friendlyError(e), 6000);
  } finally { btn.disabled = false; btn.textContent = label; }
}

async function deleteCurrent() {
  if (!state.editingId) return;
  const r = Store.listings.find(x => x.id === state.editingId);
  const votes = Store.opinionsFor(state.editingId).length;
  // Le message taisait que la suppression emporte aussi les avis et les
  // notes des trois, en cascade et sans retour possible.
  const extra = votes
    ? `\n\nLes ${votes} avis et les notes partagées seront perdus, pour tout le monde.`
    : '\n\nLes notes partagées seront perdues, pour tout le monde.';
  if (!confirm(`Supprimer « ${r?.title || 'ce logement'} » ?${extra}`)) return;
  try {
    await Store.deleteListing(state.editingId);
    closeModals();
    toast('Logement supprimé');
  } catch (e) {
    console.error(e);
    toast('Suppression impossible. ' + friendlyError(e), 6000);
  }
}

function closeModals() {
  const was = anyModalOpen();
  $('#editModal').classList.add('hidden');
  $('#detail').classList.add('hidden');
  $('#detailCard').dataset.listing = '';
  renderedDrafts = {};
  state.detailId = null;
  lockScroll(false);
  // Sans restauration, l'utilisateur au clavier repartait du haut du document
  // à chaque fiche consultée.
  if (was && state.lastFocus?.isConnected) state.lastFocus.focus();
  state.lastFocus = null;
}

// ═══════════════════ UTILITAIRES ═══════════════════
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt = n => new Intl.NumberFormat('fr-FR').format(n);
/**
 * toLocaleDateString ne jette pas sur une date invalide, il renvoie
 * « Invalid Date » : l'ancien try/catch ne servait à rien et la carte
 * pouvait afficher « Visite le Invalid Date ».
 */
const dateFR = d => {
  const dt = dayStart(d);
  return Number.isNaN(dt.getTime()) ? ''
    : dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

let toastTimer;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
