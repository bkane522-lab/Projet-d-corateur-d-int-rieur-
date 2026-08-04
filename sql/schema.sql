-- Schéma Supabase (Postgres) — MVP Dossier Projet
create extension if not exists "uuid-ossp";

create table dossiers (
  id uuid primary key default uuid_generate_v4(),
  code_acces text unique not null,
  statut text not null default 'Nouveau',
  type_logement text,
  piece_concernee text,
  ville text,
  surface_m2 numeric,
  probleme_principal text,
  elements_a_conserver text,
  style_recherche text,
  budget text,
  calendrier text,
  nom_prospect text,
  email_prospect text,
  telephone_prospect text,
  source_scan text default 'manuel',
  resume_ia text,
  prochaine_action text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table photos (
  id uuid primary key default uuid_generate_v4(),
  dossier_id uuid references dossiers(id) on delete cascade,
  url text not null,
  legende text,
  created_at timestamptz default now()
);

create table mesures (
  id uuid primary key default uuid_generate_v4(),
  dossier_id uuid references dossiers(id) on delete cascade,
  libelle text not null,
  valeur_cm numeric,
  source text default 'manuel',
  corrige_par text
);

create table notes_privees (
  id uuid primary key default uuid_generate_v4(),
  dossier_id uuid references dossiers(id) on delete cascade,
  contenu text not null,
  created_at timestamptz default now()
);

create table rendez_vous (
  id uuid primary key default uuid_generate_v4(),
  dossier_id uuid references dossiers(id) on delete cascade,
  date_heure timestamptz,
  lieu text,
  statut text default 'proposé'
);

create table historique_statuts (
  id uuid primary key default uuid_generate_v4(),
  dossier_id uuid references dossiers(id) on delete cascade,
  statut text not null,
  changed_at timestamptz default now()
);

-- Index utiles pour le filtrage admin
create index idx_dossiers_statut on dossiers(statut);
create index idx_dossiers_ville on dossiers(ville);
create index idx_dossiers_created on dossiers(created_at);

-- Trigger simple pour updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_dossiers_updated
before update on dossiers
for each row execute function set_updated_at();
