# ARCHITECTURE — AC Conger Payer (2.8.0-beta.4)

## 1. Principe

Application web locale, sans serveur ni bibliothèque : HTML, CSS et JavaScript, données dans le navigateur.
Elle fonctionne hors ligne. Aucune plateforme n'est choisie : le code sépare les couches pour qu'un futur
stockage distant ou une API remplace **un seul fichier** sans réécrire les écrans.

```
Écrans (page-*.js, ui.js, app.js)
      │  lisent et écrivent uniquement via Store, vérifient les droits via Permissions
Logique métier (hours.js, segments.js, leave.js, holidays.js, countdown.js)
      │
Permissions (permissions.js)  ◄── consulté aussi par store.js pour chaque écriture sensible
      │
Accès aux données (store.js) : schéma, migrations, contrôles de droits, historique, notifications, sauvegardes
      │
Stockage (storage-adapter.js) : SEUL fichier qui touche localStorage / sessionStorage
```

## 2. Fichiers

| Couche | Fichiers |
|---|---|
| Stockage | `storage-adapter.js` |
| Données | `store.js` |
| Droits | `permissions.js`, `auth.js` (connexion, session) |
| Métier | `hours.js` (semaine, objectif, crédits, heures à majorer, travail maison), `segments.js` (pointages → heures, nuit, plafond travail maison), `leave.js` (solde de congés), `holidays.js` (fériés), `countdown.js` |
| Imports / exports | `hours-csv.js`, `exports.js`, `xlsx.js`, `xlsx-reader.js`, `register-import.js` |
| Écrans | `page-login.js`, `page-dashboard.js`, `page-clock.js`, `page-timesheet.js`, `page-leave.js`, `page-team.js`, `page-reports.js`, `page-settings.js`, `page-profile.js`, `page-clients.js`, `page-admin-panels.js`, `editor.js`, `reminders.js`, `ui.js` |
| Démarrage | `app.js`, `index.html`, `sw.js` (mode hors ligne), `manifest.json` |
| Langues | `i18n.js`, `translations.js` (FR, EN, ES, DE) |

## 3. Profils et permissions

Rôle = permissions. Section = périmètre des données visibles. Les deux sont indépendants, comme le statut
du compte (`accountStatus`) et l'obligation de pointage (`clockRequired`). Aucune règle ne cite une personne.

| Permission | Technicien | Chef d'équipe | Administrateur |
|---|:-:|:-:|:-:|
| clock.own | ✔ | (activable) | (activable) |
| timesheet.own | ✔ | ✔ | ✔ |
| timesheet.team.view | | ✔ | ✔ |
| timesheet.correct.request | ✔ | ✔ | ✔ |
| timesheet.correct.approve | | | ✔ |
| leave.request | ✔ | ✔ | ✔ |
| leave.review | | ✔ | ✔ |
| leave.approve | | | ✔ |
| leave.balance.view | ✔ | ✔ | ✔ |
| leave.balance.manage | | | ✔ |
| team.view | | ✔ | ✔ |
| team.manage, users.manage, settings.manage, permissions.manage, reports.export, audit.view | | | ✔ |
| reports.view | | ✔ | ✔ |
| permissions.request | | ✔ | ✔ |
| absence.sensitive.view | | | ✔ |

- **Droits individuels** (`grants`) : permanents ou temporaires (début, fin), révocables. Un droit temporaire
  est comparé à la date du jour **à chaque vérification** : il expire même si l'application est restée fermée.
- **Périmètre** : un technicien ne voit que ses propres données ; les autres profils voient les personnes des
  sections qu'ils partagent (`allSections` = toutes).
- **Garde-fous** dans `store.js` : pas d'auto-attribution de droits, pas d'auto-approbation, pas
  d'auto-désactivation ni d'auto-rétrogradation, jamais zéro administrateur actif.
