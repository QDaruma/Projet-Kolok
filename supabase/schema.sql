-- ═══════════════════════════════════════════════════════════
--  KOLOK — schéma Supabase
--  À coller tel quel dans Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════

create table if not exists listings (
  id           text primary key,
  url          text default '',
  title        text default 'Sans titre',
  price        numeric,
  surface      numeric,
  rooms        numeric,
  city         text default '',
  image_url    text default '',
  status       text default 'a_contacter',
  notes        text default '',
  added_by     text default '',
  contacted_by text default '',
  contacted_at timestamptz,
  visit_at     date,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists opinions (
  id         text primary key,
  listing_id text not null references listings(id) on delete cascade,
  user_id    text not null,
  score      int,
  comment    text default '',
  updated_at timestamptz default now(),
  unique (listing_id, user_id)          -- un avis par personne et par logement
);

create index if not exists opinions_listing_idx on opinions(listing_id);

-- ── Sécurité ───────────────────────────────────────────────
-- Outil privé à 3 personnes : on autorise la clé « anon » à lire et
-- écrire. La protection réelle, c'est que l'URL du site n'est pas
-- publique. Si vous voulez verrouiller davantage, voir le README.
alter table listings enable row level security;
alter table opinions enable row level security;

drop policy if exists "acces_groupe_listings" on listings;
create policy "acces_groupe_listings" on listings
  for all to anon using (true) with check (true);

drop policy if exists "acces_groupe_opinions" on opinions;
create policy "acces_groupe_opinions" on opinions
  for all to anon using (true) with check (true);

-- ── Temps réel ─────────────────────────────────────────────
-- Pour que les 3 écrans se mettent à jour tout seuls.
alter publication supabase_realtime add table listings;
alter publication supabase_realtime add table opinions;
