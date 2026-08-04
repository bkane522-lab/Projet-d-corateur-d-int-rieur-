# Modèle de données

## Vue d'ensemble

```
dossiers (1) ──< photos (n)
dossiers (1) ──< mesures (n)
dossiers (1) ──< notes_privees (n)
dossiers (1) ──< rendez_vous (n)
dossiers (1) ──  historique_statuts (n)
```

Une seule entité centrale (`dossiers`), tout le reste s'y rattache par clé étrangère.
Ce choix garde le modèle simple pour le MVP tout en restant capable d'accueillir les
futures sources de données (RoomPlan, ARCore) sans changement de structure.

## Table `dossiers`

| Champ                  | Type          | Notes                                             |
|-------------------------|--------------|----------------------------------------------------|
| id                      | uuid (PK)    | généré automatiquement                              |
| code_acces              | text unique  | code remis au prospect pour suivre son dossier      |
| statut                  | text         | Nouveau / À analyser / À contacter / RDV programmé / Proposition envoyée / Signé / Archivé |
| type_logement           | text         | appartement, maison, studio…                        |
| piece_concernee         | text         |                                                     |
| ville                   | text         |                                                     |
| surface_m2              | numeric      | déclarative, corrigible                             |
| probleme_principal      | text         |                                                     |
| elements_a_conserver    | text         |                                                     |
| style_recherche         | text         |                                                     |
| budget                  | text         | tranche, pas un montant exact                       |
| calendrier              | text         | souhait de délai                                    |
| nom_prospect            | text         |                                                     |
| email_prospect          | text         |                                                     |
| telephone_prospect      | text         |                                                     |
| source_scan             | text         | manuel / roomplan / arcore                          |
| resume_ia               | text         | généré à la demande côté admin                       |
| prochaine_action        | text         | éditable par la décoratrice                            |
| created_at              | timestamptz  |                                                     |
| updated_at              | timestamptz  |                                                     |

## Table `photos`

| Champ       | Type        | Notes                          |
|-------------|-------------|----------------------------------|
| id          | uuid (PK)   |                                  |
| dossier_id  | uuid (FK)   |                                  |
| url         | text        | lien vers stockage (Supabase Storage) |
| legende     | text        | ex: "Vue depuis l'entrée"        |
| created_at  | timestamptz |                                  |

## Table `mesures`

| Champ        | Type        | Notes                                     |
|--------------|-------------|----------------------------------------------|
| id           | uuid (PK)   |                                              |
| dossier_id   | uuid (FK)   |                                              |
| libelle      | text        | ex: "Longueur mur nord"                     |
| valeur_cm    | numeric     |                                              |
| source       | text        | manuel / roomplan / arcore                  |
| corrige_par  | text        | "prospect" ou "décoratrice"                   |

## Table `notes_privees`

| Champ       | Type        | Notes                                |
|-------------|-------------|------------------------------------|
| id          | uuid (PK)   |                                    |
| dossier_id  | uuid (FK)   |                                    |
| contenu     | text        | visible uniquement côté admin       |
| created_at  | timestamptz |                                    |

## Table `rendez_vous`

| Champ       | Type        | Notes                       |
|-------------|-------------|------------------------------|
| id          | uuid (PK)   |                              |
| dossier_id  | uuid (FK)   |                              |
| date_heure  | timestamptz |                              |
| lieu        | text        | visio / cabinet / sur site   |
| statut      | text        | proposé / confirmé / annulé  |

## Table `historique_statuts`

| Champ       | Type        | Notes                                |
|-------------|-------------|------------------------------------|
| id          | uuid (PK)   |                                    |
| dossier_id  | uuid (FK)   |                                    |
| statut      | text        |                                    |
| changed_at  | timestamptz |                                    |

Cette table permet d'afficher une frise d'avancement côté client sans exposer les notes
privées ni le détail des échanges internes.
