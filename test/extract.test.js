// Tests des fonctions pures d'extraction.
//   node --test test/
// Aucune dépendance : le projet reste « pas de npm install ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText, parseHtml, normalizeUrl } from '../js/extract.js';

// ── normalizeUrl ─────────────────────────────────────────────
test('normalizeUrl ajoute le schéma manquant', () => {
  assert.equal(normalizeUrl('seloger.com/a/1'), 'https://seloger.com/a/1');
});

test('normalizeUrl retire les traceurs mais garde le reste', () => {
  const u = normalizeUrl('https://x.fr/a?utm_source=mail&id=7&fbclid=zz');
  assert.ok(u.includes('id=7'));
  assert.ok(!u.includes('utm_source'));
  assert.ok(!u.includes('fbclid'));
});

test('normalizeUrl laisse passer une saisie non analysable sans planter', () => {
  assert.equal(normalizeUrl(''), '');
  assert.equal(normalizeUrl('   '), '');
});

// ── Prix ─────────────────────────────────────────────────────
test('le prix le plus fréquent gagne sur les prix parasites', () => {
  const r = parseText('Title: Coloc\n\n950 € par mois. 950 € charges comprises. 30 € de frais.');
  assert.equal(r.price, 950);
});

test('les montants hors plage de loyer sont ignorés', () => {
  const r = parseText('Title: Coloc\n\nDépôt 150 €. Achat 250000 €. Loyer 800 €.');
  assert.equal(r.price, 800);
});

test('les prix écrits avec une espace de milliers sont lus', () => {
  const r = parseText('Title: Grand T4\n\nLoyer 1 450 € charges comprises');
  assert.equal(r.price, 1450);
});

// ── Surface ──────────────────────────────────────────────────
test('la surface du titre prime sur celle du corps', () => {
  const r = parseText('Title: T4 de 82 m² à Marseille\n\nBiens similaires : 45 m², 60 m²');
  assert.equal(r.surface, 82);
});

test('la surface décimale est lue avec la virgule', () => {
  const r = parseText('Title: Studio\n\nSurface 66,9 m² habitables');
  assert.equal(r.surface, 66.9);
});

// ── Chambres ─────────────────────────────────────────────────
test('« chambres » prime sur « pièces »', () => {
  const r = parseText('Title: Appartement\n\nT4, 4 pièces, 3 chambres');
  assert.equal(r.rooms, 3);
});

test('à défaut de chambres, les pièces sont converties (T4 = 3 chambres)', () => {
  const r = parseText('Title: Appartement\n\nBel appartement 4 pièces lumineux');
  assert.equal(r.rooms, 3);
});

test('un T3 vaut 2 chambres, pas 3', () => {
  const r = parseText('Title: Joli T3\n\nSéjour, cuisine, salle de bains');
  assert.equal(r.rooms, 2);
});

test('un studio ne remplit pas le champ chambres', () => {
  const r = parseText('Title: Studio\n\nT1 de 25 m², 500 € par mois');
  assert.equal(r.rooms, undefined);
});

// ── Ville ────────────────────────────────────────────────────
test('la ville est reconstituée avec son code postal', () => {
  const r = parseText('Title: Coloc\n\nSituée à Marseille (13009), proche métro');
  assert.match(r.city, /Marseille.*13009/);
});

test('une amorce de phrase n’est pas prise pour une ville', () => {
  const r = parseText('Title: Coloc\n\n13009 Annonces immobilières à louer');
  if (r.city) assert.doesNotMatch(r.city, /^Annonces/i);
});

test('les noms composés survivent au nettoyage', () => {
  const r = parseText('Title: Maison\n\nAix-en-Provence (13100) centre');
  assert.match(r.city, /Aix-en-Provence/);
});

// ── Titre ────────────────────────────────────────────────────
test('le suffixe du portail est retiré du titre', () => {
  const r = parseText('Title: T3 lumineux — SeLoger\n\n900 € 60 m²');
  assert.equal(r.title, 'T3 lumineux');
});

// ── HTML ─────────────────────────────────────────────────────
test('parseHtml lit les balises Open Graph', () => {
  const html = `<html><head>
    <meta property="og:title" content="T4 meublé 70 m²">
    <meta property="og:image" content="https://x.fr/photo.jpg">
    </head><body><p>Loyer 1 200 € pour 3 chambres</p></body></html>`;
  const r = parseHtml(html);
  assert.equal(r.title, 'T4 meublé 70 m²');
  assert.equal(r.image_url, 'https://x.fr/photo.jpg');
  assert.equal(r.price, 1200);
  assert.equal(r.rooms, 3);
});

test('parseHtml écarte un logo pris pour une photo', () => {
  const html = `<meta property="og:image" content="https://x.fr/logo.png">`;
  assert.equal(parseHtml(html).image_url, undefined);
});

test('parseHtml ne se noie pas dans le script et le style', () => {
  const html = `<html><head><title>T2</title>
    <script>var p = "9999 €"; var s = "400 m²";</script>
    <style>.a{content:"1 m²"}</style></head>
    <body>Loyer 700 € — 35 m²</body></html>`;
  const r = parseHtml(html);
  assert.equal(r.price, 700);
  assert.equal(r.surface, 35);
});
