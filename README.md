# 🏠 Kolok

Notre recherche de colocation, au même endroit. Fini les 200 liens perdus dans la conversation de groupe.

**Daruma · Hugoat · Batto**

---

## Ce que ça fait

- **Coller un lien** d'annonce → prix, surface, ville, photo et titre se remplissent tout seuls
- **Suivre l'avancement** : à contacter → contacté → en attente → visité → validé / refusé
- **Savoir qui a fait quoi** : qui a appelé, quand, quelle visite est prévue
- **Donner son avis** : chacun choisit entre « Coup de cœur », « Ça me va », « Bof » et « Non »,
  ajoute un commentaire, et tout le monde voit tout
- **Filtrer et trier** : par étape, loyer max par personne, avis du groupe, surface
- **Comparer** : un tableau avec tous les logements côte à côte (dont le €/m², la part par
  personne et le coût d'entrée)
- **Coller à nos critères** : meublé ou non, chambres vérifiées ou seulement annoncées,
  dans le secteur ou hors secteur
- **Optimisé pour le mobile** : conçu pour être utilisé dans le métro d'une main

---

## 1. Lancer le projet

Pas de `npm install`, pas de build. C'est du HTML/CSS/JS.

**Attention : double-cliquer sur `index.html` ne marche pas.** Le navigateur refuse de charger
des modules JS ouverts en `file://`. Il faut un mini serveur local :

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
appliqué, et les clés sont dans [`js/config.js`](js/config.js). La pastille au bout de la ligne
de résumé affiche `synchronisé` : les trois écrans se mettent à jour instantanément, sans
rechargement.

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
| Ajouter un logement | Bouton **Ajouter**, ou **coller un lien** n'importe où sur la page (ordinateur seulement) |
| Ouvrir la recherche | Touche `/` |
| Changer d'étape | Ouvrir la fiche → cliquer sur l'étape voulue |
| Dire ce qu'on en pense | Ouvrir la fiche → un des 4 boutons + commentaire |
| Comparer | Bouton **Tableau**, dans la barre de contrôles sous le résumé |
| Changer d'utilisateur | Pastille ronde en haut à droite |

**Sur mobile** : ouvrir le site puis « Ajouter à l'écran d'accueil » — il se comporte comme une app.

---

## 5. Structure

```
Projet-Kolok/
├── index.html            Structure de la page (une seule page)
├── assets/style.css      Tout le style
├── js/
│   ├── config.js         ⚙️ Les colocs, les étapes, nos critères, les clés Supabase
│   ├── store.js          Données : localStorage OU Supabase, même API
│   ├── extract.js        Lecture automatique des annonces (prix, surface, ville…)
│   ├── changes.js        « Qu'est-ce qui a bougé depuis ma dernière visite ? »
│   └── app.js            Rendu et interactions
├── test/extract.test.js  Tests des fonctions d'extraction — `node --test test/`
├── supabase/schema.sql   À exécuter dans Supabase (rejouable)
└── .nojekyll             Dit à GitHub Pages de servir les fichiers tels quels
```

**Pour personnaliser** (ajouter un coloc, renommer une étape, changer le quartier
visé, changer une couleur) : tout est dans `js/config.js`, c'est fait pour.

**Les tests** ne demandent rien à installer : `node --test test/`.

---

## 6. Ce qui a changé depuis la dernière visite

À trois sur la même liste, on ne sait plus qui a ajouté ou modifié quoi. L'app
s'en charge, sans rien demander :

- une ligne bleue sous le résumé annonce ce qui a bougé, **et par qui** ;
- les fiches concernées portent une pastille bleue ;
- **tout s'efface à mesure qu'on lit** : ouvrir une fiche la marque comme vue,
  et quand il n'en reste plus, la ligne disparaît d'elle-même ;
- vos propres modifications ne vous sont jamais annoncées ;
- « Voir » n'affiche que ce qui a bougé, « Tout vu » remet les compteurs à zéro.

C'est local à chaque appareil : ce que Batto a lu ne concerne pas Hugoat.

---

## 7. Sur l'extraction automatique

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

Quand ça échoue, un message orange dit précisément pourquoi (site protégé, délai dépassé, page
illisible, pas de réseau) et vous remplissez les quatre champs qui comptent — titre, loyer,
surface, ville — à la main, en une trentaine de secondes. **L'app ne bloque jamais sur un échec
d'extraction, et ne remplit jamais le formulaire avec des données douteuses** : une page
anti-robot est détectée et rejetée plutôt qu'interprétée.

---

## 8. Améliorations possibles plus tard

Par ordre de rapport utilité / effort :

1. **Carte** — les logements sur une carte Leaflet, avec le temps de trajet vers le boulot/la fac de chacun
2. **Notification Discord/Telegram** — un webhook quand quelqu'un ajoute un logement ou le passe en « validé »
3. **Checklist de visite** — questions à ne pas oublier (DPE, charges, dépôt de garantie, Internet, voisinage), cochables sur place
4. **Photos** — upload dans Supabase Storage plutôt qu'une seule URL
5. **Surface de sa chambre** — c'est le vrai chiffre qui décide en coloc, et il n'existe aujourd'hui que dans le texte des notes
6. **Prix par chambre** — à La Rouvière les trois chambres coûtent 560, 620 et 580 € : l'app affiche une moyenne de 587 € que personne ne paiera
7. **Import en masse** — coller 10 liens d'un coup depuis la conversation de groupe

---

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| Page blanche en ouvrant `index.html` | Ouvert en `file://` | Lancer `python -m http.server 8000` |
| Les autres ne voient pas mes logements | La pastille affiche `local` | Vérifier que `js/config.js` contient bien les 2 clés |
| Bandeau rouge « Connexion impossible » | Supabase injoignable | Ne rien ajouter tant qu'il est là : l'écriture resterait sur cet appareil. Bouton « Réessayer » |
| Tout s'affiche mais rien ne se synchronise | Clé `anon` au lieu de `publishable` | Voir l'avertissement du § 3 |
| « Ce site bloque la lecture automatique » | CAPTCHA ou mur anti-robot | Remplir les champs à la main |
| Rien ne s'affiche après le push | Pages pas encore déployé | Attendre 1-2 min, puis recharger avec `Ctrl+F5` |
| Après un push, l'ancienne version persiste | GitHub Pages met en cache les fichiers JS 10 min (`max-age=600`) | `Ctrl+F5`, ou attendre — vérifié : ça arrive vraiment |
