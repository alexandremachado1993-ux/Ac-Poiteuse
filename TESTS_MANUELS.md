# Scénarios de tests manuels — 2.8.0-beta.4

À dérouler dans l'interface, avec les **cinq comptes**, pour vérifier les droits **réellement appliqués**
(pas seulement les menus). Cocher chaque ligne ; noter tout écart avec une capture d'écran.

## Préparation

1. Ouvrir `index.html` par double-clic dans Chrome ou Edge (aucune installation).
2. Paramètres → Sauvegarde : si des données existent déjà, **exporter une sauvegarde complète** avant de commencer
   (connecté avec Yann ou Jérémie).
3. À la première connexion de chaque compte, choisir un mot de passe (6 caractères minimum) et le noter.

## A. Alexandre Machado — technicien, Sud, pointage obligatoire

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| A1 | Se connecter | Menu : Tableau de bord, Pointage, Congés & absences, Rapports, Paramètres. **Pas** d'Équipe | ☐ |
| A2 | Taper `#team` dans l'adresse | Renvoyé au tableau de bord | ☐ |
| A3 | Pointage → Pointer mon arrivée, attendre 1 min, Pause, Reprendre, Pointer mon départ | Statut correct à chaque étape ; journal du jour à jour | ☐ |
| A3b | Carte Activité | Boutons exactement : Travail, Domicile, Réunion, Trajet, Repas ; champ Client, **pas** de champ Ligne | ☐ |
| A4 | Le lendemain (ou sur un jour sans pointage) : bouton Domicile | Journée 08 h–12 h + repas + 13 h–16 h ; Feuille de temps : journée 7 h 00, objectif de la semaine 38 h 12 | ☐ |
| A5 | Domicile une 2e fois le même jour | Refus : « déjà enregistrée » | ☐ |
| A6 | Domicile un jour déjà pointé | Refus : « Il y a déjà des pointages aujourd'hui » | ☐ |
| A7 | Congés & absences → Nouvelle demande | Demande « En attente » visible dans le calendrier (pointillés) | ☐ |
| A8 | Calendrier | Voit ses demandes et les absences **validées** des autres, jamais leurs demandes en attente | ☐ |
| A9 | Paramètres | Onglets : Profil, Préférences, Sauvegarde, Document de référence. **Pas** de Règles, Historique, Droits | ☐ |
| A10 | Profil | Fonction et section « Sud » affichées ; impossible de modifier sa date d'embauche | ☐ |
| A11 | Feuille de temps → ouvrir une journée | **Aucun** bouton ✎, ni « Ajouter », ni « Importer » ; bouton « Signaler une erreur » | ☐ |
| A12 | Signaler une erreur (ex. « départ réel 17 h 30 ») | « Signalement envoyé » ; carte Signalements : En attente | ☐ |

## B. Damien Morvan — technicien, Nord

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| B1 | Se connecter | Même menu qu'Alexandre | ☐ |
| B2 | Rapports | Seulement ses propres heures ; aucun choix de salarié | ☐ |
| B3 | Calendrier, filtre Salarié | Ne permet pas de consulter les demandes en attente d'Alexandre | ☐ |

## C. Enrique Soler — chef d'équipe, Nord + Sud, pointage non obligatoire

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| C1 | Se connecter | Menu : Tableau de bord, Congés & absences, Équipe, Rapports, Paramètres. **Pas** de Pointage | ☐ |
| C1b | Tableau de bord | « Mes techniciens » : Alexandre (Sud) et Damien (Nord) avec statut, heures du jour, semaine, résultat, signalements ; « À examiner » : leurs congés et signalements ; **pas** de bouton « Pointer » ni « Décider » | ☐ |
| C1c | (Yann retire la section Sud à Enrique) puis tableau de bord d'Enrique | Alexandre n'apparaît plus | ☐ |
| C2 | Équipe → fiche d'Alexandre | Consultation **en lecture seule** (champs grisés), pas de bouton « Nouveau salarié » | ☐ |
| C3 | Paramètres | Pas d'onglet Règles de temps, Sections, Historique | ☐ |
| C4 | Paramètres → Droits et accès → demander « Valider définitivement les congés », temporaire, **sans motif** | Refus : motif obligatoire | ☐ |
| C5 | Même demande avec un motif | « Demande envoyée » ; statut En attente | ☐ |
| C6 | Tenter de valider une demande de congé d'Alexandre | Impossible (validation finale réservée aux responsables) | ☐ |

