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

## 3. Mode partagé temps réel

✅ **C'est déjà fait, rien à faire.** Le projet Supabase `Projet-Kolok` est créé, le schéma
appliqué, et les clés sont dans [`js/config.js`](js/config.js). La pastille en haut à droite
affiche `☁️ partagé` : les trois écrans se synchronisent instantanément, sans rechargement.

### Si vous devez un jour refaire la configuration

1. Sur <https://supabase.com> → **New project** (région Europe).
2. **SQL Editor** → **New query** → coller [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   *(Le script est rejouable : le relancer ne casse rien.)*
3. **Settings → API Keys** → copier `Project URL` et la clé **`sb_publishable_…`**.
4. Les reporter dans [`js/config.js`](js/config.js), puis `git commit` + `git push`.

> ⚠️ **Prenez bien la clé `publishable`, pas l'ancienne clé `anon` JWT.** Vérifié le 06/08/2026
> sur ce projet : avec la clé `anon`, la lecture et l'écriture fonctionnent mais **aucun événement
> temps réel n'arrive** — les écrans cessent silencieusement de se synchroniser entre eux.

> **Sur la sécurité** : cette clé est publique par conception et le schéma autorise la
> lecture/écriture pour le groupe. La protection ici, c'est que l'URL du site n'est pas diffusée.
> Pour un outil à 3 personnes qui liste des annonces déjà publiques, c'est le bon compromis.
> Pour verrouiller davantage : activer l'auth Supabase (magic link) et remplacer `to anon` par
> `to authenticated` dans les policies du schéma.

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
| Les autres ne voient pas mes logements | La pastille affiche `💾 local` | Vérifier que `js/config.js` contient bien les 2 clés |
| Tout s'affiche mais rien ne se synchronise | Clé `anon` au lieu de `publishable` | Voir l'avertissement du § 3 |
| « Page illisible automatiquement » | Le site bloque les robots | Remplir les champs à la main |
| Rien ne s'affiche après le push | Pages pas encore déployé | Attendre 1-2 min, puis recharger avec `Ctrl+F5` |
