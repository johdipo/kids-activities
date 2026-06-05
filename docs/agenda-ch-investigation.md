# Investigation agenda.ch — API publique

Date: 2026-06-05

## Verdict

agenda.ch est techniquement exploitable comme webapp/API publique, mais **pas comme source principale d'événements famille/enfants datés**.

La plateforme expose bien des endpoints publics anonymes pour l'autocomplete et les résultats de recherche, mais le produit est orienté **prise de rendez-vous avec des professionnels / institutions / salles**, pas agenda culturel ou familial. Les réponses contiennent surtout des catégories, professionnels, lieux et widgets de réservation, pas des événements avec date, horaire, prix, tranche d'âge, description d'activité, etc.

Conclusion opérationnelle pour TASK-204: **ne pas réintégrer agenda.ch comme source d'événements**. À garder éventuellement comme source secondaire très ciblée pour détecter des prestataires récurrents d'activités (ex. loisirs, sport, musique), mais avec une autre logique métier que la collecte d'événements datés.

## Méthode

Investigation low-volume, uniquement sur endpoints accessibles anonymement depuis le site public:

- Page d'accueil vérifiée: https://www.agenda.ch/
- Endpoint autocomplete “quoi”: https://pro.agenda.ch/fr/s/live_search_form?term=enfant
- Endpoint autocomplete lieux: https://pro.agenda.ch/fr/s/localities?term=Yverdon
- Page de recherche publique: https://agenda.ch/fr/s/loisirs/yverdon-les-bains?distance=10000

Aucun contournement d'authentification, CAPTCHA, paywall ou protection technique.

## Endpoints observés

### Autocomplete catégories / professionnels / agendas

```text
GET https://pro.agenda.ch/fr/s/live_search_form?term=<query>
```

Paramètre utile:

- `term`: recherche texte.

Forme de réponse observée:

```json
{
  "occupations": [],
  "pro_users": [
    {
      "name": "...",
      "link": "/fr/s/...",
      "image_url": "...",
      "region": "...",
      "occupation": "..."
    }
  ],
  "pro_users_count_comment": "premiers 10 résultats",
  "agendas": [],
  "agendas_count_comment": []
}
```

Exemples testés:

- `enfant`: retourne des professionnels/agendas, mais pas des événements.
- `famille`: retourne notamment des entrées loisirs/animateur hors région immédiate.
- `cours`: retourne une catégorie `Cours de fitness` et des agendas/professionnels.
- `musique`, `danse`, `tennis`: quelques professionnels/agendas, pas d'événements.

### Autocomplete lieux

```text
GET https://pro.agenda.ch/fr/s/localities?term=<query>
```

Exemple observé pour `Yverdon`:

```json
[
  "Yverdon-les-Bains",
  "Montagny-près-Yverdon",
  "Essertines-sur-Yverdon",
  "Belmont-sur-Yverdon"
]
```

### Résultats de recherche HTML

```text
GET https://agenda.ch/fr/s/<what>/<where>?distance=10000
GET https://agenda.ch/fr/s/jsresults?what=<what>&where=<where>&distance=10000
```

Paramètres utiles:

- `what`: catégorie/mot-clé, ex. `loisirs`, `tennis`, `cours`.
- `where`: localité, ex. `Yverdon-les-Bains`.
- `distance`: distance en mètres.
- `page`: pagination HTML disponible sur certaines recherches.

Les résultats sont des fiches de type professionnel/local business et incluent parfois un lien widget de réservation, par exemple `*.agenda.ch/widget`.

## Limites constatées

- Pas de date/heure d'événement dans les résultats de recherche.
- Pas de structure “event” exploitable observée; les données structurées sont orientées `SearchResultsPage` / `LocalBusiness`.
- Les termes famille/enfant ne filtrent pas fortement vers des activités enfants locales.
- Certains mots-clés génériques (`famille`, `tennis`) retombent sur des résultats très larges ou non pertinents.
- Les widgets de réservation peuvent donner des créneaux de rendez-vous/prestation, mais ce n'est pas équivalent à un calendrier d'événements publics.

## Recommandation

Pour le pipeline kids-activities:

1. **Ne pas utiliser agenda.ch dans le flux “événements datés”.**
2. Si on veut exploiter agenda.ch, créer un flux séparé “prestataires / activités récurrentes”, avec scoring humain ou semi-automatique.
3. Prioriser plutôt les sources qui publient réellement des événements datés: communes, musées, bibliothèques, centres culturels, écoles de sport/loisirs, plateformes événementielles locales.

## PoC

Un script minimal est disponible ici:

```text
scripts/agenda_ch_probe.py
```

Il interroge uniquement les endpoints publics anonymes et affiche les résultats structurés utiles pour décider de la pertinence.