## D. Yann Lefloc'h — Responsable Qualité, administrateur

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| D1 | Se connecter | Cloche : 1 notification (demande d'Enrique) ; profil : « Responsable Qualité » | ☐ |
| D2 | Droits et accès → Accorder la demande d'Enrique en raccourcissant la période, **sans commentaire** | Refus : commentaire obligatoire | ☐ |
| D3 | Idem avec un commentaire | Approuvée ; Enrique reçoit une notification ; le droit apparaît dans sa fiche avec sa date de fin | ☐ |
| D4 | Équipe → fiche de Jérémie : modifier sa fonction, le désactiver, le réactiver | Tout fonctionne (aucun blocage entre responsables) | ☐ |
| D5 | Sa propre fiche : changer son rôle ou se désactiver | Impossible | ☐ |
| D6 | Équipe → fiche d'Enrique → Accorder un droit « Pointer ses heures » | Enrique voit le menu Pointage à sa prochaine connexion | ☐ |
| D7 | Paramètres → Sections : créer « Centre », l'affecter à Damien | Visible dans la fiche de Damien | ☐ |
| D8 | Historique : filtrer par utilisateur « Enrique », par type « Demandes d'accès », par période | Lignes correspondantes ; anciennes/nouvelles valeurs lisibles ; motif visible | ☐ |
| D9 | Historique → CSV | Fichier téléchargé ; un événement « Export » apparaît dans l'historique | ☐ |
| D10 | Sauvegarde → Exporter la sauvegarde complète, puis « Vérifier une sauvegarde » avec ce fichier | « Restaurable, rien ne manque » ; les données actuelles ne changent pas | ☐ |
| D11 | Ouvrir le fichier de sauvegarde dans un éditeur, modifier un chiffre, puis le vérifier | Anomalie « empreinte » détectée | ☐ |
| D12 | Sauvegarde → espace de stockage | Pourcentage affiché ; liste des copies de sécurité | ☐ |
| D13 | Cloche | Notification du signalement d'Alexandre (A12) | ☐ |
| D14 | Équipe → fiche d'Alexandre → feuille → journée signalée → ✎ | Une seule fenêtre : arrivée, départ, repas, activité ; récapitulatif « pointé − repas = journée » | ☐ |
| D15 | Enregistrer **sans motif** | Refus : motif obligatoire | ☐ |
| D16 | Avec motif | Journée corrigée (activité · repas · activité) ; signalement « Corrigé » ; Alexandre notifié ; historique : avant / après / motif | ☐ |
| D17 | Une journée ancienne avec repas inclus dans le travail | « À vérifier » : « Repas … inclus dans l'activité : il n'est pas déduit » ; après correction, le repas est déduit | ☐ |
| D18 | Fiche d'Alexandre → Importer le registre Excel | Import dans les données **d'Alexandre** ; événement « Import » dans l'historique | ☐ |

## E. Jérémie Augé — Responsable Commercial France & PDG, administrateur

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| E1 | Se connecter | Profil : « Responsable Commercial France & PDG » ; mêmes menus et onglets que Yann | ☐ |
| E2 | Fiche de Yann : réinitialiser son mot de passe | Yann doit en choisir un nouveau à la prochaine connexion | ☐ |
| E3 | Droits et accès : retirer le droit accordé à Enrique (avec motif) | Statut « Révoquée » ; Enrique notifié ; le droit disparaît | ☐ |
| E4 | Règles de temps : passer « Domicile » à 6 h, vérifier une journée à domicile, revenir à 7 h | La journée vaut 6 h puis 7 h ; chaque changement figure dans l'historique | ☐ |
| E5 | Congés & absences → Demandes : accorder la demande d'Alexandre | Statut Accordée ; calendrier en couleur pleine | ☐ |

## F. Contrôles transverses

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| F1 | Changer la langue (EN, ES, DE) sur chaque écran | Aucun texte manquant ni « {variable} » visible | ☐ |
| F2 | Fermer le navigateur, rouvrir `index.html` | Données conservées ; reconnexion demandée | ☐ |
| F3 | Téléphone (si testé via un serveur local) | Barre rouge en haut, onglets en bas, cloche visible | ☐ |
