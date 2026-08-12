// ─────────────────────────────────────────────────────────────
//  EXTRACT — devine prix / surface / ville / photo depuis une URL.
//
//  Un navigateur ne peut pas lire une page d'un autre domaine (CORS).
//  On passe donc par un « proxy lecteur » public qui renvoie la page
//  en texte. Si ça échoue, l'utilisateur remplit à la main : le
//  formulaire reste utilisable, on ne bloque jamais.
// ─────────────────────────────────────────────────────────────

const PROXIES = [
  url => ({ endpoint: 'https://r.jina.ai/' + url, kind: 'text' }),
  url => ({ endpoint: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url), kind: 'html' }),
];

export async function extractFromUrl(url) {
  const clean = normalizeUrl(url);
  let lastErr = null;

  for (const build of PROXIES) {
    const { endpoint, kind } = build(clean);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(endpoint, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.text();
      if (!body || body.length < 40) throw new Error('Réponse vide');
      // Les sites protégés répondent 200 avec une page « Just a moment… ».
      // Sans ce garde-fou on remplirait le formulaire avec du vide.
      if (looksBlocked(body)) throw new Error('Page protégée (anti-robot)');
      const found = kind === 'html' ? parseHtml(body) : parseText(body);
      if (!isUseful(found)) throw new Error('Rien d\'exploitable');
      found.url = clean;
      if (!found.city) found.city = cityFromUrl(clean);
      return found;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Extraction impossible');
}

// ── Détection des murs anti-robot ────────────────────────────
const BLOCK_SIGNS = [
  /just a moment/i, /performing security verification/i, /requiring captcha/i,
  /enable javascript and cookies to continue/i, /attention required/i,
  /access denied/i, /vous avez été bloqué/i, /unusual traffic/i,
  /checking your browser/i, /are you a robot/i, /datadome/i, /px-captcha/i,
];
function looksBlocked(body) {
  const head = body.slice(0, 4000);
  return BLOCK_SIGNS.some(re => re.test(head));
}

/** On n'accepte un résultat que s'il contient au moins un vrai fait. */
function isUseful(f) {
  return f.price != null || f.surface != null || f.rooms != null
      || (f.title && f.title.length > 12);
}

// ── Parsing du markdown renvoyé par r.jina.ai ────────────────
export function parseText(body) {
  const out = {};
  const title = body.match(/^Title:\s*(.+)$/m);
  if (title) out.title = cleanTitle(title[1]);

  const img = body.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+\.(?:jpe?g|png|webp)[^\s)]*)\)/i);
  if (img && !/logo|favicon|sprite|placeholder/i.test(img[1])) out.image_url = img[1];

  Object.assign(out, sniffNumbers(body));
  preferTitleFigures(out);
  return out;
}

/**
 * Le corps d'une page d'annonce contient souvent les biens « similaires »,
 * dont les surfaces polluent la détection. Le titre ne décrit que l'annonce
 * affichée : sa surface prime.
 *
 * La surface seulement : dans un titre, « 4 pièces » ou « T3 » compte les
 * pièces totales, alors que le « 3 chambres » du corps compte les chambres —
 * et c'est le nombre de chambres qui nous intéresse pour une colocation.
 */
function preferTitleFigures(out) {
  if (!out.title) return;
  const t = sniffNumbers(out.title);
  if (t.surface != null) out.surface = t.surface;
  // Idem pour la ville : le corps de page contient pieds de page, agences et
  // autres villes — SeLoger renvoyait « MILANO (20124) » pour une annonce
  // marseillaise. Le titre, lui, situe l'annonce affichée.
  if (t.city) out.city = t.city;
}

