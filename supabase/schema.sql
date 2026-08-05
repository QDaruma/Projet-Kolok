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

-- Un avis est identifié par (logement, personne) : c'est la clé primaire.
-- Pas de colonne « id » séparée — elle obligerait à réécrire la ligne
-- entière à chaque modification, ce qui fait qu'un commentaire
-- enregistré juste après une note écrasait la note.
create table if not exists opinions (
  listing_id text not null references listings(id) on delete cascade,
  user_id    text not null,
  score      int,
  comment    text default '',
  updated_at timestamptz default now(),
  primary key (listing_id, user_id)
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
-- Le test « if not exists » rend ce script rejouable : sans lui,
-- le relancer échoue avec « already member of publication ».
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'listings') then
    alter publication supabase_realtime add table listings;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'opinions') then
    alter publication supabase_realtime add table opinions;
  end if;
end $$;
