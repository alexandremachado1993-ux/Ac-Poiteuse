# CHANGELOG — mission « V2.7 » (consolidation et préparation de la V3.0)

La mission a été demandée sous le nom « V2.7 ». La version 2.7.0 existant déjà (charte de l'entreprise,
onglets réactifs), cette consolidation porte le numéro **2.8**.

## 2.8.0-beta.4 — version INTERMÉDIAIRE (06/11/2026)

**Tableau de bord du chef d'équipe** (défaut signalé le 06/11/2026)
- Le tableau de bord choisissait sa vue selon le seul droit « gérer les comptes » : le chef d'équipe recevait la vue
  technicien (bouton « Pointer » inutilisable, compte à rebours de 39 h, invitation à saisir une date d'embauche qu'il ne
  peut plus modifier). La vue suit désormais les permissions.
- **Vue équipe** (chef d'équipe et responsables), **limitée aux sections** de la personne connectée :
  présents / en pause / hors poste / en congé ; tableau « Mes techniciens » (statut en direct, heures du jour,
  semaine faites / objectif, résultat, dernier pointage, signalements ouverts) ; « À examiner » (congés en attente et
  signalements d'erreur) ; heures de l'équipe ; heures à majorer ; activité ; récapitulatif du mois par technicien.
  Les responsables décident ; le chef d'équipe suit (rappel affiché) et n'a pas de bouton « Décider ».
- Le chef d'équipe voit les signalements d'erreur de son périmètre (lecture seule).
- Les comptes désactivés ne sont pas affichés.
- Bouton « Pointer » affiché seulement pour un compte qui a le droit de pointer ; message « date d'embauche à
  renseigner par un responsable » pour les autres.

## 2.8.0-beta.3 — version INTERMÉDIAIRE (06/11/2026)

**Corrections de pointage réservées aux responsables** (demande du 06/11/2026)
- Technicien : plus de correction, d'ajout, de suppression ni d'import ; bouton **« Signaler une erreur »** sur chaque
  journée et chaque anomalie (description envoyée aux responsables, suivi « En attente / Corrigé / Refusé »).
  Le pointage en direct (arrivée, pause, départ, Domicile) est inchangé.
- Chef d'équipe : consulte et peut signaler une erreur pour une personne de ses sections ; ne corrige pas.
- Responsables : corrigent depuis **Équipe → fiche → feuille de temps** ; importent le registre d'un technicien
  depuis sa fiche (l'import écrit dans les données du technicien) ; chaque import est tracé.
- **Fenêtre de correction de la journée** : une seule saisie pour l'arrivée, le départ, le **repas** (début / fin),
  l'activité, le client, la ligne et la note ; récapitulatif en direct « pointé − repas = journée » ;
  **motif obligatoire** ; nom de la personne concernée ; rappel des corrections précédentes.
- Enregistrement en morceaux propres (activité · repas · activité) : un repas ancien **inclus** dans le travail
  (non déduit) est reconstruit correctement. Valeurs d'origine conservées, un seul événement d'historique,
  salarié notifié, signalements du jour clôturés automatiquement.
- Nouvelle anomalie explicite : « Repas inclus dans l'activité : il n'est pas déduit de la journée (à corriger) ».

**Défauts de sécurité corrigés** (contrôles ajoutés dans la logique, pas seulement dans les écrans)
- Lire les données d'un autre compte remplaçait temporairement l'utilisateur connecté : les contrôles de droits et
  l'auteur dans l'historique devenaient ceux de la personne consultée. Séparation acteur / personne concernée.
- Une nouvelle demande acceptait un statut « validé » fourni par l'appelant : toute demande est désormais créée
  « en attente » ; l'historique validé (import du registre) est réservé aux responsables.
- Les clients partagés pouvaient être créés, modifiés ou supprimés par n'importe quel compte : réservés aux responsables.
- Les imports annonçaient des pointages comme importés même lorsqu'ils étaient refusés : comptage du réellement enregistré.

## 2.8.0-beta.2 — version INTERMÉDIAIRE (06/11/2026)

**Catégories de pointage** (demande du 05/11/2026) : boutons **Travail, Domicile, Réunion, Trajet, Repas**, dans cet ordre.
- « Domicile » remplace le bouton séparé « Travail maison » : même journée forfaitaire en un appui (7 h + repas, base 35 h).
- « Déjeuner » devient « Repas » (4 langues ; accords espagnols corrigés).
- La Pause reste disponible par le bouton Pause / Reprendre de la carte du haut.
- « Autre » n'est plus proposé ; les pointages « Autre » existants restent visibles et corrigeables.
- Le champ **Ligne** est retiré de l'écran Pointage uniquement (conservé dans Clients, corrections, exports) ;
  le bouton « passer chez un autre client » ne compare plus que le client.

## 2.8.0-beta.1 — version INTERMÉDIAIRE (05/11/2026)

Livrée à la demande, avant la fin de la mission. Tout ce qui est listé dans « Fait » est implémenté et testé ;
la partie « Restant à faire » n'est **pas** encore disponible.

### Fait

**Fondations**
- `js/storage-adapter.js` : seul fichier qui accède au stockage du navigateur (remplaçable plus tard par une API).
- Schéma de données **v4**. Migration automatique depuis v1, v2 et **v3 (données 2.7)** :
  copie de sécurité **relue et comparée**, migration vers une nouvelle clé (les anciennes données ne sont jamais
  réécrites), contrôle d'intégrité, rapport inscrit dans l'historique.
- Identifiant d'appareil (`deviceId`) et identifiants stables, en vue d'une future synchronisation (non développée).

**Rôles, permissions, sections**
- `js/permissions.js` : module central, 20 permissions, droits par défaut par rôle, droits individuels permanents
  ou temporaires (expiration vérifiée à chaque contrôle, même si l'application est restée fermée), révocation.
- Contrôles **dans la logique métier** (`store.js`), et pas seulement par le masquage des boutons.
- Rôles : technicien, chef d'équipe, administrateur. Rôle, sections, statut du compte et obligation de pointage
  sont des champs distincts ; aucune règle ne dépend du nom d'une personne.
- Comptes de référence : Alexandre Machado (technicien, Sud), Damien Morvan (technicien, Nord) — pointage
  obligatoire ; Enrique Soler (chef d'équipe, Nord + Sud) ; Yann Lefloc'h (Responsable Qualité) et
  Jérémie Augé (Responsable Commercial France & PDG), administrateurs aux droits identiques, toutes sections.
  Pointage non activé par défaut pour Enrique, Yann et Jérémie, activable compte par compte.
- Garde-fous : personne ne s'attribue de droits ni n'approuve sa propre demande ; personne ne se désactive
  ni ne se rétrograde ; jamais zéro administrateur actif. Les deux responsables se gèrent mutuellement sans blocage.
- Sections Nord et Sud, créables et renommables ; affectations dans la fiche de chaque personne.
- Menus et onglets calculés à partir des permissions.

**Demandes d'accès** : motif obligatoire, temporaire ou permanent, approbation / refus / demande de précisions /
autre période justifiée, statuts « expirée » et « révoquée », notification du demandeur et des responsables.

**Historique** : toutes les actions importantes (connexions, comptes, rôles, droits, demandes d'accès, paramètres,
sections, sauvegardes, imports, exports, migrations) avec auteur, date, ancienne et nouvelle valeur, motif.
Écran avec recherche par utilisateur, période, type d'action et texte ; valeurs affichées en clair ; export CSV et JSON.

**Notifications internes** : cloche avec le nombre de non lus (ordinateur et téléphone), liste, marquer comme lu.

**Sauvegardes** : sauvegarde **complète** (tous les comptes) avec manifeste et empreinte de contrôle ;
**vérification sur une copie** en mémoire, sans rien écrire ; restauration précédée d'une copie de sécurité vérifiée ;
mesure de l'espace de stockage, alerte au-delà de 80 %, gestion des copies de sécurité.

**Congés** : acquisition passée à **2,5 jours par mois complet** (30 jours par an).

**Travail maison** (information du 05/11/2026), renommé **Domicile** en beta.2 : un appui enregistre la journée
(domicile + repas) ; **7 h maximum**, sans heures de nuit ; journée sur la **base 35 h** (l'objectif de la
semaine perd 0 h 48 par jour de travail maison) ; refusée si la journée contient déjà d'autres pointages ;
déclaration directe, tracée ; tous les paramètres modifiables (Règles de temps).

**Tests** : dossier `tests/` intégré au projet, lanceur unique `node tests/run-all.js`
(1 941 vérifications au moment de cette version).

### Défauts corrigés pendant ces étapes
- Les administrateurs recevaient d'office le droit de pointer (contraire à la décision du 05/11) : corrigé.
- Le tri des comptes ne connaissait que deux rôles : corrigé.
- Une sauvegarde abîmée (contenu vidé) passait la vérification : ajout d'un manifeste et d'une empreinte.
- L'historique affichait des valeurs techniques illisibles : valeurs traduites.
- L'écran des Règles de temps proposait encore « 25 jours par an », réglage supprimé par le schéma v4
  (modification ignorée en silence) : remplacé par « 2,5 jours par mois ».
- Un encart « Synchronisation » laissait croire à une synchronisation entre appareils : retiré.
- Le README affirmait que l'application ne fonctionnait pas par double-clic sur `index.html` : faux, vérifié et corrigé.

### Restant à faire (prochaines étapes de la mission)
1. Validation des congés en deux étapes (avis du chef, décision d'un responsable, exception documentée, 7 statuts).
   **Aujourd'hui** : une seule étape (un responsable accorde ou refuse).
2. Décompte des congés en **jours ouvrables** (lundi → samedi) et journal des mouvements (acquisitions, prises,
   report, régularisation, correction, solde initial). **Aujourd'hui** : décompte en jours ouvrés (lundi → vendredi).
3. Catégories d'absence (absence autorisée, non rémunérée, maladie, accident du travail…), demi-journées,
   justificatif « fourni » + référence, confidentialité des absences médicales.
4. Moteur 39 h / 169 h : affichage distinct du temps contractuel mensualisé (169 h = 151,67 h + 17,33 h)
   et du temps réellement pointé dans le tableau de bord, les rapports et les exports.
5. Pointage : contrôles complémentaires (oubli de départ sur plusieurs jours, pause anormale, journée incomplète).
   Fait en beta.3 : signalement d'erreur par le technicien et correction par les responsables.
6. Exports de préparation de la paie (par salarié, période, section ; réel / mensualisé / éléments de paie)
   et couche d'adaptation documentée.
7. Documentation finale complète.

### Paramètres métier à confirmer (RH / paie)
- Valeur d'un jour de congé, de récupération ou de férié crédité dans le compteur : 39 ÷ 7 = 5 h 34 (choix du 03/11).
- Férié tombant un samedi ou un dimanche crédité (règle du registre des responsables).
- Temps de trajet compté comme temps de travail (comme dans le registre).
- Semaine mixte intervention + travail maison : ex. 4 × 9 h + 1 jour maison = 43 h pour un objectif de 38 h 12 →
  +4 h 48, dont 4 h à majorer 25 % et **0 h 48 classées dans aucun compteur** : à trancher par la paie.
- Règles de report des congés, période d'acquisition, arrondi : non inventées, laissées vides.
- Pauses courtes comptées ou non (réglage, désactivé par défaut).
