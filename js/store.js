// ─────────────────────────────────────────────────────────────
//  STORE — une seule API, deux backends interchangeables.
//    • MODE LOCAL   : localStorage (aucune config, données perso)
//    • MODE PARTAGÉ : Supabase + temps réel (dès que config.js est rempli)
// ─────────────────────────────────────────────────────────────
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LS_KEY = 'kolok.data.v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
const now = () => new Date().toISOString();

export const Store = {
  mode: 'local',      // 'local' | 'cloud'
  /**
   * Vrai quand le mode partagé était CONFIGURÉ mais n'a pas pu démarrer.
   * À distinguer du mode local volontaire (clés vides dans config.js) :
   * dans ce cas-là, tout ce qu'on écrit reste sur cet appareil alors que
   * l'utilisateur croit écrire pour le groupe. L'app doit le crier.
   */
  degraded: false,
  /** Qui écrit. Renseigné par l'app dès qu'un colocataire est identifié. */
  actor: '',
  listings: [],
  opinions: [],
  _subs: [],
  /**
   * Colonnes réellement présentes dans la table distante, relevées au
   * premier chargement. Sans ce filtre, ajouter une colonne au schéma
   * local mais pas encore dans Supabase fait échouer TOUTES les écritures
   * avec « column ... does not exist ». L'app doit continuer à marcher
   * avant la migration, quitte à ignorer les champs récents.
   */
  _cols: null,

  /** S'abonner aux changements de données. */
  onChange(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; },
  _emit() { this._subs.forEach(f => f()); },

  // ── Initialisation ────────────────────────────────────────
  async init() {
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        this.sb = createClient(SUPABASE_URL, SUPABASE_KEY);
        await this._pull();
        this._listenRealtime();
        this.mode = 'cloud';
        return;
      } catch (err) {
        console.error('[Kolok] Supabase indisponible, repli en mode local.', err);
        // Sans ce nettoyage, this.sb reste défini alors que le mode est
        // « local » : or toutes les écritures testent this.sb. On écrivait
        // donc dans le cloud sans jamais l'écouter, et le premier _pull()
        // réussi effaçait de l'écran tout ce qui venait du localStorage.
        this.sb = null;
        this.degraded = true;
      }
    }
    this._readLocal();
    this.mode = 'local';
  },

  /** Nouvelle tentative de connexion, depuis le bandeau d'alerte. */
  async retry() {
    this.degraded = false;
    this.sb = null;
    await this.init();
    this._emit();
    return this.mode === 'cloud';
  },

  // ── Backend LOCAL ─────────────────────────────────────────
  _readLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      this.listings = raw.listings || [];
      this.opinions = raw.opinions || [];
    } catch { this.listings = []; this.opinions = []; }
  },
  _writeLocal() {
    // Safari en navigation privée et un quota plein jettent ici. Mieux vaut
    // une donnée non persistée qu'un gestionnaire de clic qui meurt.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ listings: this.listings, opinions: this.opinions }));
    } catch (err) {
      console.error('[Kolok] Écriture locale impossible.', err);
      throw new Error('Stockage local plein ou bloqué par le navigateur.');
    }
  },

  // ── Backend CLOUD ─────────────────────────────────────────
  /**
   * Les réponses hors d'usage sont écartées : deux _pull() peuvent être en
   * vol en même temps (une écriture + son propre événement temps réel), et
   * la plus ancienne écrasait parfois la plus récente — le statut qu'on
   * venait de changer revenait alors en arrière tout seul.
   */
  _pullSeq: 0,
  async _pull() {
    const seq = ++this._pullSeq;
    const [l, o] = await Promise.all([
      this.sb.from('listings').select('*'),
      this.sb.from('opinions').select('*'),
    ]);
    if (l.error) throw l.error;
    if (o.error) throw o.error;
    if (seq !== this._pullSeq) return;      // une réponse plus fraîche est déjà passée
    this.listings = l.data || [];
    this.opinions = o.data || [];
    if (this.listings.length) this._cols = new Set(Object.keys(this.listings[0]));
  },

  /** Retire les colonnes que la base distante ne connaît pas encore. */
  _fit(row) {
    if (!this._cols) return row;
    const out = {};
    for (const [k, v] of Object.entries(row)) if (this._cols.has(k)) out[k] = v;
    return out;
  },

  _listenRealtime() {
    this.sb.channel('kolok')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => this._refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opinions' }, () => this._refresh())
      .subscribe();
  },

  async _refresh() {
    // « ou » et non « et » : sans client Supabase il n'y a rien à recharger,
    // quel que soit le mode annoncé.
    if (this.mode !== 'cloud' || !this.sb) return;
    try { await this._pull(); this._emit(); } catch (e) { console.error(e); }
  },

  // ── Écritures : logements ─────────────────────────────────
  async saveListing(data) {
    const isNew = !data.id;
    const row = {
      id: data.id || uid(),
      url:          data.url          || '',
      title:        data.title        || 'Sans titre',
      price:        num(data.price),
      surface:      num(data.surface),
      rooms:        num(data.rooms),
      rooms_total:  num(data.rooms_total),
      city:         data.city         || '',
      image_url:    data.image_url    || '',
      status:       data.status       || 'a_contacter',
      notes:        data.notes        || '',
      added_by:     data.added_by     || '',
      lessor_type:  data.lessor_type  || '',
      lessor_name:  data.lessor_type === 'agence' ? (data.lessor_name || '') : '',
      furnished:     data.furnished == null || data.furnished === '' ? null : !!data.furnished,
      rooms_checked: data.rooms_checked || '',
      upfront_cost:  num(data.upfront_cost),
      contacted_by: data.contacted_by || '',
      contacted_at: data.contacted_at || null,
      visit_at:     data.visit_at     || null,
      created_at:   data.created_at   || now(),
      updated_at:   now(),
      updated_by:   this.actor || '',
    };
    // Horodatage automatique du premier contact.
    if (row.contacted_by && !row.contacted_at) row.contacted_at = now();
    if (!row.contacted_by) row.contacted_at = null;
    // Nommer quelqu'un, c'est dire que l'annonce a été contactée : la fiche
    // ne peut plus rester « à contacter ». Les étapes suivantes ne bougent pas.
    if (row.contacted_by && row.status === 'a_contacter') row.status = 'contacte';

    // Le même logement se retrouvait deux fois dans la liste, ajouté par
    // deux colocataires depuis le même lien — avec des avis contradictoires
    // sur ce qui était en réalité un seul bien. normalizeUrl produisait déjà
    // la clé de comparaison, plus personne ne s'en servait.
    if (row.url) {
      const dup = this.listings.find(x => x.url === row.url && x.id !== row.id);
      if (dup) throw new Error(`Déjà dans la liste, sous le titre « ${dup.title} ».`);
    }

    if (this.sb) {
      const { error } = await this.sb.from('listings').upsert(this._fit(row));
      if (error) throw error;
      await this._pull();
    } else {
      const i = this.listings.findIndex(x => x.id === row.id);
      if (i >= 0) this.listings[i] = row; else this.listings.push(row);
      this._writeLocal();
    }
    this._emit();
    return { row, isNew };
  },

  async deleteListing(id) {
    if (this.sb) {
      // Le schéma a « on delete cascade » : cet appel est une ceinture en
      // plus des bretelles, mais son échec doit remonter quand même.
      const op = await this.sb.from('opinions').delete().eq('listing_id', id);
      if (op.error) throw op.error;
      const { error } = await this.sb.from('listings').delete().eq('id', id);
      if (error) throw error;
      await this._pull();
    } else {
      this.listings = this.listings.filter(x => x.id !== id);
      this.opinions = this.opinions.filter(o => o.listing_id !== id);
      this._writeLocal();
    }
    this._emit();
  },

  /**
   * Modification partielle (boutons de statut, date de visite, notes).
   * N'envoie que les champs touchés, pour la même raison que saveOpinion :
   * deux modifications rapprochées ne doivent pas s'écraser.
   */
  async patchListing(id, patch) {
    const cur = this.listings.find(x => x.id === id);
    if (!cur) return;
    const row = { id, ...patch, updated_at: now(), updated_by: this.actor || '' };
    if ('contacted_by' in patch) {
      row.contacted_at = patch.contacted_by ? (cur.contacted_at || now()) : null;
      // Même règle que ci-dessus. On ne touche pas au statut s'il est déjà
      // plus avancé, ni s'il est modifié dans le même geste.
      if (patch.contacted_by && !('status' in patch) && cur.status === 'a_contacter') {
        row.status = 'contacte';
      }
    }
    // Repasser en « particulier » ne doit pas laisser traîner un nom d'agence.
    if ('lessor_type' in patch && patch.lessor_type !== 'agence') row.lessor_name = '';
    if (this.sb) {
      const { error } = await this.sb.from('listings').update(this._fit(row)).eq('id', id);
      if (error) throw error;
      await this._pull();
    } else {
      Object.assign(cur, row);
      this._writeLocal();
    }
    this._emit();
  },

  // ── Écritures : avis ──────────────────────────────────────
  /**
   * N'écrit QUE les champs réellement fournis. Sans ça, noter puis
   * commenter coup sur coup faisait disparaître la note : le second
   * enregistrement reconstruisait la ligne entière à partir de l'état
   * local, pas encore rafraîchi par le premier.
   */
  async saveOpinion({ listing_id, user_id, score, comment }) {
    const patch = { listing_id, user_id, updated_at: now() };
    if (score   !== undefined) patch.score   = score;
    if (comment !== undefined) patch.comment = comment;

    if (this.sb) {
      const { error } = await this.sb.from('opinions')
        .upsert(patch, { onConflict: 'listing_id,user_id' });
      if (error) throw error;
      await this._pull();
    } else {
      const i = this.opinions.findIndex(o => o.listing_id === listing_id && o.user_id === user_id);
      if (i >= 0) this.opinions[i] = { ...this.opinions[i], ...patch };
      else this.opinions.push({ score: null, comment: '', ...patch });
      this._writeLocal();
    }
    this._emit();
  },

  // ── Lectures dérivées ─────────────────────────────────────
  getOpinion(listingId, userId) {
    return this.opinions.find(o => o.listing_id === listingId && o.user_id === userId) || null;
  },
  opinionsFor(listingId) {
    return this.opinions.filter(o => o.listing_id === listingId);
  },
  /** Moyenne des scores (1-4), ou null si personne n'a voté. */
  avgScore(listingId) {
    const s = this._scores(listingId);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  },
  /**
   * Combien de personnes ont voté. Une note de 4 sur un seul avis n'a pas
   * le même poids qu'un 4 à l'unanimité : le tri les mettait à égalité.
   */
  voteCount(listingId) { return this._scores(listingId).length; },
  _scores(listingId) {
    return this.opinionsFor(listingId).map(o => o.score).filter(v => v != null);
  },

};

function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
