# Kids Activities — Retours de goût de Johan (source de vérité pour le scoring/curation)

Ce fichier consigne les retours explicites de la famille sur les événements proposés.
Il doit guider le scoring déterministe ET la passe LLM de curation (TASK-231).

## Règles de goût (mises à jour 2026-08-25, retour Johan)

- **Priorité aux nouveautés et événements ponctuels** (datés, one-off) plutôt qu'aux
  expos/activités permanentes ou récurrentes. Un événement déjà passé/déjà fait ne doit
  plus remonter.
- **Ne jamais reproposer un événement déjà montré/déjà fait** (mémoire anti-répétition).
  Ex. : l'expo Pro Natura « abeilles » est permanente ET déjà faite → à ne plus mettre en avant.
- **Pro Natura Champ-Pittet** : bien, mais **pas exceptionnel**. Acceptable en complément,
  jamais en tête, et pas chaque semaine.
- **Art** : la famille **n'apprécie pas trop l'art** (expos d'art, vernissages, ateliers
  artistiques purs) → **déprioriser** nettement (malus), sauf angle clairement famille/enfant marqué.
- **Balades / visites guidées génériques** (ex. « Balades découverte de Môtiers ») :
  **rien d'exceptionnel** → déprioriser les visites/balades passe-partout sans accroche forte.
- **Ce qui plaît** (rappel profil La Dérivée) : festivals, fêtes de village, terroir,
  plein-air, ateliers enfants concrets, nature/animaux/science, découverte, eau.
  Andy : intellectuel, sciences, ateliers. Lennon : animaux, insectes, nature, exploration.

## Format digest
- **Top 10** (au lieu de top 5) pour que Johan puisse repérer les erreurs de ranking.
- Johan doit pouvoir **faire un retour** (👍/👎 par event) qui met à jour ce fichier / les poids.

## Comment donner un retour (boucle de feedback — TASK-231)
Deux façons, toutes deux persistées et **appliquées au run suivant** :

1. **Sur Telegram**, écris à Isaak : `feedback: <mot-clé ou titre> <+/-> <raison>`
   (ex. `feedback: abeilles -- déjà fait, permanent` ou `feedback: festival ++ on adore`).
   Isaak lance la commande ci-dessous pour toi.
2. **En ligne de commande** (ce que fait Isaak) :
   ```bash
   node automation/feedback.js "<mot-clé>" <++|+|-|--|👍|👎|±N> "raison"
   ```
   - `++` = +20, `+` = +12, `-` = -12, `--` = -25 (ou un nombre signé explicite, ex. `-30`).
   - Le mot-clé est comparé (sans accents/casse) au titre / tags / source / ville de chaque event.
   - Écrit une règle dans `automation/state/taste-feedback.json` (relue par le scoring) **et**
     une ligne d'historique ici.

## Anti-répétition (mémoire des envois)
Chaque event réellement envoyé dans le digest est mémorisé dans
`automation/state/shown-events.json` (via `automation/record_shown.js`, après l'envoi). Un event déjà
montré dans les **56 derniers jours** n'est **jamais reproposé** (exclusion dure de la shortlist).

## Re-rank LLM (qualité)
La shortlist déterministe (~top 18 après curation goûts) passe par une passe **LLM** qui juge l'attrait
famille réel et écrit un « pourquoi » par event. Coût borné (~18 events). **Fallback déterministe
obligatoire** : toute erreur/timeout/limite modèle garde l'ordre déterministe (le digest ne casse jamais).
Désactivable ponctuellement avec `KA_RERANK=0`. Aucun modèle n'est hardcodé (hérite du défaut OpenClaw).

## Historique des retours bruts
- 2026-08-25 (Johan, via feedback CLI) : 👎 «abeilles» (-25) — expo permanente déjà faite, ne plus proposer
- 2026-08-25 (Johan) : « les expos Pro Natura sont biens mais pas exceptionnelles ; l'expo abeilles
  est permanente et déjà faite → privilégie les nouveautés et events ponctuels. On n'apprécie pas
  trop l'art. Balades et découverte de Môtiers : rien d'exceptionnel. Top 10 au lieu de top 5.
  Je dois pouvoir faire un retour sur nos goûts. »
