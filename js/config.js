// ─────────────────────────────────────────────────────────────
//  CONFIG — le seul fichier que vous aurez besoin de modifier
// ─────────────────────────────────────────────────────────────

// 1) Les colocataires. Ajoutez / renommez librement.
export const USERS = [
  { id: 'daruma', name: 'Daruma', emoji: '🐼', color: '#5b8cff' },
  { id: 'hugoat', name: 'Hugoat', emoji: '🐐', color: '#22c58b' },
  { id: 'batto',  name: 'Batto',  emoji: '🦇', color: '#c084fc' },
];

// 2) Supabase — mode PARTAGÉ temps réel. Videz ces deux lignes pour
//    revenir au mode local (données sur votre machine uniquement).
//
//    ⚠️ Utilisez bien la clé « publishable » (sb_publishable_…) et PAS
//    l'ancienne clé « anon » JWT : vérifié le 06/08/2026, l'ancienne lit
//    et écrit correctement mais ne reçoit AUCUN événement temps réel —
//    les écrans ne se synchronisent alors plus entre eux.
//    Cette clé est publique par conception, elle a sa place dans le dépôt.
export const SUPABASE_URL = 'https://rqgbxbfbskealrtbhjfg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_g_wjq-E07f8wdJjbY6ltYA_131zDpD2';

// 3) Statuts du pipeline de recherche. L'ordre = l'ordre d'affichage.
export const STATUSES = [
  { id: 'a_contacter', label: 'À contacter', short: 'À faire',   color: '#94a3b8' },
  { id: 'contacte',    label: 'Contacté',    short: 'Contacté',  color: '#5b8cff' },
  { id: 'attente',     label: 'En attente',  short: 'Attente',   color: '#f0b429' },
  { id: 'visite',      label: 'Visité',      short: 'Visité',    color: '#c084fc' },
  { id: 'valide',      label: 'Validé',      short: 'Validé',    color: '#22c58b' },
  { id: 'refuse',      label: 'Refusé',      short: 'Refusé',    color: '#f4577b' },
];

// 4) Échelle d'avis (score stocké de 1 à 4).
export const RATINGS = [
  { score: 4, emoji: '😍', label: 'Coup de cœur', color: '#22c58b' },
  { score: 3, emoji: '🙂', label: 'Ça me va',     color: '#8fd14f' },
  { score: 2, emoji: '😐', label: 'Bof',          color: '#f0b429' },
  { score: 1, emoji: '🚫', label: 'Non merci',    color: '#f4577b' },
];

export const statusById = id => STATUSES.find(s => s.id === id) || STATUSES[0];
export const userById   = id => USERS.find(u => u.id === id) || null;
export const ratingByScore = s => RATINGS.find(r => r.score === s) || null;
