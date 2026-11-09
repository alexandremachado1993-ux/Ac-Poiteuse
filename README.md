# AC Conger Payer + pointage — version 2.8.0-beta.4 (intermédiaire)

Pointage, feuilles de temps, congés et absences pour les techniciens itinérants (SAT France).
Application **locale** : HTML / CSS / JavaScript, **aucune bibliothèque**, **aucun serveur**, fonctionne hors ligne.
Interface en **français, anglais, espagnol et allemand**.

> **Version intermédiaire** de la mission de consolidation (« V2.7 », numérotée 2.8).
> Ce qui est fait, ce qui reste à faire et les paramètres à confirmer : `CHANGELOG_V2.7.md`.

## Lancer l'application sur l'ordinateur (rien à installer)

1. Décompresser le ZIP dans un dossier.
2. **Double-cliquer sur `index.html`**, ou l'ouvrir dans **Chrome** ou **Edge** (vérifié dans Chromium).
3. Choisir son nom, puis son mot de passe à la première connexion (6 caractères minimum).

Les données restent **dans ce navigateur, sur cet ordinateur**. Changer de navigateur ou effacer les données de
navigation fait perdre l'accès aux données : **exporter régulièrement une sauvegarde complète**
(Paramètres → Sauvegarde, avec un compte responsable).

Facultatif — installation en application (PWA, mode hors ligne complet, téléphone) : servir le dossier par un
serveur local (par exemple l'extension « Live Server » de VS Code), puis ouvrir `http://localhost:…`.

## Mise à jour depuis une version précédente

Ouvrir la nouvelle version dans **le même navigateur, au même emplacement** : les données sont converties
automatiquement (v1, v2, v3 → v4), avec une copie de sécurité vérifiée ; les anciennes données ne sont jamais
réécrites. En cas de doute : exporter une sauvegarde complète **avant** la mise à jour.
À chaque déploiement, augmenter `CACHE_VERSION` dans `sw.js` (`acp-v20` → `acp-v21`…).

## Comptes de référence

| Compte | Fonction | Rôle | Sections | Pointage |
|---|---|---|---|---|
| Alexandre Machado | Technicien | technicien | Sud | obligatoire |
| Damien Morvan | Technicien | technicien | Nord | obligatoire |
| Enrique Soler | Chef d'équipe | chef d'équipe | Nord + Sud | non (activable) |
| Yann Lefloc'h | Responsable Qualité | administrateur | toutes | non (activable) |
| Jérémie Augé | Responsable Commercial France & PDG | administrateur | toutes | non (activable) |

Yann et Jérémie ont des droits **identiques** et peuvent administrer le compte de l'autre.
Les menus et onglets affichés dépendent des **permissions** ; les droits sont aussi revérifiés dans la logique
métier. Détail des permissions et de leur limite (contrôle local ≠ contrôle serveur) : `ARCHITECTURE.md`.

## Fonctions disponibles dans cette version

- Pointage : arrivée, pause / reprise, départ ; activités **Travail, Domicile, Réunion, Trajet, Repas** ; client et note.
  **Domicile** = journée forfaitaire en un appui (7 h + repas, base 35 h). La ligne de production n'est plus demandée au pointage
  (elle reste dans les clients, les corrections et les exports).
- Feuille de temps : semaine / mois, journée « pointé − repas = journée », synthèse, compteurs, exports (Excel, PDF,
  HTML, CSV). **Corrections et imports réservés aux responsables** (depuis Équipe → fiche) : fenêtre unique arrivée /
  départ / repas, motif obligatoire. Les techniciens **signalent une erreur**.
- Congés & absences : calendrier collectif (mois, semaine, année), demandes, validation par un responsable,
  soldes (acquisition 2,5 jours par mois).
- Tableau de bord : vue personnelle (comptes qui pointent) ou **vue équipe** (chef d'équipe, responsables), limitée aux
  sections : statut en direct, heures du jour et de la semaine par technicien, demandes et signalements à examiner.
- Équipe : fiches, rôle, fonction, sections, obligation de pointage, droits effectifs, comptes actifs / désactivés.
- Rapports : par salarié ou équipe, par période, export Excel et PDF.
- Paramètres : règles de temps, clients, sections, **droits et demandes d'accès**, **historique** (recherche,
  filtres, export), **sauvegarde complète** avec vérification sur copie, document de référence.
- Notifications internes (cloche).

**Pas encore disponible** (prochaines étapes) : validation des congés en deux étapes, décompte en jours ouvrables
avec journal des mouvements, catégories d'absence et demi-journées, affichage 169 h / temps réel dans les rapports,
contrôles de pointage avancés, exports de préparation de la paie. Aucune synchronisation entre appareils.

## Documents

| Fichier | Contenu |
|---|---|
| `CHANGELOG_V2.7.md` | Fait, corrigé, restant à faire, paramètres à confirmer |
| `ARCHITECTURE.md` | Organisation, profils, permissions, modèle de données, règles, stockage et quotas, migrations, future plateforme |
| `TESTS_MANUELS.md` | Scénarios à dérouler dans l'interface avec les cinq comptes |
| `tests/README.md` | Tests automatisés : `node tests/run-all.js` |

`netlify.toml` et `robots.txt` ne servent que si le dossier est un jour publié sur un hébergement statique ;
l'application ne dépend d'aucun service.