- **Acteur et personne concernée** : `current` = qui agit (droits, auteur dans l'historique) ; `withUser(id, fn)`
  donne accès aux **données** d'un autre compte sans changer l'acteur (consultation, correction, import par un responsable).
- **Pointages** : le pointage en direct crée et clôt ses propres activités ; tout ajout manuel, import, modification
  tracée ou suppression d'un pointage terminé exige `timesheet.correct.approve` (motif obligatoire, `correctDay`).
  Une nouvelle demande est toujours « en attente » ; l'historique validé et les clients partagés sont réservés aux responsables.

⚠️ **Limite de sécurité** : l'application étant locale, ces contrôles s'exécutent dans le navigateur. Ils organisent
les accès mais **ne valent pas un contrôle côté serveur** : une personne ayant accès à l'appareil et aux outils du
navigateur pourrait les contourner, et les mots de passe ne protègent pas réellement les données stockées sur
l'appareil. La sécurité réelle viendra avec un serveur.

## 4. Modèle de données (clé `acp_data_v4`)

```
{ version: 4, deviceId,
  org:      règles d'équipe (39 h, 35 h + 4 h à 25 %, jour crédité 39 ÷ 7, seuils 25 % / 50 %, nuit, férié,
            travail maison, congés 2,5 j/mois, paramètres à confirmer vides…),
  sections: [ { id, name } ],
  users:    [ { id, name, jobTitle, hireDate, entity, role, language, pinHash,
                accountStatus, sectionIds, allSections, clockRequired } ],
  clients:  [ { id, name, city, lines, createdAt } ],               — communs à tous les comptes
  perUser:  { [userId]: { settings, entries[], requests[], lastBackupAt } },
  grants, accessRequests, correctionRequests, leaveMovements, audit, notifications }
```

Session : `sessionStorage` `acp_session`. Langue : `localStorage` `acp_language`.

## 5. Règles métier (état 2.8.0-beta.4)

- Semaine du lundi au dimanche. Objectif fixe **39 h** (35 h normales + 4 h habituelles majorées à 25 %),
  mensualisé à **169 h** (39 × 52 ÷ 12), référence qui ne varie jamais selon le mois.
- Heures faites = heures travaillées + jours crédités (congé, récupération, férié) à 39 ÷ 7.
- Heures à majorer : 25 % de la 40e à la 43e heure travaillée, 50 % au-delà (paramétrable).
- Total à récupérer = résultat des semaines terminées − récupérations prises + nuit × 25 % + férié × 50 %.
- Catégories de pointage proposées : Travail, Domicile, Réunion, Trajet, Repas (+ Pause par le bouton dédié).
- **Domicile** (journée forfaitaire) : 7 h maximum, sans nuit, journée sur la base 35 h (objectif − 0 h 48 par jour).
- Congés : acquisition 2,5 jours par mois complet ; décompte actuellement en jours **ouvrés** (passage aux
  jours **ouvrables** prévu).
- Paramètres à confirmer par les RH ou la paie : voir `CHANGELOG_V2.7.md`.

## 6. Stockage local et quotas

- Le navigateur accorde environ **5 Mo** de `localStorage` par site (variable selon le navigateur, sans garantie).
- L'écran Paramètres → Sauvegarde affiche l'espace utilisé et alerte au-delà de 80 %.
- Les copies de sécurité (avant migration, avant restauration, anciennes clés v1/v2/v3) occupent de l'espace :
  les supprimer seulement **après** avoir exporté une sauvegarde complète.
- Ouvert par double-clic (`file://`) dans Chrome ou Edge, le stockage est propre à ce navigateur et à cet
  ordinateur. Changer de navigateur, ou effacer les données de navigation, fait perdre l'accès aux données :
  **exporter régulièrement une sauvegarde complète**.
- En cas d'écriture impossible (espace plein), un message invite à exporter puis à supprimer d'anciennes copies.

## 7. Migrations

Au premier lancement d'une nouvelle version : (1) copie des anciennes données sous `acp_backup_before_v4_<date>`,
(2) relecture et comparaison de la copie, (3) migration vers la nouvelle clé (l'ancienne clé reste intacte),
(4) contrôle d'intégrité, (5) rapport inscrit dans l'historique. La migration v3 → v4 applique l'organisation de
référence (rôles, sections, pointage obligatoire, fonctions) et trace chaque compte modifié.

## 8. Sauvegardes

- Par compte (tout utilisateur) : ses heures, demandes et réglages.
- **Complète** (administrateurs) : toutes les données, avec manifeste (nombre d'éléments) et empreinte de contrôle
  (détecte un fichier tronqué ou modifié par accident ; ce n'est pas une signature cryptographique).
- **Vérification sur copie** : le fichier est lu, migré et contrôlé en mémoire ; rien n'est écrit.
- Restauration : vérification, puis copie de sécurité **vérifiée** des données actuelles, puis remplacement.
- La sauvegarde complète contient les empreintes de mots de passe (même algorithme que CONGER PAYER) pour une
  future migration : à conserver en lieu sûr.

## 9. Points à adapter pour une future plateforme

| Point | Aujourd'hui | Demain |
|---|---|---|
| Stockage | `storage-adapter.js` (localStorage) | adaptateur vers une API ou un stockage distant, mêmes fonctions |
| Connexion | mot de passe local (SHA-256) | fournisseur d'identité de l'entreprise |
| Permissions | vérifiées dans le navigateur | **revérifiées côté serveur** (le module `permissions.js` donne la référence des règles) |
| Historique | stocké sur l'appareil, inclus dans les sauvegardes | journal central, non modifiable |
| Synchronisation | **aucune** (une seule machine) | identifiants stables et `deviceId` déjà en place ; règles de conflit à définir (dernier écrit, fusion par élément…) |
| Paie | exports Excel / CSV | couche d'adaptation vers le logiciel de paie choisi (aucun format inventé) |
| Notifications | internes à l'application | e-mail / SMS éventuels |
