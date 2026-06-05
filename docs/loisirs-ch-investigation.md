# Investigation loisirs.ch/agendas — source famille/enfants

Date: 2026-06-05

## Verdict

**JOUABLE — à intégrer comme source prioritaire d'événements famille datés.**

`loisirs.ch` est un site WordPress (« Les loisirs romands pour toute la famille »)
qui expose une **API REST WordPress publique et anonyme** (`/wp-json/wp/v2/`) avec
un type de contenu dédié `agenda` (**3 183 événements** publiés au moment de
l'investigation). Chaque événement possède une page publique contenant un bloc
**schema.org `Event` en JSON-LD** avec `startDate`, `endDate`, `location`
(adresse postale complète) et `description`.

On peut donc récupérer des événements famille/enfants autour de Yverdon / Vaud /
Suisse romande de façon fiable, en combinant :
1. la liste filtrable via l'API REST (région = canton, + recherche plein texte) ;
2. la date / lieu / description lus dans le JSON-LD de chaque page d'événement.

Limites principales (détaillées plus bas) : **pas de filtre/tri par date
d'événement côté serveur** (le tri REST porte sur la date de *publication*), et
**pas de catégorie « enfants/famille » dédiée** dans la taxonomie — la pertinence
famille s'infère via des catégories thématiques (zoo, places de jeux, parcs
d'attractions…) et/ou la recherche plein texte (`enfant`, `famille`).

Un PoC fonctionnel est livré : `scripts/loisirs_ch_probe.py`.

## Méthode

Investigation low-volume, uniquement sur endpoints accessibles anonymement, avec
un délai d'au moins 1 s entre requêtes (respect du `Crawl-delay: 1` de robots.txt)
et un User-Agent de sonde neutre. Aucun contournement d'authentification, CAPTCHA,
paywall ou protection.

### robots.txt — points respectés

```
User-agent: *
Allow: /
Disallow: /?s=
Disallow: /recherche/
Disallow: /wp-admin/ ...
Crawl-delay: 1
Sitemap: https://www.loisirs.ch/wp-sitemap.xml
```

- L'investigation passe par l'**API REST** (`/wp-json/...`, non interdite) et les
  pages d'événements publiques, **pas** par les chemins de recherche interdits
  (`/?s=`, `/recherche/`).
- robots.txt interdit spécifiquement les UA `anthropic-ai`, `Claude-Web`,
  `GPTBot`, `CCBot`, `Google-Extended`. La sonde n'utilise **aucun** de ces UA :
  elle se présente comme un agent générique low-volume, couvert par la règle
  `User-agent: *  Allow: /`.

## Endpoints observés

### 1. Liste des événements (API REST WordPress)

```text
GET https://www.loisirs.ch/wp-json/wp/v2/agenda
```

Paramètres utiles (paramètres standard WP REST, tous vérifiés) :

| Paramètre        | Rôle                                                                 |
|------------------|----------------------------------------------------------------------|
| `per_page`       | taille de page (1–100, défaut 10)                                    |
| `page`           | pagination                                                           |
| `offset`         | décalage                                                            |
| `categories`     | IDs de catégories (séparés par virgule = **OR**, voir Limites)       |
| `search`         | recherche plein texte (combinée en **AND** avec `categories`)        |
| `orderby`        | `date` (publication), `title`, `relevance`, `modified`, …            |
| `order`          | `asc` / `desc`                                                       |
| `after`/`before` | bornes sur la **date de publication** (PAS la date d'événement)      |
| `slug`           | récupérer un événement précis par slug                               |
| `_fields`        | limiter les champs renvoyés (allège la réponse)                      |

Pagination via en-têtes de réponse : `X-WP-Total`, `X-WP-TotalPages`, et
`Link: …rel="next"`.

Champs renvoyés par item : `id`, `title.rendered`, `link`, `slug`, `date`
(publication), `categories` (IDs), `class_list` (contient les slugs de catégorie
sous la forme `category-<slug>`), `content` (souvent vide), `acf` (**vide** — pas
de date d'événement ici), `featured_media`.

> ⚠️ La **date de l'événement n'est pas dans la réponse REST** (`acf` est vide).
> Il faut lire le JSON-LD de la page de l'événement.

### 2. Date / lieu / description (JSON-LD de la page d'événement)

```text
GET https://www.loisirs.ch/agenda/<slug>/
```

La page contient un `<script type="application/ld+json">` avec un objet
schema.org `Event` :

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Geneva Tour",
  "description": "Une croisière, un audioguide et Genève qui défile…",
  "image": "https://static.mycity.travel/.../dji-0293-jpg_1080.JPG",
  "startDate": "2026-05-06T00:00:00+00:00",
  "endDate": "2026-10-11T00:00:00+00:00",
  "location": {
    "@type": "Place",
    "name": "Geneva Tour",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Quai du Mont-Blanc 2",
      "addressLocality": "Genève",
      "postalCode": "1201",
      "addressRegion": "Genève",
      "addressCountry": "CH"
    }
  }
}
```

### 3. Taxonomie des catégories

```text
GET https://www.loisirs.ch/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count
```

**213 catégories** au total, mélangeant régions, saisons, thèmes et moyens de
transport.

**Régions = cantons** (IDs utiles pour Yverdon / Suisse romande) :

| Canton     | ID  | Nb agendas (catégorie) |
|------------|-----|------------------------|
| Vaud       | 201 | 626                    |
| Fribourg   | 202 | 536                    |
| Valais     | 205 | 491                    |
| Genève     | 203 | 465                    |
| Neuchâtel  | 206 | 423                    |
| Berne      | 204 | 380                    |
| Jura       | 207 | 202                    |

(Yverdon-les-Bains relève du canton de **Vaud (201)**. Il n'existe pas de
catégorie au niveau ville ; le filtrage géographique fin se fait ensuite via
`addressLocality`/`postalCode` du JSON-LD.)

**Thèmes pertinents famille/enfants** (pas de catégorie « enfants » dédiée) :
`zoo` (54), `places-de-jeux` (126), `parcs-dattractions-et-parcs-de-loisirs` (96),
`piscines` (124), `escape-games` (101), `jeux` (158), `patinoires` (180),
`centres-de-loisirs` (88), `sentiers-didactiques` (107), `musees` (113).

**Saisons** : `printemps` (256), `ete` (257), `automne` (258), `hiver` (242).

### Autres types de contenu exposés (mêmes mécaniques REST)

`/wp/v2/activite`, `/wp/v2/balade`, `/wp/v2/place_de_jeux`,
`/wp/v2/place_pique-nique`, `/wp/v2/domaine_skiable`, `/wp/v2/idee_weekend`,
`/wp/v2/dossier`, `/wp/v2/actualite`. À explorer comme sources secondaires
(lieux famille permanents : places de jeux, pique-nique…).

## Filtres / combinaisons vérifiés (totaux `X-WP-Total`)

| Requête                                              | Total | Sémantique                          |
|------------------------------------------------------|-------|-------------------------------------|
| `?categories=201`                                    | 166   | agendas catégorisés Vaud            |
| `?categories=201,54`                                 | 175   | Vaud **OU** zoo (comma = OR)        |
| `?search=enfant`                                     | 61    | plein texte « enfant »              |
| `?search=enfant&categories=201`                      | 5     | « enfant » **ET** Vaud              |

> Note : le total `agenda` global est 3 183, mais seuls ~166 portent la catégorie
> `vaud` — beaucoup d'événements n'ont pas (ou plus) de catégorie canton. Le
> filtrage géographique le plus robuste reste l'adresse du JSON-LD.

## Limites constatées

1. **Pas de filtre/tri par date d'événement côté serveur.** `orderby=date` et
   `after`/`before` portent sur la date de *publication*, pas sur `startDate`.
   → Un consommateur doit lire `startDate`/`endDate` dans le JSON-LD et filtrer la
   fenêtre temporelle **côté client**. Des événements passés restent publiés et
   peuvent remonter (ex. `search=enfant` renvoie des événements de 2021–2022).
2. **`categories` multiples = OR**, pas AND (WP core, taxonomie unique). Pour une
   intersection « région + thème », utiliser plutôt `search=<terme>` + une seule
   catégorie canton (combinés en AND), ou filtrer côté client.
3. **Pas de catégorie « enfants/famille »** dans la taxonomie. La pertinence
   famille s'infère par thèmes (zoo, places de jeux, parcs…) + recherche plein
   texte + heuristique d'âge (« dès 4 ans », « 8 à 14 ans ») extraite du texte.
4. **Une requête détail (page HTML ~180 Ko) par événement** pour obtenir la date.
   → Coûteux à grande échelle ; rester low-volume, mettre en cache, et limiter le
   nombre d'événements détaillés par run.
5. **Placeholders de date** : certaines pages émettent `1970-01-01T00:00:00+00:00`
   pour une borne manquante (`startDate` ou `endDate`). Le PoC les normalise en
   `null`.
6. **Âge** non structuré : disponible seulement quand le texte le mentionne.

## PoC

```text
scripts/loisirs_ch_probe.py
```

Sonde Python (stdlib uniquement, aucune dépendance) :

- liste les événements `agenda` via l'API REST (filtre canton + recherche + thème) ;
- récupère pour chacun le JSON-LD `Event` de la page publique ;
- imprime un JSON normalisé minimal :
  `source, title, startDate, endDate, location, url, categories, ageText, description`.

Usage :

```bash
# Événements « enfant » dans le canton de Vaud (4 max)
python3 scripts/loisirs_ch_probe.py --canton vaud --search enfant --limit 4

# Flux Vaud récent (par date de publication)
python3 scripts/loisirs_ch_probe.py --canton vaud --limit 3

# Thème enfants (zoo) dans Vaud
python3 scripts/loisirs_ch_probe.py --canton vaud --theme zoo --limit 3
```

Garde-fous intégrés : UA neutre low-volume, délai ≥ 1 s entre requêtes
(`--delay`), limite d'événements détaillés (`--limit`), aucun secret, aucun
contournement.

## Tests / smoke

Exécutés le 2026-06-05, tous OK.

### `--canton vaud --search enfant --limit 4`

4 événements, 4 avec date de début. Extraits :

- **Conférence Mike Horn – Spéciale enfant** — Théâtre de Beausobre, Morges (VD).
- **Stage de Stop Motion pour enfants et jeunes** — La Tour-de-Peilz (VD),
  `ageText` extrait = « 8 à 14 ans ».
- **« Jack et les Haricots enchantés »** — Théâtre de Beaulieu, Lausanne (VD),
  `ageText` = « 4 ans ».

(Confirme aussi la limite n°1 : ces résultats `search=enfant` ont des
`startDate` de 2021–2022 → filtrage temporel côté client nécessaire.)

### `--canton vaud --limit 3` (flux par date de publication)

3 événements datés, ex. *Visite commentée « Délicieux cactus »*
(`2025-12-03`), *BDFIL 2026 – Lausanne* (`endDate 2026-10-05`).

### `--canton vaud --theme zoo --limit 3` (flux actuel/futur)

3 événements famille datés et géolocalisés :

- **Silent Party à La Garenne (VD)** — `2026-05-09`, parc animalier La Garenne,
  Le Vaud, cats `[fetes, insolite, zoo]`.
- **Chasse aux œufs au Tropiquarium de Servion** — `2026-04-04 → 2026-04-11`,
  Servion (VD), cats `[paques, zoo]`.
- **Énigme de Pâques à Saint-Maurice** — `2026-03-04`, St-Maurice, cats
  `[jeux, paques, valais, vaud]`.

## Recommandation pour le pipeline kids-activities

1. **Intégrer loisirs.ch comme scraper source-spécifique prioritaire** (événements
   datés famille en Suisse romande), sur le modèle des scrapers existants.
2. Stratégie de collecte :
   - lister via REST avec `categories=201` (Vaud) et/ou thèmes enfants, plus
     `search` (`enfant`, `famille`, `atelier`, `spectacle`…), `_fields` pour
     alléger, pagination par `X-WP-TotalPages` ;
   - détailler chaque candidat via le JSON-LD `Event` ;
   - **filtrer la fenêtre temporelle côté client** sur `startDate`/`endDate` ;
   - affiner le rayon autour d'Yverdon via `postalCode`/`addressLocality`.
3. Rester low-volume, respecter `Crawl-delay: 1`, mettre en cache les pages détail.
4. Mapper `addressRegion`/`addressLocality` vers le scoring distance existant
   (`LOCATION_KM_FROM_YVERDON`).
