# Tests automatisés — AC Conger Payer

Ces fichiers ne font **pas** partie de l'application : ils ne sont pas chargés par `index.html`
et ne sont pas mis en cache hors ligne. L'application elle-même n'a **aucune dépendance**.

## Lancer tous les tests

Prérequis : Node.js (18 ou plus).

```
node tests/run-all.js
```

- Moteur, permissions, sauvegardes, travail maison, traductions : Node.js suffit.
- Interface (5 comptes, 4 langues) et import du registre : nécessitent `jsdom`, utilisé **uniquement** par les tests :
  `npm install --prefix tests` (installe la version figée dans `tests/package.json`).
- Import du registre : nécessite le fichier Excel des responsables, qui contient des données personnelles
  et n'est donc **pas** dans le projet :
  `ACP_REGISTER=chemin/vers/2026_Registres_Heures_1.xlsx node tests/run-all.js`
  (sans ce fichier, le test est ignoré et signalé comme tel).

Le lanceur affiche une ligne par suite et le total. Code de sortie 1 en cas d'échec.

| Fichier | Contenu |
|---|---|
| `i18n-check.js` | Toutes les clés existent en FR/EN/ES/DE, mêmes variables, aucune clé inutile, aucun texte français dans le code |
| `logic.js` | Moteur d'heures et de congés, comptes, connexion, migrations v1/v2 → v4 |
| `perms.js` | Permissions par profil, périmètre des sections, droits temporaires et expiration, demandes d'accès, garde-fous, historique, notifications, sauvegarde complète, migration depuis les données 2.7 |
| `admins.js` | Les deux responsables se gèrent mutuellement sans blocage ; restauration vérifiée sur copie ; recherche dans l'historique |
| `home.js` | Journée de travail maison (7 h max, base 35 h) |
| `ui.js` | Parcours réels dans l'interface avec les cinq comptes, dans les 4 langues ; droits réellement appliqués |
| `register.js` | Import du registre Excel des responsables et chiffres de référence |
