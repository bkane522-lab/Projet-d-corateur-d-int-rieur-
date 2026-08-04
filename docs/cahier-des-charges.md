# Cahier des charges technique — MVP « Dossier Projet »

## 1. Objectif

Outil de qualification et de captation de prospects pour une décoratrice d'intérieur.
Le prospect documente son espace et son besoin ; l'outil transmet un dossier structuré
à la décoratrice, qui garde l'entière maîtrise de l'analyse et de la proposition.

**Ce que l'app fait** : collecter, structurer, organiser, notifier.
**Ce que l'app ne fait pas** (à ce stade) : générer des plans techniques, calculer des murs
porteurs, produire un devis définitif, ou un rendu 3D photoréaliste. Ces briques viendront
plus tard, quand les modules natifs de scan seront disponibles.

## 2. Périmètre du MVP

Inclus :
- Page d'accueil présentant la décoratrice (méthode, réalisations, prestations)
- Parcours prospect : détection des capacités du téléphone → scan si dispo, sinon
  parcours photos guidées + mesures manuelles → questionnaire projet → dossier
  récapitulatif corrigible → prise de rendez-vous → suivi d'avancement
- Espace décoratrice privé : liste des dossiers avec statuts, détail dossier, notes
  privées, prochaine action, génération assistée d'un résumé du besoin (IA)
- Séparation claire des modules techniques (voir architecture)

Exclus pour l'instant (prévu, non développé) :
- Scan spatial réel (LiDAR / photogrammétrie) — remplacé par une interface de démonstration
- Génération de plans techniques ou détection de murs porteurs
- Devis chiffré définitif
- Rendu 3D photoréaliste
- Authentification complète (on utilise un code d'accès dossier + mot de passe
  administrateur simple ; à remplacer par une vraie auth en V2)

## 3. Point d'honnêteté technique — scan spatial

Une PWA (web app) ne peut pas accéder au LiDAR d'un iPhone Pro ni à la profondeur ARCore
d'un Android de la même façon qu'une app native :
- **iOS** : le scan LiDAR complet (type RoomPlan) nécessite une app native Swift/ARKit.
  Impossible à réaliser en web pur.
- **Android** : ARCore Depth API est accessible en natif (Kotlin/Java) ou via des SDK
  spécifiques ; pas nativement exploitable dans un simple navigateur.
- **Ce qu'une PWA peut faire aujourd'hui** : détecter certaines capacités du téléphone
  (caméra, capteurs de mouvement via `DeviceOrientationEvent`, accès fichiers), guider une
  prise de photos structurée, et proposer une saisie de mesures manuelles assistée.

Le MVP assume cette limite : la section « scan » est une **interface de démonstration**
qui explique la fonctionnalité à venir et bascule automatiquement vers le parcours photo
+ mesures manuelles, qui lui est pleinement fonctionnel dès aujourd'hui.
Les modules natifs (RoomPlan sur iOS, ARCore sur Android) sont prévus comme extensions
séparées, branchées plus tard sur la même base de données de projets.

## 4. Statuts d'un dossier

`Nouveau` → `À analyser` → `À contacter` → `Rendez-vous programmé` → `Proposition envoyée`
→ `Signé` / `Archivé`

Ce pipeline structure à la fois l'espace décoratrice (filtrage, tri) et la vue de suivi
côté client (affichage d'une version simplifiée du statut).

## 5. Contraintes de stack

- Aucune étape de build : HTML / CSS / JS natifs, fonctions serverless Vercel en CommonJS
- Stockage structuré : Supabase (Postgres), cohérent avec le projet Kizomba Atlas existant
- IA texte : Groq (`llama-3.3-70b-versatile`) pour la génération du résumé de besoin
- Pas de branding personnel de la décoratrice grand public sur l'espace admin (accès privé)
