// ─────────────────────────────────────────────────────────────
//  CONFIG — le seul fichier que vous aurez besoin de modifier
// ─────────────────────────────────────────────────────────────

// 1) Les colocataires. Ajoutez / renommez librement.
export const USERS = [
  { id: 'daruma', name: 'Daruma', emoji: '🐼', color: '#5b8cff' },
  { id: 'hugoat', name: 'Hugoat', emoji: '🐐', color: '#22c58b' },
  { id: 'batto',  name: 'Batto',  emoji: '🦇', color: '#c084fc' },
];

// 2) Supabase — laissez vide pour rester en MODE LOCAL (données sur votre
//    machine uniquement). Remplissez pour passer en MODE PARTAGÉ temps réel.
//    Voir README.md § "Passer en mode partagé" (5 minutes).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

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
