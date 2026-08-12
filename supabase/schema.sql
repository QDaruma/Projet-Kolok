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
  lessor_type  text default '',          -- '' | 'particulier' | 'agence'
  lessor_name  text default '',          -- nom de l'agence, si agence
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

-- Ajouts postérieurs à la création initiale : « if not exists » garde le
-- script rejouable sur une base déjà en service.
alter table listings add column if not exists lessor_type text default '';
alter table listings add column if not exists lessor_name text default '';

-- ── Les trois critères du groupe, enfin dans le schéma ─────
-- Ils étaient jusqu'ici raisonnés à la main dans « notes », ce qui les
-- rendait ni filtrables ni comparables.

-- « rooms » = chambres LIBRES pour nous, pas chambres du logement.
-- La distinction compte : à La Rouvière, 3 libres sur 4, la quatrième
-- étant occupée par quelqu'un qu'on ne choisit pas.
alter table listings add column if not exists rooms_total numeric;

-- Meublé → bail d'un an, préavis d'un mois → on peut partir à 6 mois.
-- Non meublé → bail de 3 ans (préavis d'un mois quand même, Marseille
-- étant en zone tendue, mais il faut tout acheter).
alter table listings add column if not exists furnished boolean;

-- Les chambres sont-elles ANNONCÉES ou VÉRIFIÉES ? Cinq fiches portaient
-- la même note manuelle « à vérifier au premier contact », et une annonce
-- à « 3 chambres » s'est révélée n'en avoir que 2.
--   '' = annoncé, non vérifié | 'confirme' = vu de nos yeux | 'faux' = démenti
alter table listings add column if not exists rooms_checked text default '';

-- Dépôt + honoraires + frais de dossier. Varie d'un facteur 6 entre nos
-- options (500 € à 3 160 €) et n'apparaissait nulle part.
alter table listings add column if not exists upfront_cost numeric;

-- Qui a touché la fiche en dernier. « added_by » disait qui l'avait créée,
-- personne ne disait qui l'avait modifiée : impossible de savoir, en
-- revenant sur l'app, si un changement venait de soi ou d'un colocataire.
alter table listings add column if not exists updated_by text default '';

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
