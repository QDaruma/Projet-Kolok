// ─────────────────────────────────────────────────────────────
//  CHANGES — « qu'est-ce qui a bougé depuis la dernière fois ? »
//
//  Parti pris : rien à éplucher. Pas de journal, pas de notification.
//  Les fiches qui ont bougé portent une pastille, une ligne les résume,
//  et TOUT S'EFFACE À MESURE QU'ON LIT. Ouvrir une fiche la marque comme
//  vue ; quand il n'en reste plus, la ligne disparaît d'elle-même.
//
//  Entièrement local à l'appareil : rien de tout ça n'est partagé, parce
//  que « vu » n'a de sens que pour la personne qui regarde.
// ─────────────────────────────────────────────────────────────

const KEY = me => `kolok.seen.${me || 'anon'}`;

/**
 * État de lecture d'une personne.
 *   since : date de référence, avancée seulement sur « Tout vu »
 *   seen  : par fiche, la date de modification déjà consultée
 */
export function loadSeen(me) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(me)) || '{}');
    return { since: raw.since || null, seen: raw.seen || {} };
  } catch { return { since: null, seen: {} }; }
}

export function saveSeen(me, st) {
  try { localStorage.setItem(KEY(me), JSON.stringify(st)); } catch { /* stockage bloqué */ }
}

/**
 * Premier passage : on ne va pas annoncer que les 11 fiches existantes sont
 * « nouvelles ». On prend l'instant présent comme point de départ.
 */
export function initSeen(me, st) {
  if (!st.since) { st.since = new Date().toISOString(); saveSeen(me, st); }
  return st;
}

const t = v => (v ? Date.parse(v) || 0 : 0);

/**
 * Ce qui a changé sur une fiche depuis que cette personne l'a vue.
 * Renvoie null s'il n'y a rien à signaler.
 *
 * Ses propres modifications ne comptent pas : on sait ce qu'on vient de
 * faire, et se le voir annoncer serait exactement le genre de bruit que
 * cette fonctionnalité doit éviter.
 */
export function changeOf(r, opinions, me, st) {
  const floor = Math.max(t(st.since), t(st.seen[r.id]));
  if (!floor) return null;

  if (t(r.created_at) > floor && r.added_by !== me) {
    return { kind: 'new', by: r.added_by, at: r.created_at };
  }

  const mine = o => o.user_id === me;
  const fresh = opinions.filter(o => t(o.updated_at) > floor && !mine(o));
  const edited = t(r.updated_at) > floor && r.updated_by !== me
                 && t(r.updated_at) > t(r.created_at) + 1000;

  if (edited && fresh.length) return { kind: 'both', by: r.updated_by, at: r.updated_at, votes: fresh };
  if (edited)      return { kind: 'edit',    by: r.updated_by, at: r.updated_at };
  if (fresh.length) return { kind: 'opinion', by: fresh.at(-1).user_id, at: fresh.at(-1).updated_at, votes: fresh };
  return null;
}

/** Marque une fiche comme lue, à l'ouverture. */
export function markSeen(me, st, r) {
  if (!r) return st;
  const stamp = [r.updated_at, r.created_at].filter(Boolean).sort().at(-1) || new Date().toISOString();
  st.seen[r.id] = new Date(Math.max(t(stamp), Date.now())).toISOString();
  saveSeen(me, st);
  return st;
}

/** « Tout vu » : on repart de maintenant et on oublie le détail. */
export function markAllSeen(me, st) {
  st.since = new Date().toISOString();
  st.seen = {};
  saveSeen(me, st);
  return st;
}
