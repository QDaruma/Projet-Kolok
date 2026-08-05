// ─────────────────────────────────────────────────────────────
//  CONFIG — le seul fichier que vous aurez besoin de modifier
// ─────────────────────────────────────────────────────────────

// 1) Les colocataires. « initial » sert de pastille dans l'interface.
export const USERS = [
  { id: 'daruma', name: 'Daruma', initial: 'D', color: '#B5532E' },
  { id: 'hugoat', name: 'Hugoat', initial: 'H', color: '#2C7A7B' },
  { id: 'batto',  name: 'Batto',  initial: 'B', color: '#6B4EA8' },
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

// 3) Les étapes de la recherche, dans l'ordre. La couleur est le seul
//    système coloré de l'interface : elle doit rester lisible sur fond
//    clair comme sur fond sombre.
export const STATUSES = [
  { id: 'a_contacter', label: 'À contacter', short: 'À contacter', color: '#7C8598' },
  { id: 'contacte',    label: 'Contacté',    short: 'Contacté',    color: '#3D6FD6' },
  { id: 'attente',     label: 'En attente',  short: 'En attente',  color: '#A8761C' },
  { id: 'visite',      label: 'Visité',      short: 'Visité',      color: '#7C51C4' },
  { id: 'valide',      label: 'Validé',      short: 'Validé',      color: '#1E8A5C' },
  { id: 'refuse',      label: 'Refusé',      short: 'Refusé',      color: '#C0483F' },
];

// 4) Échelle d'avis : une vraie gradation vert → rouge, sans emoji.
export const RATINGS = [
  { score: 4, label: 'Coup de cœur', color: '#1E8A5C' },
  { score: 3, label: 'Ça me va',     color: '#6E9440' },
  { score: 2, label: 'Bof',          color: '#A8761C' },
  { score: 1, label: 'Non',          color: '#C0483F' },
];

// 5) Qui loue : utile pour savoir à qui on parle et repérer les agences
//    qu'on a déjà au téléphone.
export const LESSORS = [
  { id: 'particulier', label: 'Particulier', icon: 'person' },
  { id: 'agence',      label: 'Agence',      icon: 'building' },
];

export const lessorById    = id => LESSORS.find(l => l.id === id) || null;
export const statusById    = id => STATUSES.find(s => s.id === id) || STATUSES[0];
export const userById      = id => USERS.find(u => u.id === id) || null;
export const ratingByScore = s  => RATINGS.find(r => r.score === s) || null;