// ── Parsing du HTML brut (fallback allorigins) ───────────────
export function parseHtml(html) {
  const out = {};
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
    const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
    return (html.match(re) || html.match(alt) || [])[1] || null;
  };
  out.title = cleanTitle(meta('og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '');
  const im = meta('og:image');
  if (im && !/logo|favicon|sprite|placeholder/i.test(im)) out.image_url = im;

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ');
  Object.assign(out, sniffNumbers(text + ' ' + (meta('og:description') || '')));
  preferTitleFigures(out);
  return out;
}

// ── Heuristiques chiffrées, communes aux deux parseurs ───────
function sniffNumbers(text) {
  const out = {};
  const t = text.replace(/[   ]/g, ' ');

  // Prix : on garde le montant en euros le plus plausible pour un loyer.
  const prices = [...t.matchAll(/(\d{1,3}(?:[ .]\d{3})*|\d{3,5})\s*(?:€|EUR\b|euros?\b)/gi)]
    .map(m => parseInt(m[1].replace(/[ .]/g, ''), 10))
    .filter(n => n >= 200 && n <= 6000);
  if (prices.length) out.price = mostFrequent(prices);

  // Surface.
  const surf = [...t.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m²|m2|m\^2|mètres? carrés?)/gi)]
    .map(m => parseFloat(m[1].replace(',', '.')))
    .filter(n => n >= 8 && n <= 500);
  if (surf.length) out.surface = Math.max(...surf);

  // Chambres. Le champ visé compte les CHAMBRES, pas les pièces : un T3
  // annonce 3 pièces principales, donc 2 chambres et un séjour. Reporter
  // « T3 » tel quel donnait « 3 chambres » pour un logement qui en a deux.
  const ch = t.match(/(\d{1,2})\s*chambres?/i);
  const pi = t.match(/(\d{1,2})\s*(?:pièces?|pieces?)/i) || t.match(/\bT(\d)\b/i);
  const rooms = ch ? +ch[1] : (pi ? +pi[1] - 1 : null);
  if (rooms && rooms > 0 && rooms < 15) out.rooms = rooms;

  // Ville : « 13009 Marseille 9e » ou « Marseille (13009) ».
  const c1 = t.match(/\b(\d{5})\s+([A-ZÀ-Ÿ][\wÀ-ÿ'’ -]{2,40})/);
  const c2 = t.match(/([A-ZÀ-Ÿ][\wÀ-ÿ'’ -]{2,40})\s*\(?\b(\d{5})\b\)?/);
  const city = (c1 && cleanCity(c1[2], c1[1])) || (c2 && cleanCity(c2[1], c2[2])) || null;
  if (city) out.city = city;

  return out;
}

// Mots qui trahissent un bout de phrase capturé au lieu d'un nom de ville.
const HARD_STOP = /^(partir|prix|annonces?|louer|louez|vente|location|markdown|content|title|url|source|environ|charges|honoraires|surface|loyer|min|max|total|mois|resultats?|résultats?|immobilier|appartements?|maisons?|studios?|colocations?|toutes?|tous|pour|par|avec|dans|est|sont|neuf|ancien)$/i;

// Connecteurs : légitimes DANS un nom (Aix-en-Provence, Le Havre, Bourg de Péage)
// mais seulement s'ils sont suivis d'un mot capitalisé.
const CONNECTOR = /^(le|la|les|l|de|du|des|d|en|et|a|à|au|aux|sur|sous|lès|sainte?)$/i;

const isCityWord = w => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(w);
const isArrdt    = w => /^\d{1,2}(?:e|er|ere|ère|eme|ème)?$/i.test(w);

/**
 * Ne garde que le début plausible d'un nom de ville.
 * « Lyon 4e » et « Aix en Provence » passent,
 * « Lyon À partir de 754 » devient « Lyon », « Markdown Content » est rejeté.
 */
function cleanCity(raw, cp) {
  const words = raw.replace(/\s+/g, ' ').trim().split(' ');
  const kept = [];

  for (let i = 0; i < words.length && kept.length < 5; i++) {
    const w = words[i];
    if (isArrdt(w)) { kept.push(w); continue; }
    if (!isCityWord(w) || HARD_STOP.test(w)) break;

    if (CONNECTOR.test(w)) {
      const next = words[i + 1];
      const nextIsName = next && isCityWord(next) && !HARD_STOP.test(next)
        && !CONNECTOR.test(next) && /^[A-ZÀ-Ÿ]/.test(next);
      if (!nextIsName) break;      // connecteur orphelin → on s'arrête avant
    }
    kept.push(w);
  }

  while (kept.length && CONNECTOR.test(kept.at(-1))) kept.pop();
  if (!kept.length || !/^[A-ZÀ-Ÿ]/.test(kept[0])) return null;
  return `${kept.join(' ')} (${cp})`;
}

// ── Utilitaires ──────────────────────────────────────────────
function mostFrequent(arr) {
  const count = new Map();
  arr.forEach(n => count.set(n, (count.get(n) || 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function cleanTitle(s) {
  return (s || '').replace(/\s+/g, ' ')
    .replace(/\s*[-|–—]\s*(leboncoin|seloger|pap\.fr|logic-immo|bienici|facebook|marketplace).*$/i, '')
    .trim().slice(0, 120);
}

/** Beaucoup d'annonces ont la ville dans le slug de l'URL. */
function cityFromUrl(u) {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean);
    for (const s of seg) {
      const m = s.match(/([a-zà-ÿ-]{3,25})[-_](\d{5})/i);
      if (m) return `${cap(m[1].replace(/-/g, ' '))} (${m[2]})`;
    }
  } catch { /* ignoré */ }
  return '';
}
const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());

/**
 * Clé de comparaison entre deux liens. On ne garde que le domaine et le
 * chemin : les portails ajoutent au lien copié depuis une liste de
 * résultats une ribambelle de paramètres (`?serp_view=…&search=…`) qui
 * changent d'une copie à l'autre pour une seule et même annonce.
 * Le « www. » et la barre finale sautent aussi.
 *
 * Volontairement plus large que l'égalité stricte : mieux vaut prévenir
 * d'un doublon possible que de laisser entrer deux fois le même logement.
 */
export function urlKey(u) {
  const s = normalizeUrl(u);
  if (!s) return '';
  try {
    const { host, pathname } = new URL(s);
    return host.replace(/^www\./i, '').toLowerCase()
         + pathname.replace(/\/+$/, '').toLowerCase();
  } catch { return s.toLowerCase(); }
}

export function normalizeUrl(u) {
  let s = (u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const url = new URL(s);
    // Retire les traceurs pour que deux partages du même lien soient identiques.
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid']
      .forEach(p => url.searchParams.delete(p));
    return url.toString();
  } catch { return s; }
}
