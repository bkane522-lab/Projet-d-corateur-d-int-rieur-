# Architecture technique — séparation des modules

```
┌─────────────────────────────┐
│   APPLICATION WEB (PWA)      │  ← index.html, scanner.html, questionnaire.html,
│   Vercel (statique + edge)   │    dossier.html, rdv.html, suivi.html, admin/*
└──────────────┬───────────────┘
               │ fetch()
┌──────────────▼───────────────┐
│   API (fonctions serverless) │  ← /api/*.js — chacune fait une seule chose
│   Vercel Functions (Node)    │    (créer dossier, changer statut, générer résumé…)
└──────────────┬───────────────┘
               │
     ┌─────────┼─────────────┐
     ▼         ▼             ▼
┌─────────┐ ┌─────────┐ ┌───────────┐
│ Supabase│ │  Groq   │ │  (futur)  │
│ Postgres│ │  API    │ │  Resend / │
│ stockage│ │  résumé │ │  SMS, etc.│
└─────────┘ └─────────┘ └───────────┘
```

## Modules et responsabilités

1. **Application web principale** (`/index.html`, `/scanner.html`, `/questionnaire.html`,
   `/dossier.html`, `/rdv.html`, `/suivi.html`)
   Aucune logique métier lourde : constitue l'état du dossier en cours (via
   `sessionStorage`, module `js/app.js`), l'envoie à l'API une fois complet.

2. **Stockage des projets** (Supabase / Postgres, `sql/schema.sql`)
   Source de vérité unique. Toutes les fonctions API lisent/écrivent ici.
   Choisi plutôt que Redis pour ce projet car les données sont relationnelles et
   nécessitent du filtrage/tri côté admin (par statut, ville, date).

3. **Authentification**
   - Côté prospect (MVP) : un code d'accès dossier généré à la création (pas de compte).
     À terme : lien magique par email (Supabase Auth ou Resend + token).
   - Côté décoratrice (MVP) : mot de passe unique stocké en variable d'environnement
     Vercel, comparé côté serveur. **À remplacer avant mise en prod réelle** par une
     authentification robuste (Supabase Auth avec rôle `admin`).

4. **Scan spatial** (`scanner.html`, `js/scan-detect.js`)
   Détecte les capacités du navigateur/téléphone (caméra, capteurs d'orientation),
   affiche une démonstration pédagogique de ce que fera le scan natif, et redirige
   systématiquement vers le parcours photo + mesures manuelles, pleinement fonctionnel.
   Ce module est volontairement isolé pour pouvoir être remplacé sans toucher au reste.

5. **Futur module iOS — RoomPlan** (non développé)
   Prévu comme app native Swift séparée, qui écrira directement dans les mêmes tables
   Supabase (`measurements`, `photos`) via l'API existante. Le champ
   `source_scan` (`manuel` / `roomplan` / `arcore`) est déjà prévu dans le modèle de
   données pour ne pas avoir à migrer plus tard.

6. **Futur module Android — ARCore** (non développé)
   Même logique : app native ou module Kotlin séparé, écrivant dans les mêmes tables via
   la même API. Aucune dépendance avec le code web actuel.

## Pourquoi cette séparation

Chaque brique peut évoluer indépendamment : remplacer l'authentification, brancher
RoomPlan, changer de provider d'email, sans toucher au reste. C'est la condition pour que
le MVP reste « propre et évolutif » plutôt qu'un monolithe à refaire.
