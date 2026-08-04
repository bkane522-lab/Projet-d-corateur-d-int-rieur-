-- Migration 002 — sécurité, stockage, format de scan normalisé
-- N'efface aucune donnée existante : uniquement des ALTER TABLE / CREATE TABLE additifs.

-- ============================================================
-- 1. Table des administrateurs autorisés (allowlist)
-- ============================================================
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now()
);

-- Après avoir créé un utilisateur dans Supabase Auth (Dashboard → Authentication →
-- Add user) pour la décoratrice, l'ajouter ici manuellement :
--   insert into admins (user_id, email) values ('<uuid-de-l-utilisateur>', 'decoratrice@example.com');

-- ============================================================
-- 2. Champs du format de scan normalisé sur `dossiers`
-- ============================================================
alter table dossiers
  add column if not exists scan_provider text default 'manuel',
  add column if not exists scan_version text default '1.0',
  add column if not exists device_capabilities jsonb,
  add column if not exists room_name text,
  add column if not exists walls jsonb default '[]'::jsonb,
  add column if not exists openings jsonb default '[]'::jsonb,
  add column if not exists dimensions jsonb default '{}'::jsonb,
  add column if not exists objects jsonb default '[]'::jsonb,
  add column if not exists annotations jsonb default '[]'::jsonb,
  add column if not exists confidence_score numeric,
  add column if not exists manual_corrections jsonb default '[]'::jsonb,
  add column if not exists export_files jsonb default '[]'::jsonb;

-- Rétrocompatibilité : les dossiers déjà créés avec l'ancien `source_scan` texte libre
-- continuent de fonctionner. `scan_provider` prend le relais pour les nouveaux dossiers
-- (valeurs attendues : 'manuel' / 'ios_lidar' / 'android_arcore').
update dossiers set scan_provider = source_scan where scan_provider is null and source_scan is not null;

-- ============================================================
-- 3. Photos : passage du base64 à un chemin de stockage Supabase Storage
-- ============================================================
alter table photos
  add column if not exists storage_path text,
  add column if not exists mur_id text,           -- référence au mur photographié (mode web guidé)
  add column if not exists statut_annotation text default 'a_verifier', -- conserver/modifier/supprimer/probleme
  add column if not exists nettete_ok boolean;

-- Les lignes existantes ont `url` rempli avec un data URL base64 : elles restent lisibles
-- telles quelles (rétrocompatibilité), mais toute nouvelle photo utilise `storage_path`
-- et un lien signé généré à la demande (voir api/signed-url.js). `url` devient nullable
-- pour les nouvelles insertions.
alter table photos alter column url drop not null;

-- ============================================================
-- 4. Documents (PDF, plans existants) — jusqu'ici non envoyés du tout
-- ============================================================
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  dossier_id uuid references dossiers(id) on delete cascade,
  storage_path text not null,
  nom_original text,
  type_mime text,
  created_at timestamptz default now()
);

-- ============================================================
-- 5. Row Level Security
-- ============================================================
-- Toutes les tables sont exclusivement lues/écrites par les fonctions serverless via la
-- clé service_role, qui contourne RLS par nature. RLS est activé ici en défense en
-- profondeur : si jamais la clé anon/publique de Supabase était utilisée par erreur
-- côté client, aucune donnée ne doit être accessible sans passer par nos API.

alter table dossiers enable row level security;
alter table photos enable row level security;
alter table mesures enable row level security;
alter table notes_privees enable row level security;
alter table rendez_vous enable row level security;
alter table historique_statuts enable row level security;
alter table documents enable row level security;
alter table admins enable row level security;

-- Aucune policy n'est créée pour le rôle "anon" / "authenticated" : par défaut, RLS sans
-- policy bloque tout accès. Seule la clé service_role (utilisée uniquement dans nos
-- fonctions serverless, jamais exposée au navigateur) peut lire/écrire ces tables.

-- ============================================================
-- 6. Index complémentaires
-- ============================================================
create index if not exists idx_photos_dossier on photos(dossier_id);
create index if not exists idx_documents_dossier on documents(dossier_id);
create index if not exists idx_notes_dossier on notes_privees(dossier_id);
