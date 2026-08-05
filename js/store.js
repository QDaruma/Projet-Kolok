// ─────────────────────────────────────────────────────────────
//  STORE — une seule API, deux backends interchangeables.
//    • MODE LOCAL   : localStorage (aucune config, données perso)
//    • MODE PARTAGÉ : Supabase + temps réel (dès que config.js est rempli)
// ─────────────────────────────────────────────────────────────
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS_KEY = 'kolok.data.v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
const now = () => new Date().toISOString();

export const Store = {
  mode: 'local',      // 'local' | 'cloud'
  listings: [],
  opinions: [],
  _subs: [],

  /** S'abonner aux changements de données. */
  onChange(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; },
  _emit() { this._subs.forEach(f => f()); },

  // ── Initialisation ────────────────────────────────────────
  async init() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        await this._pull();
        this._listenRealtime();
        this.mode = 'cloud';
        return;
      } catch (err) {
        console.error('[Kolok] Supabase indisponible, repli en mode local.', err);
      }
    }
    this._readLocal();
    this.mode = 'local';
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
    localStorage.setItem(LS_KEY, JSON.stringify({ listings: this.listings, opinions: this.opinions }));
  },

  // ── Backend CLOUD ─────────────────────────────────────────
  async _pull() {
    const [l, o] = await Promise.all([
      this.sb.from('listings').select('*'),
      this.sb.from('opinions').select('*'),
    ]);
    if (l.error) throw l.error;
    if (o.error) throw o.error;
    this.listings = l.data || [];
    this.opinions = o.data || [];
  },

  _listenRealtime() {
    this.sb.channel('kolok')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => this._refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opinions' }, () => this._refresh())
      .subscribe();
  },

  async _refresh() {
    if (this.mode !== 'cloud' && !this.sb) return;
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
      city:         data.city         || '',
      image_url:    data.image_url    || '',
      status:       data.status       || 'a_contacter',
      notes:        data.notes        || '',
      added_by:     data.added_by     || '',
      contacted_by: data.contacted_by || '',
      contacted_at: data.contacted_at || null,
      visit_at:     data.visit_at     || null,
      created_at:   data.created_at   || now(),
      updated_at:   now(),
    };
    // Horodatage automatique du premier contact.
    if (row.contacted_by && !row.contacted_at) row.contacted_at = now();
    if (!row.contacted_by) row.contacted_at = null;

    if (this.sb) {
      const { error } = await this.sb.from('listings').upsert(row);
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
      await this.sb.from('opinions').delete().eq('listing_id', id);
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

  /** Raccourci utilisé par les boutons rapides des cartes. */
  async patchListing(id, patch) {
    const cur = this.listings.find(x => x.id === id);
    if (!cur) return;
    return this.saveListing({ ...cur, ...patch });
  },

  // ── Écritures : avis ──────────────────────────────────────
  async saveOpinion({ listing_id, user_id, score, comment }) {
    const prev = this.getOpinion(listing_id, user_id);
    const row = {
      id: prev?.id || uid(),
      listing_id, user_id,
      score:   score   ?? prev?.score   ?? null,
      comment: comment ?? prev?.comment ?? '',
      updated_at: now(),
    };
    if (this.sb) {
      const { error } = await this.sb.from('opinions').upsert(row, { onConflict: 'listing_id,user_id' });
      if (error) throw error;
      await this._pull();
    } else {
      const i = this.opinions.findIndex(o => o.listing_id === listing_id && o.user_id === user_id);
      if (i >= 0) this.opinions[i] = row; else this.opinions.push(row);
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
    const s = this.opinionsFor(listingId).map(o => o.score).filter(v => v != null);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  },

};

function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
