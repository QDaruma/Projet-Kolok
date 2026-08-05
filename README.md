# 🏠 Kolok

Notre recherche de colocation, au même endroit. Fini les 200 liens perdus dans la conversation de groupe.

**Daruma · Hugoat · Batto**

---

## Ce que ça fait

- **Coller un lien** d'annonce → prix, surface, ville, photo et titre se remplissent tout seuls
- **Suivre l'avancement** : à contacter → contacté → en attente → visité → validé / refusé
- **Savoir qui a fait quoi** : qui a appelé, quand, quelle visite est prévue
- **Donner son avis** : chacun met 😍 / 🙂 / 😐 / 🚫 + un commentaire, tout le monde voit tout
- **Filtrer et trier** : par statut, prix max, meilleure note, surface
- **Comparer** : un tableau avec tous les logements côte à côte (dont le €/m² et la part par personne)
- **Mobile-friendly** : conçu pour être utilisé dans le métro d'une main

---

## 1. Lancer le projet

Pas de `npm install`, pas de build. C'est du HTML/CSS/JS.

**Le plus simple — double-cliquer sur `index.html`** ne marchera pas (le navigateur bloque les
modules JS ouverts en `file://`). Il faut un mini serveur local :

```bash
# Python (déjà installé sur la plupart des machines)
python -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

Autres options équivalentes : `npx serve`, ou l'extension **Live Server** de VS Code.

---

## 2. Mettre en ligne (GitHub Pages) — 2 minutes

```bash
git remote add origin git@github.com:QDaruma/Projet-Kolok.git
git branch -M main
git push -u origin main
```

Puis sur GitHub : **Settings → Pages → Source : `Deploy from a branch` → Branch : `main` / `/ (root)` → Save**.

Le site est en ligne ~1 minute plus tard sur
`https://qdaruma.github.io/Projet-Kolok/`.

---

## 3. Passer en mode partagé (important) — 5 minutes

Par défaut l'app tourne en **mode local** : les données restent dans le navigateur de chacun,
donc vous ne voyez pas les logements des autres. Pour partager en temps réel :

1. Créer un compte gratuit sur <https://supabase.com> → **New project** (choisir la région Europe).
2. Dans le menu de gauche : **SQL Editor** → **New query** → coller tout le contenu de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. Menu **Settings → API**, copier :
   - `Project URL`
   - la clé `anon` `public`
4. Ouvrir [`js/config.js`](js/config.js) et remplir :
   ```js
   export const SUPABASE_URL = 'https://xxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGci...';
   ```
5. `git add . && git commit -m "Config Supabase" && git push`

La pastille en haut à droite passe de `💾 local` à `☁️ partagé`. Les trois écrans se
synchronisent alors instantanément.

> **Sur la clé `anon`** : elle est publique par conception et le schéma autorise la lecture/écriture
> pour le groupe. La protection ici, c'est que l'URL du site n'est pas diffusée. Pour un outil
> à 3 personnes qui liste des annonces déjà publiques, c'est le bon compromis. Si vous voulez
> verrouiller : activez l'auth Supabase (magic link) et remplacez `to anon` par `to authenticated`
> dans les policies du schéma.

---

## 4. Utilisation quotidienne

| Action | Comment |
|---|---|
| Ajouter un logement | Bouton **Ajouter**, ou **coller un lien** n'importe où sur la page |
| Ouvrir la recherche | Touche `/` |
| Changer un statut | Ouvrir la fiche → cliquer sur l'étape voulue |
| Dire ce qu'on en pense | Ouvrir la fiche → un des 4 boutons + commentaire |
| Comparer | Bouton **⇄ Comparer** en haut à droite |
| Changer d'utilisateur | Pastille ronde en haut à droite |

**Sur mobile** : ouvrir le site puis « Ajouter à l'écran d'accueil » — il se comporte comme une app.

---

## 5. Structure

```
Projet-Kolok/
├── index.html            Structure de la page (une seule page)
├── assets/style.css      Tout le style
├── js/
│   ├── config.js         ⚙️ Les colocs, les statuts, les clés Supabase — le seul fichier à éditer
│   ├── store.js          Données : localStorage OU Supabase, même API
│   ├── extract.js        Lecture automatique des annonces (prix, surface, ville…)
│   └── app.js            Rendu et interactions
├── supabase/schema.sql   À exécuter une fois dans Supabase
└── .nojekyll             Dit à GitHub Pages de servir les fichiers tels quels
```

**Pour personnaliser** (ajouter un coloc, renommer un statut, changer une couleur) :
tout est dans `js/config.js`, c'est fait pour.

---

## 6. Sur l'extraction automatique

Un navigateur ne peut pas lire une page d'un autre site (sécurité CORS). L'app passe donc par un
lecteur public (`r.jina.ai`, puis `allorigins` en secours) qui renvoie la page en texte, et devine
prix / surface / chambres / ville par motifs.

Résultats mesurés le 06/08/2026 (ça peut évoluer, les sites changent leurs protections) :

| Site | Résultat |
|---|---|
| SeLoger, Bien'ici | ✅ fiable |
| La Carte des Colocs, Appartager | ✅ fiable |
| Leboncoin | 🟡 irrégulier (passe environ une fois sur deux) |
| PAP, Logic-Immo | ❌ bloqué (CAPTCHA Cloudflare) |
| Facebook Marketplace | ❌ bloqué (connexion requise) |

Quand ça échoue, un message orange le dit clairement et vous remplissez les 3 champs à la main
(15 secondes). **L'app ne bloque jamais sur un échec d'extraction, et ne remplit jamais le
formulaire avec des données douteuses** : une page anti-robot est détectée et rejetée plutôt
qu'interprétée.

---

## 7. Améliorations possibles plus tard

Par ordre de rapport utilité / effort :

1. **Carte** — les logements sur une carte Leaflet, avec le temps de trajet vers le boulot/la fac de chacun
2. **Notification Discord/Telegram** — un webhook quand quelqu'un ajoute un logement ou le passe en « validé »
3. **Checklist de visite** — questions à ne pas oublier (DPE, charges, dépôt, internet, voisinage), cochables sur place
4. **Photos** — upload dans Supabase Storage plutôt qu'une seule URL
5. **Budget** — un curseur « on veut max X € par personne » qui grise tout ce qui dépasse
6. **Historique** — voir qui a changé quoi et quand
7. **Import en masse** — coller 10 liens d'un coup depuis la conversation de groupe

---

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| Page blanche en ouvrant `index.html` | Ouvert en `file://` | Lancer `python -m http.server 8000` |
| Les autres ne voient pas mes logements | Mode local | Faire l'étape 3 (Supabase) |
| « Page illisible automatiquement » | Le site bloque les robots | Remplir les champs à la main |
| Rien ne s'affiche après le push | Pages pas encore déployé | Attendre 1-2 min, puis recharger avec `Ctrl+F5` |
