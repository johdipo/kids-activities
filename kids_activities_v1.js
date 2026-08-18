#!/usr/bin/env node
/* Kids Activities v0.2 - source-specific scrapers + quality/scoring artifacts */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');
const cheerio = require('cheerio');

const TZ = 'Europe/Zurich';
const FAMILY = {
  andy: { name: 'Andy', age: 6, tags: ['science', 'culture', 'sport', 'water', 'food', 'indoor', 'discovery'] },
  lennon: { name: 'Lennon', age: 4, tags: ['animals', 'nature', 'outdoor', 'discovery'] },
  johan: { name: 'Johan', tags: ['sport', 'outdoor', 'mountain', 'nature', 'science', 'culture', 'food'] },
  daisy: { name: 'Daisy', tags: ['walk', 'mountain', 'cosy', 'culture', 'indoor', 'food'] }
};
const LOCATION_KM_FROM_YVERDON = {
  'yverdon-les-bains': 0,
  yverdon: 0,
  grandson: 5,
  concise: 13,
  yvonand: 10,
  orbe: 12,
  vallorbe: 23,
  champvent: 8,
  chavornay: 13,
  pomy: 4,
  'essert-pittet': 15,
  'la sarraz': 15,
  'sainte-croix': 23,
  'cheseaux-noreaz': 5,
  'cheseaux-noréaz': 5,
  'romainmotier': 20,
  'romainmôtier': 20,
  mollendruz: 32,
  echallens: 18,
  assens: 22,
  bercher: 15,
  sottens: 21,
  sugnen: 14,
  sugnens: 14,
  'poliez-pittet': 19,
  froideville: 28,
  goumoens: 18,
  'goumoens-la-ville': 18,
  lausanne: 39,
  morat: 38,
  murten: 38,
  'münchenwiler': 40,
  muenchenwiler: 40,
  avenches: 30,
  salavaux: 33,
  'vully-les-lacs': 34,
  vallamand: 34,
  'mur (vully)': 35,
  chabrey: 33,
  constantine: 35,
  montmagny: 32,
  'villars-le-grand': 30,
  bellerive: 36,
  cudrefin: 42,
  // Parc naturel régional Jura vaudois (Vallée de Joux / Jura-Nord vaudois)
  'mont-la-ville': 28,
  'l\'isle': 30,
  'le pont': 33,
  'l\'abbaye': 35,
  'le sentier': 42,
  'le chenit': 45,
  'le brassus': 48,
  // Vallée de Joux Tourisme localities (Lac de Joux / Jura vaudois) not already listed
  'le lieu': 40,
  'le solliat': 44,
  'l\'orient': 44,
  'les esserts-de-rive': 40,
  'saint-cergue': 60,
  'saint cergue': 60,
  'st-cergue': 60,
  givrine: 62,
  'la givrine': 62,
  payerne: 25,
  'corcelles-pres-payerne': 27,
  'corcelles-près-payerne': 27,
  // Office des Vins Vaudois agenda — vignoble vaudois (Côtes de l'Orbe / Bonvillars
  // proches d'Yverdon, Lavaux / La Côte / Chablais plus lointains).
  bonvillars: 8,
  villeneuve: 62,
  yens: 40,
  vullierens: 42,
  epesses: 52,
  fechy: 42,
  'féchy': 42,
  begnins: 55,
  'saint-prex': 52,
  cully: 50,
  rolle: 50,
  riex: 51,
  'estavayer-le-lac': 22,
  estavayer: 22,
  'praz (vully)': 35,
  praz: 35,
  vully: 35,
  morges: 48,
  neuchatel: 39,
  neuchâtel: 39,
  // Buskers Festival de Neuchâtel: rue/vieille ville de Neuchâtel + volet
  // dominical familial à La Ramée (plage/rive du lac), à Marin-Epagnier.
  'marin-epagnier': 44,
  marin: 44,
  fribourg: 55,
  // Jura & Trois-Lacs (J3L) — communes en scope du rayon Yverdon (rive sud du lac /
  // Broye / Val-de-Travers). Distances routières approx. depuis les coordonnées géo
  // de l'agenda J3L (≈ vol d'oiseau × 1.3).
  cheyres: 15,
  buttes: 18,
  fleurier: 19,
  motiers: 19,
  'môtiers': 19,
  boveresse: 21,
  noiraigue: 26,
  fetigny: 27,
  'fétigny': 27,
  bevaix: 30,
  cortaillod: 31,
  gletterens: 34,
  'la chaux-du-milieu': 34,
  'les charbonnieres': 36,
  'les charbonnières': 36,
  colombier: 35,
  auvernier: 37,
  portalban: 38,
  peseux: 39,
  geneve: 85,
  genève: 85
};
const SOURCES = {
  grandson: {
    url: 'https://www.grandson.ch/vie-locale/agenda-des-manifestations/',
    kind: 'communal-agenda'
  },
  yverdon: {
    url: 'https://yverdonlesbainsregion.ch/agenda/',
    kind: 'tourism-agenda'
  },
  ovv: {
    url: 'https://www.ovv.ch/agenda',
    baseUrl: 'https://www.ovv.ch',
    // Office des Vins Vaudois — agenda du vignoble vaudois (caves ouvertes, bars à
    // vins, balades gourmandes, portes ouvertes, fêtes du terroir). Fit fort avec le
    // signal La Dérivée / terroir / familles; couvre les 6 régions AOC dont les Côtes
    // de l'Orbe / Bonvillars, proches d'Yverdon.
    kind: 'wine-region-terroir-agenda'
  },
  emoi: {
    url: 'https://www.emoi.ch/agenda-culturel',
    apiUrl: 'https://geocity.ch/rest/agenda',
    domain: 'agenda_culture',
    kind: 'official-yverdon-cultural-geocity-agenda'
  },
  yverdonVille: {
    url: 'https://www.yverdon-les-bains.ch/medias/agenda',
    apiUrl: 'https://geocity.ch/rest/agenda',
    // Official Ville d'Yverdon-les-Bains Geocity agendas. `agenda_culture` is
    // intentionally excluded: it is the same domain already harvested by `emoi`.
    // `agenda_jardins` is exposed by the site but currently empty; it is kept so
    // future content is picked up automatically without code changes.
    themes: [
      { domain: 'agenda_sports', label: 'Sport & activité physique', page: 'https://www.yverdon-les-bains.ch/sports-et-activite-physique/agenda' },
      { domain: 'agenda_jecos', label: 'Jeunesse & cohésion sociale', page: 'https://www.yverdon-les-bains.ch/votre-commune/les-services-de-ladministration/jeunesse/agenda' },
      { domain: 'agenda_jardins', label: 'Jardins & nature en ville', page: 'https://www.yverdon-les-bains.ch/medias/agenda' }
    ],
    kind: 'official-city-geocity-agenda'
  },
  infomaniakYverdon: {
    url: 'https://infomaniak.events/fr-ch/yverdon-les-bains',
    kind: 'ticketing-agenda'
  },
  agendaCh: {
    url: 'https://agenda.ch/fr/s/jsresults?where=Yverdon-les-Bains&distance=20000&search_form=true',
    kind: 'appointment-directory-probe'
  },
  laDerivee: {
    url: 'https://www.laderivee.ch/page/programme',
    apiUrl: 'https://admin.laderivee.ch/api/supermassive/event/segment/5',
    kind: 'summer-cultural-place'
  },
  orbe: {
    url: 'https://www.orbe.ch/agenda-manifestations.%20html',
    apiUrl: 'https://geocity.ch/rest/agenda',
    kind: 'geocity-communal-agenda'
  },
  vallorbe: {
    url: 'https://www.vallorbe.ch/agenda?datumVon=11.06.2026&datumBis=21.06.2027',
    kind: 'iweb-communal-agenda'
  },
  sainteCroix: {
    url: 'https://www.sainte-croix.ch/evenements?datumVon=18.06.2026&datumBis=18.06.2027',
    baseUrl: 'https://www.sainte-croix.ch',
    kind: 'iweb-communal-cultural-agenda'
  },
  champvent: {
    url: 'https://champvent.ch/actualite',
    manifestationsUrl: 'https://champvent.ch/manifestations',
    olderUrl: 'https://champvent.ch/index.php?p=1_9&pid=2',
    baseUrl: 'https://champvent.ch',
    kind: 'communal-news-and-manifestations'
  },
  echallens: {
    url: 'https://www.echallens.ch/vivre-a-echallens/manifestations/calendrier-des-manifestations/flat.html',
    baseUrl: 'https://www.echallens.ch',
    kind: 'jcalpro-communal-manifestations-agenda'
  },
  echallensTourisme: {
    url: 'https://echallens-tourisme.ch/evenements/',
    baseUrl: 'https://echallens-tourisme.ch',
    kind: 'regional-tourism-events-agenda'
  },
  tempsLibre: {
    url: 'https://www.tempslibre.ch/romandie/evenements/ce-week-end',
    kind: 'romandie-cultural-weekend-agenda'
  },
  theatreDuPassage: {
    url: 'https://www.theatredupassage.ch/abonnements/passdecouverte/passfamille',
    listUrl: 'https://www.theatredupassage.ch/accueil/liste',
    baseUrl: 'https://www.theatredupassage.ch',
    kind: 'official-family-theatre-agenda'
  },
  lePommier: {
    url: 'https://lepommier.ch/event/?type=SmV1bmUgcHVibGlj',
    baseUrl: 'https://lepommier.ch',
    kind: 'official-young-audience-theatre-agenda'
  },
  theatreBennoBesson: {
    url: 'https://www.theatrebennobesson.ch/jeunepublic',
    baseUrl: 'https://www.theatrebennobesson.ch',
    kind: 'official-young-audience-theatre-agenda'
  },
  echandole: {
    url: 'https://echandole.ch/',
    baseUrl: 'https://echandole.ch',
    kind: 'official-theatre-family-agenda'
  },
  leProgrammeVaudKids: {
    url: 'https://vd.leprogramme.ch/spectacle-enfants',
    baseUrl: 'https://vd.leprogramme.ch',
    kind: 'vaud-child-family-theatre-aggregator'
  },
  neuchatelVille: {
    url: 'https://www.neuchatelville.ch/sortir-et-decouvrir/agenda',
    baseUrl: 'https://www.neuchatelville.ch',
    kind: 'official-city-culturoscope-agenda'
  },
  avenches: {
    url: 'https://www.avenches.ch/fr/Z14820/agenda-des-manifestations',
    // The MyCity Tourism React app exposes the full agenda as JSON via the
    // `?_format=json` variant of the page id (the page bundle sets
    // window.jsonPath to this URL). One request returns the whole upcoming
    // list (`end: "end"`), so no pagination is needed.
    apiUrl: 'https://www.avenches.ch/fr/Z14820?_format=json',
    baseUrl: 'https://www.avenches.ch',
    kind: 'mycity-tourism-broye-events-agenda'
  },
  valleeDeJoux: {
    url: 'https://www.myvalleedejoux.ch/fr/Z14737/agenda-des-evenements',
    // Vallée de Joux Tourisme runs on the same MyCity Tourism CMS as `avenches`
    // (Z-code page ids, React app). The full agenda is exposed as JSON via the
    // `?_format=json` variant of the agenda page id; one request returns the whole
    // upcoming list (`end: "end"`), so no pagination is needed. Same event shape as
    // avenches (`dates.start`/`dates.end` in YYYY/MM/DD, `location` town string,
    // `categories[].label`). Time/price/age live only on the P-code detail pages,
    // so they are filled by the generic conditional-enrichment layer.
    apiUrl: 'https://www.myvalleedejoux.ch/fr/Z14737?_format=json',
    baseUrl: 'https://www.myvalleedejoux.ch',
    kind: 'mycity-tourism-vallee-de-joux-events-agenda'
  },
  fribourgTerroir: {
    url: 'https://fribourg.ch/fr/terroir-fribourg/agenda/',
    // FribourgRégion (ex fribourgregion.ch -> fribourg.ch) is an Understrap
    // WordPress site. The `event` post type is exposed on the public WP REST
    // API. The canton-wide list is 845 events, so we scope by the `region`
    // taxonomy to the two Broye / lakeside areas that fit Johan's terroir /
    // Lac de Morat / Estavayer-Payerne taste (regions 182 + 194); event dates,
    // times, prices and venue live only on the detail pages (`#horaires`,
    // `#tarifs`, `#description`), so each scoped event is enriched from its page.
    apiUrl: 'https://fribourg.ch/fr/wp-json/wp/v2/event',
    regions: { 182: 'Estavayer-le-Lac / Payerne (Broye)', 194: 'Région Lac de Morat (Morat / Vully)' },
    baseUrl: 'https://fribourg.ch',
    kind: 'fribourgregion-wp-rest-broye-lac-events'
  },
  payerne: {
    url: 'https://www.payerne.ch/manifestations/',
    baseUrl: 'https://www.payerne.ch',
    // www.payerne.ch serves a valid DigiCert leaf but omits its intermediate
    // from the TLS handshake, and the host blocks outbound port-80 AIA fetching,
    // so Node fetch and plain curl both fail to build the chain. We keep TLS
    // verification ON by passing a shipped chain bundle (the DigiCert Global G2
    // TLS RSA SHA256 2020 CA1 intermediate + DigiCert Global Root G2) to
    // curl --cacert instead of disabling verification with -k.
    caBundle: 'assets/payerne-digicert-chain.pem',
    kind: 'communal-manifestations-broye-agenda'
  },
  vullyLesLacs: {
    // Commune de Vully-les-Lacs (Vaud, Broye-Vully): lakeside/vineyard terroir
    // village agenda, distinct from the Fribourg-canton `fribourgTerroir` and the
    // Broye tourism `avenches`/`payerne` sources. Strong La Dérivée / caves-ouvertes
    // / free-festival taste fit (Vully blues, openair plage de Salavaux, Gâteaux du
    // Vully, marché printanier, VullyRun). I-Web CMS: the agenda renders as static
    // Bootstrap `.media` cards paginated at `/agenda/<page>` — upcoming events use a
    // `<span>day</span>monthAbbrev` date (no year, chronological ascending) while past
    // events switch to a `<span>dd.m.</span>YYYY` format, so upcoming events are read
    // until the first past-format card. There is no per-event detail page, so events
    // use a stable hash fragment of the agenda page as URL and keep the card's
    // flyer/info link in officialSources.
    url: 'https://vully-les-lacs.ch/agenda',
    baseUrl: 'https://vully-les-lacs.ch',
    kind: 'iweb-communal-vully-lakeside-agenda'
  },
  murtenMorat: {
    // Ville de Morat / Stadt Murten (bilingue, rive du lac de Morat): agenda
    // communal officiel des manifestations. Ville touristique lacustre médiévale —
    // fort ancrage La Dérivée / festivals gratuits / famille (Stadtfest Murten,
    // Open Air Kino, Freilicht-Theater «Murten 1476», Murtenlauf, Brocante,
    // Spielfest famille, marchés de Noël/Saint-Martin). Distinct du `fribourgTerroir`
    // (couche tourisme cantonale, régions 182+194) car ce sont les manifestations
    // communales de la Ville, et distinct de `vullyLesLacs`/`payerne`/`avenches`.
    // CMS I-Web comme Sainte-Croix/Vallorbe: la page `/anlaesseaktuelles` expose la
    // charge utile JSON `#anlassList[data-entities]` (id, name+lien `/_rte/anlass/<id>`,
    // ort, lokalitaet, datumVon/datumBis en epoch ms, organisator). Chaque événement
    // utilise sa page de détail `/_rte/anlass/<id>` comme URL stable et est enrichi
    // (heure «HH.MM Uhr», prix, description en allemand).
    url: 'https://www.murten-morat.ch/anlaesseaktuelles',
    baseUrl: 'https://www.murten-morat.ch',
    kind: 'iweb-communal-morat-lakeside-agenda'
  },
  chavornay: {
    // Commune de Chavornay (Nord vaudois, ~13 km d'Yverdon, sur la plaine de l'Orbe
    // entre Orbe et Yverdon) : agenda communal officiel des manifestations. Commune
    // encore non couverte (distincte de `orbe`/`grandson`/`champvent`), avec un vrai
    // volet famille/jeunesse/village — programme d'activités été EJED (enfance
    // jeunesse), café contact & créatif, marché villageois, fêtes et manifestations
    // locales — bon fit famille / village / terroir (signal de goût Johan). Même CMS
    // I-Web que `murtenMorat`/`sainteCroix`/`vallorbe` : la page `/anlaesseaktuelles`
    // expose la charge utile JSON `#anlassList[data-entities]` (id, name+lien, ort,
    // lokalitaet, datumVon/datumBis en epoch ms, organisator). Chaque événement utilise
    // sa page de détail `/anlaesseaktuelles/<id>` (le lien brut `/_rte/anlass/<id>`
    // redirige 301 vers cette forme canonique) comme URL stable et est enrichi
    // (description, prix « entrée libre »/CHF, horaire éventuel depuis le corps FR).
    // Distinct de `j3l` (agenda touristique régional) : ce sont les manifestations
    // communales (dont civiques) portées par la Commune ; le dédup URL/reco en aval
    // absorbe d'éventuels recoupements avec la couche tourisme.
    url: 'https://www.chavornay.ch/anlaesseaktuelles',
    baseUrl: 'https://www.chavornay.ch',
    kind: 'iweb-communal-nord-vaudois-agenda'
  },
  laSauge: {
    // Centre-Nature BirdLife de La Sauge (La Sauge 1588 Cudrefin, VD), sur la rive
    // NE du lac de Neuchâtel entre les réserves du Fanel et de Cudrefin, au coeur de
    // la Grande Cariçaie. Fort ancrage La Dérivée / plein-air / lac / nature en
    // famille (activités mensuelles pour tous: «Ça grouille dans la mare !»,
    // «Dimanche nature», camps enfants, chauves-souris, EuroBirdwatch, journée de la
    // biodiversité). Distinct des sources existantes: c'est un centre-nature, pas une
    // commune ni la couche tourisme cantonale — Cudrefin/Estavayer côté événements
    // n'exposent pas cet agenda (fribourgTerroir 182 couvre le tourisme, pas La Sauge).
    // Page Drupal: l'agenda est un corps HTML rédigé à la main, une section
    // `div.collapse[id=<mois>]` par mois (juin→novembre), chaque événement délimité
    // par un `<hr>` avec `<h4>` date+horaire, `<p><strong>` titre, `<p>` description,
    // `<p><i>` liens (Pour en savoir plus / inscription / Prix). Pas de page de détail
    // par événement, donc chaque événement utilise un fragment `#sha(titre|date)`
    // stable de la page agenda et conserve le lien «Pour en savoir plus» en
    // officialSources. L'année de base vient de «programme annuel YYYY».
    url: 'https://www.birdlife.ch/fr/content/la-sauge-agenda',
    baseUrl: 'https://www.birdlife.ch',
    kind: 'nature-center-birdlife-lakeside-family-agenda'
  },
  parcJuraVaudois: {
    // Parc naturel régional Jura vaudois — programme d'activités (excursions,
    // visites, ateliers) dans la Vallée de Joux / Jura-Nord vaudois (Le Sentier,
    // Le Chenit, Mont-la-Ville, Saint-Cergue, Col de la Givrine…). ~19-30 sorties
    // guidées nature/paysage/terroir par an, en petits groupes, souvent en famille
    // (balade de l'herboriste, potager, chauves-souris, brame du cerf, champignons,
    // contes d'hiver autour du feu, âne, refuges forestiers gourmands). Fort ancrage
    // La Dérivée / plein-air / découverte / terroir, et région DISTINCTE des sources
    // existantes (aucune couvre le Parc Jura vaudois / Vallée de Joux).
    // Plateforme: le site tourne sur le réseau suisse des parcs (angebote.paerke.ch).
    // La page /fr/activites est un listing statique `#posts-list a.mozaic-link`, une
    // carte par activité avec `.date` (JJ.MM, sans année), `.time` (HH:MM > HH:MM),
    // `.location` et un `<h3>` titre; chaque carte lie une page de détail stable
    // `/fr/loisir/<id>` (description, «Lieu de rendez-vous» avec NPA+localité, «Prix»
    // avec tarifs adulte/enfant). Le listing est trié chronologiquement, donc les
    // années sont résolues dans l'ordre (assignParcJuraVaudoisYears).
    url: 'https://parcjuravaudois.ch/fr/activites',
    baseUrl: 'https://parcjuravaudois.ch',
    kind: 'regional-nature-park-family-activities-agenda'
  },
  champPittet: {
    // Centre Pro Natura de Champ-Pittet (Cheseaux-Noréaz, 5 km d'Yverdon), le grand
    // centre nature famille au bord de la Grande Cariçaie / lac de Neuchâtel: ateliers
    // enfants, sentiers découverte, expos (intérieures & extérieures), bibliothèque
    // mobile, bain de forêt, Fête des familles. Fort ancrage La Dérivée / plein-air /
    // nature / lac / famille. Distinct des sources existantes: `emoi` ne surface qu'un
    // sous-ensemble Geocity de Champ-Pittet, `laSauge` est l'autre centre nature (rive
    // NE, Cudrefin); ce site officiel expose l'agenda complet de Champ-Pittet.
    // Plateforme: listing Drupal `.cards__wrapper a.card` (une carte par événement:
    // `.card__date` start/end + `.card__title` + `.card__tags` catégorie), paginé via
    // `?page=N` ("Les entrées a-b de N sont affichées"). Chaque carte lie une page de
    // détail `/fr/<slug>` qui embarque un schema.org Event (JSON-LD name/description +
    // offers) et un champ visible "Heure HH:MM - HH:MM" en heure LOCALE (les dates
    // JSON-LD sont en UTC, à ne pas utiliser telles quelles). Les dates de la carte
    // (query-string startDate/endDate DD.MM.YYYY) sont numériques et sans ambiguïté.
    url: 'https://www.pronatura-champ-pittet.ch/fr/agenda',
    baseUrl: 'https://www.pronatura-champ-pittet.ch',
    kind: 'nature-center-pronatura-lakeside-family-agenda'
  },
  buskers: {
    // Buskers Festival de Neuchâtel (demandé par Johan 2026-08-06): le plus ancien
    // festival de musique & arts de la rue de Suisse (depuis 1990), chaque été dans
    // la vieille ville / zone piétonne de Neuchâtel — déambulation, cirque, concerts,
    // modèle "chapeau"/soutien participatif (programme vendu CHF 10, spectacles de rue
    // gratuits) → fort ancrage La Dérivée / plein-air / famille. Comprend un volet
    // dominical familial à La Ramée (plage/rive du lac à Marin-Epagnier). La home
    // WordPress/Elementor mélange plusieurs éditions (textes 2023/2025 résiduels), donc
    // la source lit la page /programme/horaires/ qui porte l'édition courante DATÉE avec
    // l'année ("Du mardi 11 au samedi 15 août 2026 …", "Dimanche 16 août à la Ramée à
    // Marin de 11h00 à 18h00"). Les horaires par artiste ne sont pas en ligne (uniquement
    // dans le programme papier payant), donc l'extraction reste au niveau festival:
    // l'événement principal (rue de Neuchâtel, multi-jours) + la journée La Ramée.
    url: 'https://www.buskersfestival.ch/programme/horaires/',
    baseUrl: 'https://www.buskersfestival.ch',
    kind: 'street-arts-festival-neuchatel-agenda'
  },
  castrum: {
    // Le Castrum (demandé par Johan 2026-08-06): festival pluridisciplinaire
    // d'Yverdon-les-Bains depuis 1979, chaque été au cœur historique (esplanade du
    // Château / castrum romain, Place Pestalozzi) — arts de la scène, cirque, concerts,
    // installations, ateliers, déambulations, DJ sets, **majoritairement gratuit** →
    // excellent fit La Dérivée / plein-air / famille, en plein centre-ville d'Yverdon
    // (donc 0 km). Le site est un front SvelteKit + back Payload: la page /programme
    // expose un endpoint devalue `/programme/__data.json` propre — chaque événement
    // porte titre, slug, catégorie, booking et une liste de sessions {location,
    // startDate, endDate} en **UTC** (converties DST-aware vers Europe/Zurich). L'édition
    // courante est datée par sa liste de sessions, donc quand une nouvelle édition est
    // publiée la source la capte automatiquement (et retourne 0 event hors saison).
    url: 'https://le-castrum.ch/programme/__data.json',
    baseUrl: 'https://le-castrum.ch',
    eventBase: 'https://le-castrum.ch/programme/',
    kind: 'sveltekit-payload-festival-agenda-yverdon'
  },
  j3l: {
    // Jura & Trois-Lacs (J3L) — agenda régional touristique du Pays des Trois-Lacs
    // (Pays de Neuchâtel, canton du Jura, Bienne-Seeland, Grand Chasseral, Lac de
    // Morat/Estavayer-le-Lac, Nord vaudois). Système MyCity Tourism: la page /agenda
    // embarque une GeoJSON FeatureCollection dans `#list-data` (~1600 manifestations)
    // avec, par événement, coordonnées géo, ville, région, catégorie, description et
    // dateFrom/dateTo — pas de pagination ni de JS à exécuter, tout est en clair.
    // Le canton entier est trop large (task warning « over-broad canton coverage »),
    // donc la source est **géo-restreinte** à un rayon de RADIUS_KM à vol d'oiseau
    // autour d'Yverdon: ne garde que le Nord vaudois + rive sud du lac de Neuchâtel /
    // Broye / Val-de-Travers proches (festivals, fêtes de village, marchés terroir,
    // plein-air — fit La Dérivée). Ce rayon exclut de fait Neuchâtel-ville (~38 km,
    // déjà `neuchatelVille`) et le Jura/Bienne lointains; le dédup URL/recommandation
    // en aval absorbe les recoupements avec `castrum`/`payerne`/`fribourgTerroir`.
    url: 'https://www.j3l.ch/fr/Z10818/a-faire/manifestations/agenda',
    baseUrl: 'https://www.j3l.ch',
    radiusKm: 30,
    kind: 'regional-tourism-geojson-agenda-geoscoped'
  },
  grandsonChateau: {
    // Château de Grandson — agenda propre du château (Place du Château, 1422 Grandson,
    // ~5 km d'Yverdon). Distinct de la source `grandson` (agenda de la COMMUNE de
    // Grandson): ici c'est le programme événementiel du château médiéval lui-même —
    // Fête Médiévale, ateliers enfants (« Mon armoirie à moi »), spectacles jeune public
    // (« La Légende du Chevalier Vert »), visites guidées gratuites mensuelles, Journée
    // des châteaux suisses, concerts dans les caves, cafés scientifiques. Fort ancrage
    // famille / patrimoine / plein-air (esplanade + cour du château) → bon fit La Dérivée.
    // Plateforme: WordPress (thème Tailwind "grandson-theme", Antistatique). La page
    // /agenda/ rend des cartes statiques (grille `grid-cols-[1fr_2fr_1fr]`) portant titre,
    // date FR (jour unique, week-end « X et Y », liste « 12, 16, 19 et 23 », ou range
    // « du X au Y »), horaire « HHhMM - HHhMM », et des tags mêlant catégorie / public
    // (« Dès 8 ans », « Tout public ») / prix (« Gratuit »). Chaque carte lie une page
    // de détail `/agenda/<slug>/` (Yoast JSON-LD description + encart « Informations
    // pratiques » Date/Horaires/Tarifs + lien billetterie/organisateur externe).
    url: 'https://chateau-grandson.ch/agenda/',
    baseUrl: 'https://chateau-grandson.ch',
    kind: 'wordpress-castle-family-heritage-agenda'
  },
  maisonAilleurs: {
    // Maison d'Ailleurs — musée de la science-fiction, de l'utopie et des voyages
    // extraordinaires (Place Pestalozzi 14, Yverdon-les-Bains, ~0 km). Institution
    // familiale phare d'Yverdon avec une vraie programmation « ATELIER KIDS » (BD,
    // création, crea-lab en libre-service l'été), des soirées immersives (Horror Night),
    // vernissages/expos et journées anniversaire familiales → fort ancrage science /
    // culture / découverte pour Andy & famille, distinct de toutes les sources agenda
    // touristiques (n'y figure pas). Plateforme WordPress: le custom post type
    // `activites` est exposé proprement en clair via l'API REST
    // `/wp-json/wp/v2/activites`. Les champs ACF ne passent pas par REST, mais chaque
    // activité porte sa date dans le SLUG (`<titre>-JJ-MM-AAAA`, ou range même mois
    // `<titre>-J1-J2-MM-AAAA`) — anchor déterministe — et le corps HTML porte les lignes
    // structurées date FR / horaire (« 14h-16h », « Départ à 19h30 ») / public (« Enfants
    // dès 8 ans », « Tout public ») / prix (« CHF 20.- par enfant », « Accès libre »).
    // Le corps sert à enrichir horaire/âge/prix; le slug fait foi pour la date.
    url: 'https://ailleurs.ch/wp-json/wp/v2/activites?per_page=100&_fields=slug,link,title,content,type_activites',
    baseUrl: 'https://ailleurs.ch',
    kind: 'wordpress-rest-museum-family-activities-yverdon'
  },
  museeYverdon: {
    // Musée d'Yverdon et région (MY) — musée d'histoire/archéologie régionale logé dans
    // le Château d'Yverdon-les-Bains (Place Pestalozzi 11, ~0 km). Collections du
    // Néolithique à l'époque moderne + antiquités égyptiennes (momie ptolémaïque), centre
    // d'info sur les palafittes UNESCO. Vraie programmation famille: expos adaptées aux
    // enfants, ateliers, visites, et grands rendez-vous gratuits (Journée des châteaux
    // suisses, Nuit des musées). Fort ancrage culture/patrimoine/famille pour Yverdon,
    // DISTINCT de Maison d'Ailleurs (`maisonAilleurs`, musée SF) et de l'agenda culturel
    // touristique (`emoi`/`yverdonVille` listent surtout l'agenda Ville, pas le programme
    // propre du musée). Plateforme: WordPress (thème twentig/Gutenberg, WooCommerce). La
    // page /agenda/ rend des cartes statiques `.event-card` (titre, label date FR sans
    // année « <jour> <date> <mois>, HHhMM-HHhMM », extrait) liant `/event/<slug>/`. Chaque
    // fiche détail porte un encart `.event-infos` structuré (Date/heure, `Lieu:`, `Prix:`)
    // + un corps `.entry-content-main`. Pas de plugin Events Calendar / REST événements —
    // scraping HTML cartes + enrichissement fiche.
    url: 'https://musee-yverdon-region.ch/agenda/',
    baseUrl: 'https://musee-yverdon-region.ch',
    kind: 'wordpress-museum-agenda-yverdon'
  },
  bibliothequeYverdon: {
    // Bibliothèque publique et scolaire d'Yverdon-les-Bains (BPS) — la médiathèque
    // municipale (Rue de la Plaine / Maison des Terreaux, ~0 km d'Yverdon). Vraie
    // programmation jeune public et famille: « Le Coffre à histoires » (heure du conte
    // hebdo, relâche en août + vacances scolaires), lectures/performances, expositions
    // (Égypte), activités hors les murs (Champ-Pittet), cafés-conversation. Fort fit
    // culture/famille/jeune-public, et régulièrement des rendez-vous à La Dérivée (Quai
    // de Nogent) — signal de goût Johan direct. DISTINCT de `emoi`/`yverdonVille` (agenda
    // culturel de la Ville, pas le programme propre de la bibliothèque) et de `museeYverdon`
    // / `maisonAilleurs` (musées). Plateforme: TYPO3 CMS, plugin « news ». La page
    // /activites rend des cartes statiques `div.list-article` portant un `a[title]` vers
    // `/activites/detail/<slug>` — le title attr porte la DATE FR (`DD.MM.YYYY | Titre`
    // jour unique, ou `Du DD.MM(.YYYY)? au DD.MM.YYYY | Titre` range) + la rubrique
    // `.news-list-category` (« Activités jeunes » / « Activités adultes ») + un extrait
    // `[itemprop=description]`. Les fiches détail portent le corps `[itemprop=articleBody]`
    // avec horaire/prix/lieu en texte libre (« Dimanche 15 août / 19h00 / Gratuit », « Aura
    // lieu à La Dérivée »). Les items evergreen sans date concrète (heure du conte) sont
    // proprement ignorés.
    url: 'https://bibliotheque.yverdon.ch/activites',
    baseUrl: 'https://bibliotheque.yverdon.ch',
    kind: 'typo3-news-library-agenda-yverdon'
  },
  sunsetJazz: {
    // Festival « Sunset Jazz » d'Estavayer-le-Lac (Broye / Lac de Neuchâtel,
    // ~22 km d'Yverdon) : jazz de rue estival dans le Bourg médiéval, organisé
    // par le Comité de cafetiers-restaurateurs du Bourg avec la Commune —
    // 2 soirées + une matinée, 5 lieux emblématiques (rues et places de la
    // vieille ville), 8 groupes, concerts plein air, ambiance festive et
    // conviviale, accès libre. Fort fit famille / plein-air / La Dérivée.
    // Saisonnier (été) : la page programme est réutilisée d'une édition à
    // l'autre, l'intérêt est de capter les prochaines éditions. DISTINCT de
    // `fribourgTerroir` (agenda DMO cantonal) : c'est la page programme propre
    // de la Commune (`estavayer.ch`, TYPO3) qui porte le détail heure/lieu/
    // groupe par jour. Structure statique : section <h1>Programmation</h1>, une
    // colonne `.col-md-4` par jour avec un <h3>Jour DD mois AAAA</h3> et un
    // accordéon dont chaque `.accordion-item` porte le lieu (bouton) et le
    // créneau « HH:MM - HH:MM: Artiste » (corps). Une requête HTML, pas d'API.
    url: 'https://www.estavayer.ch/culture-loisirs-sports/manifestations/programmation-sunset-jazz',
    baseUrl: 'https://www.estavayer.ch',
    kind: 'typo3-static-festival-programme-estavayer'
  },
  chateauLaSarraz: {
    // Château de La Sarraz (La Sarraz, Jura-Nord vaudois, ~15 km d'Yverdon) :
    // château médiéval habité + Musée du Cheval, propre programmation culturelle
    // et familiale au coeur du bourg — concerts « Jeudis du Château » (cour /
    // plein-air estival), Schumanniade, Salon du terroir (Balthazar Festival),
    // fête médiévale, ateliers/visites patrimoine. Fort fit famille / patrimoine
    // / plein-air / terroir (signal de goût Johan). DISTINCT de tout : aucune
    // source existante ne relaie l'agenda propre du château. Plateforme : WordPress
    // + plugin « The Events Calendar » (Tribe) qui expose une API REST publique
    // renvoyant tout en JSON structuré (titre, dates locales Europe/Zurich via
    // *_date_details, all_day, venue.city, cost_details, description HTML,
    // categories/tags) — une requête, pas de scraping HTML ni d'enrichissement.
    url: 'https://chateau-lasarraz.ch/events/',
    apiUrl: 'https://chateau-lasarraz.ch/wp-json/tribe/events/v1/events',
    baseUrl: 'https://chateau-lasarraz.ch',
    kind: 'wordpress-the-events-calendar-rest-chateau-lasarraz'
  },
  pomy: {
    // Commune de Pomy (village du Nord vaudois, ~4 km d'Yverdon, sur le coteau
    // au sud-est de la ville) : agenda communal des manifestations publiques —
    // fête de la pomme de la Fanfare, marché de Noël, repas intergénérationnel,
    // week-end du Jeûne de la Jeunesse, soirées de gym, + votations/élections.
    // Bon fit village / famille / terroir (signal de goût Johan), commune encore
    // NON couverte (distincte de chavornay/champvent/grandson/orbe). Plateforme :
    // WordPress + « The Events Calendar » (Tribe) qui expose l'API REST publique
    // /wp-json/tribe/events/v1/events (même pattern que chateauLaSarraz). Le
    // calendrier brut est saturé de réservations de salles et d'entraînements de
    // clubs (salle-polyvalente, réservations-poméranne, salle-du-levant), donc on
    // scope STRICTEMENT à la catégorie « autres-evenements » = vraies
    // manifestations publiques du village.
    url: 'https://pomy.ch/evenements/',
    apiUrl: 'https://pomy.ch/wp-json/tribe/events/v1/events',
    baseUrl: 'https://pomy.ch',
    category: 'autres-evenements',
    kind: 'wordpress-the-events-calendar-rest-pomy'
  },
  manualJohan: {
    url: 'manual://johan/kids-activities',
    kind: 'local-human-curated-source',
    dataFile: 'data/manual-events.json'
  },
  prioritizedTheatreCandidates: {
    url: 'file://data/source-candidates.json',
    kind: 'local-prioritized-source-candidates'
  }
};

const TAG_FR = {
  animals: 'animaux', nature: 'nature', outdoor: 'plein air', walk: 'balade', discovery: 'découverte',
  culture: 'culture', indoor: 'intérieur', science: 'science', food: 'food/cuisine', cosy: 'cosy',
  sport: 'sport', water: 'eau', mountain: 'montagne'
};

function clean(s = '') { return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripLead(s = '') { return clean(s).replace(/^>\s*/, ''); }
function htmlToText(html = '') { return clean(cheerio.load(`<main>${html || ''}</main>`)('main').text()); }
function sha(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12); }
function canonicalUrl(href, base) { try { return new URL(href, base).toString().replace(/#.*$/, ''); } catch { return ''; } }
function uniqBy(arr, keyFn) { const seen = new Set(); return arr.filter(x => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; }); }

async function fetchHtml(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const MONTHS = {
  janvier: '01', janv: '01', février: '02', fevrier: '02', févr: '02', fevr: '02', mars: '03', avril: '04', avr: '04', mai: '05', juin: '06',
  juillet: '07', juil: '07', août: '08', aout: '08', septembre: '09', sept: '09', sep: '09', octobre: '10', oct: '10', novembre: '11', nov: '11', décembre: '12', decembre: '12', déc: '12', dec: '12'
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

function parseFrenchDate(text, fallbackYear = new Date().getFullYear()) {
  const t = clean(text).toLowerCase();
  const m = t.match(new RegExp(`(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?`, 'i'));
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = MONTHS[m[2].toLowerCase()];
  const year = m[3] || String(fallbackYear);
  return `${year}-${month}-${day}`;
}

function parseNumericDate(text, fallbackYear = new Date().getFullYear()) {
  const m = clean(text).match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (!m) return null;
  let y = m[3] || String(fallbackYear); if (y.length === 2) y = `20${y}`;
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseTime(text) {
  const m = clean(text).match(/(?:^|\D)(\d{1,2})\s*h(?:\s*(\d{2}))?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour > 23) return null;
  return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}:00+02:00`;
}

function isoDate(date, timeText = '') {
  if (!date) return null;
  const time = parseTime(timeText);
  return time ? `${date}T${time}` : date;
}

function parseInfomaniakDateRange(text, fallbackYear = new Date().getFullYear()) {
  const t = clean(text).toLowerCase();
  const range = t.match(/du\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s*(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)?\s+au\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(\d{4}))?/i);
  if (range) {
    const year = range[5] || String(fallbackYear);
    const startMonth = MONTHS[range[2] || range[4]];
    const endMonth = MONTHS[range[4]];
    const startDate = isoDate(`${year}-${startMonth}-${range[1].padStart(2, '0')}`, text);
    const endDate = `${year}-${endMonth}-${range[3].padStart(2, '0')}`;
    return { startDate, endDate };
  }
  const single = parseFrenchDate(t, fallbackYear);
  return { startDate: isoDate(single, text), endDate: null };
}

function nextWeekendWindow(now = new Date()) {
  // Use local-ish UTC math; sufficient for date filtering artifacts. Current cron provides UTC, output labels Zurich.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const daysToSat = (6 - day + 7) % 7 || 7;
  const sat = new Date(d); sat.setUTCDate(d.getUTCDate() + daysToSat);
  const mon = new Date(sat); mon.setUTCDate(sat.getUTCDate() + 2);
  return { start: sat.toISOString().slice(0,10), endExclusive: mon.toISOString().slice(0,10) };
}

function eventId(e) { return `${e.source}-${sha(`${e.url}|${e.startDate || ''}|${e.title}`)}`; }
function titleKey(title = '') {
  return clean(title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(2026|grandson|morat|du|de|des|la|le|les|a|au|aux|et|en)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function recommendationKey(e) {
  const t = titleKey(e.title);
  const date = (e.startDate || '').slice(0,10);
  const city = (e.city || '').toLowerCase();
  if (/charles/.test(t) && /opera/.test(t)) return `opera-charles|${city}`;
  return `${t.split(' ').slice(0, 6).join(' ')}|${date}|${city}`;
}

function inferTags(text) {
  const t = clean(text).toLowerCase();
  const tags = new Set();
  const addIf = (tag, re) => { if (re.test(t)) tags.add(tag); };
  addIf('nature', /nature|biodivers|for[êe]t|prairie|haie|verger|jardin|lac|sentier|coteau|plein air/);
  addIf('animals', /insect|hirondelle|nichoir|animaux|faune|oiseaux|cheval|poney/);
  addIf('outdoor', /plein air|balade|visite|sentier|lac|parcours|coteau|jardin|sport|bouge/);
  addIf('culture', /mus[ée]e|th[ée][âa]tre|conte|lecture|bibli|expo|op[ée]ra|spectacle|historique|artisan|march[ée]/);
  addIf('science', /science|robot|tech|atelier|exp[ée]rience scientifique/);
  addIf('food', /food|go[ûu]ter|cuisine|march[ée]|terroir|\bcaf[ée]\b|\bth[ée]\b|salon de th[ée]/);
  addIf('cosy', /cosy|\bcaf[ée]\b|\bth[ée]\b|salon de th[ée]|doux|artisan|d[ée]coration/);
  addIf('sport', /sport|bouge|course|grimpe|escalade|tennis|gym|danse/);
  addIf('water', /\b(eau|lac|piscine|baignade|aquatique|bateau|nautique)\b/);
  addIf('walk', /balade|marche|sentier|visite|promenade|parcours/);
  addIf('mountain', /montagne|alpage|sommet|jura|sainte-croix/);
  addIf('indoor', /bibli|th[ée][âa]tre|expo|salle|mus[ée]e|op[ée]ra|salon de th[ée]/);
  addIf('discovery', /d[ée]couverte|exploration|observation|parcours|atelier/);
  return [...tags];
}

function parseAge(ageText, text = '') {
  const s = clean(`${ageText} ${text}`).toLowerCase();
  const range = s.match(/(\d{1,2})\s*(?:-|à|a)\s*(\d{1,2})\s*ans/);
  if (range) return { ageMin: +range[1], ageMax: +range[2], ageText: ageText || range[0] };
  const min = s.match(/d[èe]s\s*(\d{1,2})\s*ans|à partir de\s*(\d{1,2})\s*ans/);
  if (min) return { ageMin: +(min[1] || min[2]), ageMax: null, ageText: ageText || min[0] };
  if (/tout public|famille|enfants?|dès la naissance|n[ée] pour lire/.test(s)) return { ageMin: null, ageMax: null, ageText: ageText || 'tout public / famille' };
  return { ageMin: null, ageMax: null, ageText: ageText || '' };
}

function cityFromLocation(text, fallback = '') {
  const t = clean(text);
  for (const c of ['Yverdon-les-Bains', 'Yverdon', 'Grandson', 'Concise', 'Lausanne', 'Sainte-Croix', 'Yvonand', 'Vallorbe', 'Orbe', 'Neuchâtel', 'Neuchatel', 'Cheseaux-Noréaz', 'Romainmôtier', 'Marin-Epagnier', 'Marin']) {
    if (new RegExp(c, 'i').test(t)) return c === 'Yverdon' ? 'Yverdon-les-Bains' : c;
  }
  return fallback;
}

function normalizeEvent(partial) {
  const description = clean(partial.description || partial.rawSnippet || '').slice(0, 700);
  const age = parseAge(partial.ageText || '', `${partial.title} ${description}`);
  const tags = partial.tags?.length ? partial.tags : inferTags(`${partial.title} ${description} ${partial.locationText || ''}`);
  const event = {
    id: '', source: partial.source, title: clean(partial.title), startDate: partial.startDate || null, endDate: partial.endDate || null,
    locationName: clean(partial.locationName || partial.locationText || ''), locationText: clean(partial.locationText || partial.locationName || ''),
    city: partial.city || cityFromLocation(`${partial.locationName || ''} ${partial.locationText || ''}`, partial.source === 'grandson' ? 'Grandson' : ''),
    url: partial.url, description, ageMin: age.ageMin, ageMax: age.ageMax, ageText: age.ageText,
    priceText: clean(partial.priceText || ''), tags,
    status: partial.status || 'confirmed',
    confidenceStatus: partial.confidenceStatus || partial.status || 'confirmed',
    sourceProvenance: partial.sourceProvenance || partial.provenance || '',
    officialSources: partial.officialSources || [],
    sourceFiles: partial.sourceFiles || [],
    manualEntryId: partial.manualEntryId || '',
    evidence: clean(partial.evidence || partial.rawSnippet || `${partial.title} ${description}`).slice(0, 1200)
  };
  event.id = eventId(event);
  return event;
}

function manualEventUrl(entry, occurrenceIndex) {
  return `manual://johan/kids-activities/${encodeURIComponent(entry.id)}#${occurrenceIndex + 1}`;
}

function loadManualJohanEvents() {
  const file = path.join(__dirname, 'data', 'manual-events.json');
  if (!fs.existsSync(file)) return { events: [], note: 'manual-events.json missing' };
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const events = [];
  for (const entry of db.entries || []) {
    if (entry.status === 'archived') continue;
    for (const [idx, date] of (entry.dates || []).entries()) {
      events.push(normalizeEvent({
        source: 'manualJohan',
        title: entry.title,
        startDate: date.startDate,
        endDate: date.endDate || null,
        locationName: entry.venue || '',
        locationText: [entry.venue, entry.city].filter(Boolean).join(', '),
        city: entry.city || '',
        url: manualEventUrl(entry, idx),
        description: clean([
          entry.description || '',
          entry.status === 'needs_review' ? 'Source fournie par Johan — détails à confirmer avant recommandation ferme.' : '',
          entry.notes || ''
        ].filter(Boolean).join(' ')),
        ageText: entry.ageText || '',
        priceText: entry.priceText || '',
        tags: entry.tags || [],
        status: entry.status || 'candidate',
        confidenceStatus: entry.status || 'candidate',
        manualEntryId: entry.id || '',
        sourceFiles: entry.sourceFiles || [],
        officialSources: entry.officialSources || [],
        sourceProvenance: clean([entry.source || 'Johan', ...(entry.sourceFiles || []), ...(entry.officialSources || [])].filter(Boolean).join(' | ')),
        evidence: clean([
          `Source manuelle Johan (${entry.status || 'candidate'})`,
          entry.ocrEvidence || '',
          entry.sourceFiles && entry.sourceFiles.length ? `Fichiers: ${entry.sourceFiles.join(', ')}` : '',
          entry.notes || ''
        ].filter(Boolean).join(' | '))
      }));
    }
  }
  const stats = (db.entries || []).reduce((acc, e) => {
    acc.statusCounts[e.status || 'candidate'] = (acc.statusCounts[e.status || 'candidate'] || 0) + 1;
    acc.entries += 1;
    acc.occurrences += (e.dates || []).length;
    if ((e.officialSources || []).length) acc.officiallySourced += 1;
    return acc;
  }, { entries: 0, occurrences: 0, officiallySourced: 0, statusCounts: {} });
  return { events, note: `${events.length} manual occurrence(s) loaded from ${path.relative(process.cwd(), file)}`, diagnostics: stats };
}

function loadPrioritizedSourceCandidates() {
  const file = path.join(__dirname, 'data', 'source-candidates.json');
  if (!fs.existsSync(file)) return { events: [], note: 'source-candidates.json missing' };
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const active = (db.sources || []).filter(s => s.status !== 'rejected');
  return {
    events: [],
    note: `${active.length} prioritized local/web source candidate(s) loaded from ${path.relative(process.cwd(), file)}`,
    diagnostics: {
      generatedAt: db.updatedAt || null,
      topCandidates: active.slice(0, 8).map(s => ({ id: s.id, name: s.name, status: s.status, priority: s.priority, url: s.url }))
    }
  };
}

function bestDetailText($, title = '') {
  const candidates = $('main,#main,.site-main,.entry-content,.post-content,.content,.content-area,body')
    .map((_, el) => clean($(el).text())).get()
    .filter(t => t.length > 80);
  const relevant = candidates
    .filter(t => /Organisation|Lieu|Horaires|Prix/i.test(t) && (!title || t.toLowerCase().includes(title.toLowerCase().slice(0, 20))))
    .sort((a,b) => a.length - b.length);
  return relevant[0] || candidates.sort((a,b) => a.length - b.length)[0] || '';
}

function extractAfter(label, text, stopLabels) {
  const re = new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
  const m = re.exec(text);
  if (!m) return '';
  let tail = text.slice(m.index + m[0].length).trim();
  let stop = tail.length;
  for (const s of stopLabels) {
    const sm = new RegExp(`(?:^|\\s)${s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').exec(tail);
    if (sm && sm.index > 0 && sm.index < stop) stop = sm.index;
  }
  return clean(tail.slice(0, stop));
}

function grandsonMonthUrls(now = new Date(), horizonMonths = 6) {
  const urls = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  for (let i = 0; i < horizonMonths; i++) {
    urls.push(`${SOURCES.grandson.url}?mois=${m}&annee=${y}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return urls;
}

function extractGrandsonCalendarOccurrences(html, pageUrl) {
  const $ = cheerio.load(html);
  const url = new URL(pageUrl);
  const month = String(url.searchParams.get('mois') || (new Date().getUTCMonth() + 1)).padStart(2, '0');
  const year = url.searchParams.get('annee') || String(new Date().getUTCFullYear());
  const occurrences = [];
  $('table.agenda tr').each((i, tr) => {
    if (!$(tr).hasClass('cal-texte')) return;
    const dayCells = $(tr).prev('tr').children('td').map((_, td) => clean($(td).text())).get();
    $(tr).children('td').each((cellIdx, td) => {
      const day = Number(dayCells[cellIdx]);
      if (!day || $(td).hasClass('gris')) return;
      const date = `${year}-${month}-${String(day).padStart(2, '0')}`;
      $(td).find('a[href*="/agenda/"]').each((_, a) => {
        const title = stripLead($(a).text());
        const eventUrl = canonicalUrl($(a).attr('href'), SOURCES.grandson.url);
        if (title.length > 5 && eventUrl) occurrences.push({ title, url: eventUrl, date });
      });
    });
  });
  if (occurrences.length) return uniqBy(occurrences, x => `${x.url}|${x.date}`);

  return uniqBy($('a[href*="/agenda/"]').map((_, a) => ({
    title: stripLead($(a).text()), url: canonicalUrl($(a).attr('href'), SOURCES.grandson.url), date: null
  })).get().filter(x => x.title.length > 5 && !/agenda des manifestations|ajouter mon/i.test(x.title)), x => x.url);
}

function parseGrandsonDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  const title = stripLead(fallback.title || $('meta[property="og:title"]').attr('content') || $('title').text()).replace(/\s+[–-]\s+Grandson.*/, '');
  const mainText = clean($('.container .content').first().text()) || bestDetailText($, title);
  const detailDate = parseFrenchDate(mainText, 2026) || parseNumericDate(mainText, 2026);
  const horaires = extractAfter('Horaires', mainText, ['Prix', 'Contact', 'Organisation', 'Retour']);
  const location = extractAfter('Lieu', mainText, ['Horaires', 'Durée', 'Prix', 'Contact', 'Organisation', 'Retour']);
  const price = extractAfter('Prix', mainText, ['Contact', 'Organisation', 'Retour']);
  const org = extractAfter('Organisation', mainText, ['Lieu', 'Horaires', 'Prix', 'Contact', 'Retour']);
  const orgIdx = mainText.indexOf('Organisation');
  const lieuIdx = mainText.indexOf('Lieu');
  const desc = orgIdx > 0 ? mainText.slice(0, orgIdx) : (lieuIdx > 0 ? mainText.slice(0, lieuIdx) : mainText);
  const date = fallback.date || detailDate;
  const ageText = /familles?|enfants?|dès\s+\d+\s+ans|jeux|ludique|bibli|conte/i.test(mainText) ? 'famille / enfants mentionnés' : '';
  return normalizeEvent({
    source: 'grandson', title, startDate: isoDate(date, horaires), locationName: org || location.split(/\s+Rue\s+|\s+Route\s+/)[0],
    locationText: location || 'Grandson', city: cityFromLocation(location, 'Grandson'), url: fallback.url,
    description: desc.replace(title, '').replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\w+\s+\d{4}/i, ''),
    priceText: price, ageText, rawSnippet: mainText,
    evidence: clean([title, date, horaires, location, price, desc].filter(Boolean).join(' | '))
  });
}

async function scrapeGrandson() {
  const source = 'grandson';
  const occurrences = [];
  for (const url of grandsonMonthUrls(new Date(), 6)) {
    const html = await fetchHtml(url);
    occurrences.push(...extractGrandsonCalendarOccurrences(html, url));
  }
  const detailCache = new Map();
  const events = [];
  for (const occ of uniqBy(occurrences, x => `${x.url}|${x.date || ''}`)) {
    try {
      if (!detailCache.has(occ.url)) detailCache.set(occ.url, await fetchHtml(occ.url));
      events.push(parseGrandsonDetail(detailCache.get(occ.url), occ));
    } catch (e) {
      events.push({ source, title: occ.title, url: occ.url, error: e.message });
    }
  }
  return events.filter(e => !e.error);
}

function parseYverdonListing(parentText, anchorText, url) {
  const evidence = clean(parentText || anchorText);
  const date = parseFrenchDate(evidence, 2026);
  const city = cityFromLocation(evidence, 'Yverdon-les-Bains');
  let title = clean(anchorText);
  if (!title || title.length < 4) {
    title = evidence
      .replace(new RegExp(`^\\d{1,2}\\s+(${MONTH_RE})\\.?(?:\\s+\\d{1,2}\\s+(${MONTH_RE})\\.?)?`, 'i'), '')
      .replace(new RegExp(`${city}$`, 'i'), '')
      .trim();
  }
  return normalizeEvent({
    source: 'yverdon', title, startDate: isoDate(date, evidence), locationText: city, city, url,
    description: evidence, evidence
  });
}

function extractFrenchDates(text, fallbackYear = 2026) {
  const out = [];
  const re = new RegExp(`(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*\\d{1,2}\\s+(?:${MONTH_RE})\\.?(?:\\s+\\d{4})?`, 'ig');
  for (const m of clean(text).matchAll(re)) {
    const date = parseFrenchDate(m[0], fallbackYear);
    if (date) out.push(date);
  }
  return [...new Set(out)];
}

function parseYverdonDetail(html, url, fallback = {}) {
  const $ = cheerio.load(html);
  const title = clean($('h1').first().text()) || fallback.anchorText || fallback.title;
  const textBlocks = $('.elementor-widget-text-editor').map((_, el) => clean($(el).text())).get().filter(Boolean);
  const dateFields = $('.jet-listing-dynamic-field__content').map((_, el) => clean($(el).text()).replace(/^[-–]\s*/, '')).get().filter(Boolean);
  const start = parseFrenchDate(dateFields[0] || fallback.parentText || '', 2026) || parseFrenchDate(fallback.parentText || '', 2026);
  const end = parseFrenchDate(dateFields[1] || '', 2026);
  const titleIdx = textBlocks.findIndex(t => t === title);
  const detailBlocks = textBlocks.filter((t, i) => i !== titleIdx && !/^(Dates|Contactez-nous|Suivez-nous|Inscrivez-vous|Un site de l’Association)/i.test(t));
  const city = textBlocks.find(t => /^(Yverdon-les-Bains|Grandson|Sainte-Croix|Orbe|Vallorbe|Concise|Yvonand)$/i.test(t)) || cityFromLocation(`${fallback.parentText || ''} ${textBlocks.join(' ')}`, 'Yverdon-les-Bains');
  const cityIdx = textBlocks.indexOf(city);
  const org = cityIdx >= 3 ? textBlocks[cityIdx - 3] : '';
  const street = cityIdx >= 2 ? textBlocks[cityIdx - 2] : '';
  const zip = cityIdx >= 1 ? textBlocks[cityIdx - 1] : '';
  const locationText = clean([org, street, zip, city].filter(Boolean).join(', ')) || city;
  const mainDescription = detailBlocks.slice(0, 2).filter(t => t !== org && t !== street && t !== zip && t !== city).join(' — ');
  const practicalBlock = detailBlocks.find(t => /CHF|gratuit|entrée|prix|pass|réservation|inscription|horaires?|dates?\s+2026|informations? sur/i.test(t) && t !== mainDescription) || '';
  const evidence = clean([title, dateFields.join(' '), mainDescription, locationText, practicalBlock].filter(Boolean).join(' | '));
  const recurrenceDates = practicalBlock && /dates?\s+2026|samedi|dimanche|vendredi|jeudi|mercredi|mardi|lundi/i.test(practicalBlock)
    ? extractFrenchDates(practicalBlock, 2026).filter(d => d >= (start || '0000-00-00') && (!end || d <= end))
    : [];
  const dates = recurrenceDates.length >= 2 ? recurrenceDates : [start].filter(Boolean);
  const priceMatch = practicalBlock.match(/(?:CHF\s*\d+(?:[.,]\d+)?|entrée libre|prix libre|pass[^.]+CHF\s*\d+(?:[.,]\d+)?)/i);
  const priceText = priceMatch ? clean(priceMatch[0]) : (/(?:gratuit(?:e|es)?\s+et\s+ouvert(?:e|es)?s?\s+à\s+tous|accès\s+gratuit|entrée\s+gratuite)/i.test(`${mainDescription} ${practicalBlock}`) ? 'Gratuit / ouvert à tous' : '');
  return dates.map(date => normalizeEvent({
    source: 'yverdon', title, startDate: isoDate(date, `${mainDescription} ${practicalBlock}`), endDate: recurrenceDates.length >= 2 ? null : end,
    locationName: org || city, locationText, city, url,
    description: mainDescription || fallback.parentText || title,
    priceText,
    ageText: /petits et grands|famille|enfants?|atelier|animations/i.test(`${mainDescription} ${practicalBlock}`) ? 'famille / enfants mentionnés' : '',
    evidence
  }));
}

async function scrapeYverdon() {
  const source = 'yverdon';
  const html = await fetchHtml(SOURCES.yverdon.url, 35000);
  const $ = cheerio.load(html);
  const links = uniqBy($('a[href*="/evenement/"]').map((_, a) => {
    const anchorText = stripLead($(a).text());
    const parentText = clean($(a).closest('.jet-listing-grid__item,.elementor-widget,.e-con,article,div').text());
    return { anchorText, parentText, url: canonicalUrl($(a).attr('href'), SOURCES.yverdon.url) };
  }).get().filter(x => x.url && (x.anchorText || x.parentText) && !/^fr$|^de$|^español$/i.test(x.anchorText)), x => x.url).slice(0, 80);

  const events = [];
  // Widened batch 8→16 (TASK-228): this WordPress/Elementor site serves detail
  // pages slowly, and 80 links in batches of 8 pinned the source at ~90s (the old
  // guard boundary). 16-wide halves the number of sequential rounds so the source
  // finishes well under the timeout even when other sources run concurrently.
  for (let i = 0; i < links.length; i += 16) {
    const batch = links.slice(i, i + 16);
    const results = await Promise.all(batch.map(async link => {
      try {
        const detailHtml = await fetchHtml(link.url, 30000);
        const detailEvents = parseYverdonDetail(detailHtml, link.url, link);
        return detailEvents.length ? detailEvents : [parseYverdonListing(link.parentText, link.anchorText, link.url)];
      } catch (e) {
        try {
          return [parseYverdonListing(link.parentText, link.anchorText, link.url)];
        } catch {
          return [{ source, title: link.anchorText || link.parentText, url: link.url, error: e.message }];
        }
      }
    }));
    events.push(...results.flat());
  }
  return events.filter(e => !e.error);
}


function emoiEventUrl(id) {
  return `${SOURCES.emoi.url}#/event/${id}`;
}

function parseGeocityArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(', ');
  return clean(value || '');
}

async function fetchEmoiJson(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)',
        accept: 'application/json',
        referer: SOURCES.emoi.url
      }
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Shared normalizer for any Geocity (`geocity.ch/rest/agenda`) detail record.
// EMOI, Orbe and the Ville d'Yverdon agendas all share this exact schema.
function buildGeocityEvent(raw, opts) {
  const publics = parseGeocityArray(raw.publics);
  const genre = parseGeocityArray(raw.genre_evenement);
  const location = clean(raw.location_details || opts.fallbackLocation);
  const detailText = clean([
    raw.summary,
    raw.schedule,
    raw.pricing,
    publics,
    genre,
    raw.organizer_name,
    raw.website,
    raw.organizer_website
  ].filter(Boolean).join(' | '));
  const ageText = /familles?|jeune public|enfants?|tout public/i.test(publics)
    ? publics
    : (/familles?|jeune public|enfants?|tout public|jeux|atelier|animation|parcours|ludique/i.test(`${raw.title || ''} ${detailText}`) ? 'famille / enfants mentionnés' : publics);
  const tags = inferTags(`${raw.title || ''} ${detailText} ${genre}`);
  if (/tous publics|familles?|jeune public/i.test(publics) && !tags.includes('discovery')) tags.push('discovery');
  const officialSources = [raw.website, raw.organizer_website].filter(Boolean);
  return normalizeEvent({
    source: opts.source,
    title: raw.title,
    startDate: raw.starts_at || null,
    endDate: raw.ends_at || null,
    locationName: location.split(',')[0],
    locationText: location,
    city: cityFromLocation(location, opts.defaultCity),
    url: opts.url,
    description: clean([raw.summary, raw.schedule].filter(Boolean).join(' — ')),
    priceText: raw.pricing || '',
    ageText,
    tags,
    officialSources,
    sourceProvenance: opts.sourceProvenance,
    evidence: clean([
      raw.title,
      raw.starts_at && `début ${raw.starts_at}`,
      raw.ends_at && `fin ${raw.ends_at}`,
      location,
      raw.pricing && `prix ${raw.pricing}`,
      publics && `public ${publics}`,
      genre && `genre ${genre}`,
      raw.organizer_name && `organisateur ${raw.organizer_name}`,
      raw.website && `site ${raw.website}`,
      opts.extraEvidence,
      raw.summary
    ].filter(Boolean).join(' | '))
  });
}

function parseEmoiEvent(feature) {
  const raw = feature?.properties || feature || {};
  return buildGeocityEvent(raw, {
    source: 'emoi',
    url: emoiEventUrl(raw.id),
    fallbackLocation: 'Yverdon-les-Bains et région',
    defaultCity: 'Yverdon-les-Bains',
    sourceProvenance: 'EMOI agenda culturel officiel via Geocity agenda_culture API'
  });
}

async function scrapeEmoi() {
  const ids = [];
  let nextUrl = `${SOURCES.emoi.apiUrl}?domain=${SOURCES.emoi.domain}&page=1&page_size=50`;
  for (let page = 0; nextUrl && page < 10; page++) {
    const payload = await fetchEmoiJson(nextUrl, 30000);
    for (const feature of payload.features || []) {
      const id = feature?.properties?.id;
      if (id) ids.push(id);
    }
    nextUrl = payload.next || '';
  }
  const events = [];
  for (const id of [...new Set(ids)]) {
    try {
      const detail = await fetchEmoiJson(`${SOURCES.emoi.apiUrl}/${id}`, 25000);
      events.push(parseEmoiEvent(detail));
    } catch (e) {
      events.push({ source: 'emoi', title: `EMOI event ${id}`, url: emoiEventUrl(id), error: e.message });
    }
  }
  return events.filter(e => !e.error);
}

function yverdonVilleEventUrl(id, themePage) {
  // Geocity widgets address a single event via a hash fragment on the host page.
  return `${themePage}#/event/${id}`;
}

async function scrapeYverdonVille() {
  const source = 'yverdonVille';
  const events = [];
  for (const theme of SOURCES.yverdonVille.themes) {
    // Collect the listing ids for this themed agenda (paginated).
    const ids = [];
    let nextUrl = `${SOURCES.yverdonVille.apiUrl}?domain=${theme.domain}&page=1&page_size=50`;
    for (let page = 0; nextUrl && page < 10; page++) {
      let payload;
      try {
        payload = await fetchEmoiJson(nextUrl, 30000);
      } catch (e) {
        events.push({ source, title: `Yverdon ${theme.domain} listing`, url: theme.page, error: e.message });
        break;
      }
      for (const feature of payload.features || []) {
        const id = feature?.properties?.id;
        if (id) ids.push(id);
      }
      nextUrl = payload.next || '';
    }
    // Fetch event details in parallel batches instead of one-by-one. The old
    // sequential loop over up to ~500 ids (25s each) always blew the per-source
    // guard and returned 0 events (TASK-228); batching keeps it well within the
    // window while still self-limiting to avoid hammering the Geocity API.
    const uniqueIds = [...new Set(ids)].slice(0, 120);
    for (let i = 0; i < uniqueIds.length; i += 8) {
      const batch = uniqueIds.slice(i, i + 8);
      const results = await Promise.all(batch.map(async id => {
        try {
          const detail = await fetchEmoiJson(`${SOURCES.yverdonVille.apiUrl}/${id}`, 20000);
          const raw = detail?.properties || detail || {};
          return buildGeocityEvent(raw, {
            source,
            url: yverdonVilleEventUrl(id, theme.page),
            fallbackLocation: 'Yverdon-les-Bains',
            defaultCity: 'Yverdon-les-Bains',
            sourceProvenance: `Ville d'Yverdon-les-Bains agenda officiel (${theme.label}) via Geocity ${theme.domain} API`,
            extraEvidence: `agenda ${theme.label}`
          });
        } catch (e) {
          return { source, title: `Yverdon-les-Bains event ${id}`, url: yverdonVilleEventUrl(id, theme.page), error: e.message };
        }
      }));
      events.push(...results);
    }
  }
  return events.filter(e => !e.error);
}

function parseInfomaniakListing(text, url) {
  const evidence = clean(text);
  const prefixes = /^(Bientôt complet|Dernière chance|Nouveau|Complet)\s+/i;
  const stripped = evidence.replace(prefixes, '');
  const dateMatch = stripped.match(/(?:Du\s+)?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+(?:au\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+)?(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+-\s+\d{1,2}h\d{0,2})?/i);
  const dateText = dateMatch ? dateMatch[0] : '';
  const title = clean(dateMatch ? stripped.slice(0, dateMatch.index) : stripped.split(/\s+A partir de\s+/i)[0]).slice(0, 140);
  const afterDate = dateMatch ? stripped.slice(dateMatch.index + dateText.length) : stripped;
  const priceMatch = afterDate.match(/A partir de\s+[^.]+\.-/i);
  const locationText = clean(priceMatch ? afterDate.slice(0, priceMatch.index) : '').replace(/^[-–]\s*/, '');
  const priceText = priceMatch ? clean(priceMatch[0]) : '';
  const description = clean(priceMatch ? afterDate.slice(priceMatch.index + priceText.length) : afterDate).replace(/^(Famille|Théâtre et arts vivants|Musique|Spectacle)\s*$/i, '');
  const dates = parseInfomaniakDateRange(dateText, 2026);
  const city = cityFromLocation(locationText, 'Yverdon-les-Bains');
  return normalizeEvent({
    source: 'infomaniak-yverdon', title, startDate: dates.startDate, endDate: dates.endDate,
    locationName: locationText.split(/\s+-\s+/)[0], locationText, city, url,
    description, priceText, evidence
  });
}

async function scrapeInfomaniakYverdon() {
  const source = 'infomaniak-yverdon';
  const html = await fetchHtml(SOURCES.infomaniakYverdon.url, 20000);
  const $ = cheerio.load(html);
  const links = uniqBy($('a[href*="/events/"]').map((_, a) => ({
    text: stripLead($(a).text()), url: canonicalUrl($(a).attr('href'), SOURCES.infomaniakYverdon.url)
  })).get().filter(x => x.url && x.text && /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/i.test(x.text)), x => x.url).slice(0, 60);

  const events = [];
  for (const link of links) {
    try {
      events.push(parseInfomaniakListing(link.text, link.url));
    } catch (e) {
      events.push({ source, title: link.text, url: link.url, error: e.message });
    }
  }
  return events.filter(e => !e.error);
}

function extractAgendaChProfiles(html, baseUrl = 'https://agenda.ch/fr/s') {
  const $ = cheerio.load(html);
  const profileLinks = uniqBy($('a[href*="/fr/s/"]').map((_, a) => ({
    title: stripLead($(a).text()),
    url: canonicalUrl($(a).attr('href'), baseUrl)
  })).get().filter(x => x.url && x.title && !/^\d+$/.test(x.title)), x => x.url);
  const pageText = clean($('body').text());
  const appointmentSignals = [
    /prenez rendez-vous|prendre rendez-vous|rendez-vous en ligne/i.test(pageText),
    /th[ée]rapeute|ost[ée]opathe|physioth[ée]rapeute|coach|coiffeur|institut de beaut[ée]/i.test(pageText),
    /disponibilit[ée]s|s[ée]ances/i.test(pageText)
  ].filter(Boolean).length;
  const eventSignals = /\b(év[ée]nement|manifestation|spectacle|concert|festival|billetterie)\b/i.test(pageText);
  return { profileLinks, appointmentSignals, eventSignals, title: clean($('title').text()) };
}

async function scrapeAgendaCh() {
  const source = 'agenda-ch';
  const urls = [
    SOURCES.agendaCh.url,
    'https://agenda.ch/fr/s/jsresults?what=Enfants&where=Yverdon-les-Bains&distance=20000&search_form=true',
    'https://agenda.ch/fr/s/jsresults?what=Atelier&where=Yverdon-les-Bains&distance=20000&search_form=true',
    'https://agenda.ch/fr/s/jsresults?what=Sport&where=Yverdon-les-Bains&distance=20000&search_form=true'
  ];
  const probes = [];
  for (const url of urls) {
    const html = await fetchHtml(url, 20000);
    const extracted = extractAgendaChProfiles(html, url);
    probes.push({ url, ...extracted, sampleProfiles: extracted.profileLinks.slice(0, 5) });
  }
  const exploitableEventPage = probes.some(p => p.eventSignals && p.appointmentSignals < 2);
  return {
    events: [],
    note: exploitableEventPage
      ? 'Agenda.ch probe found event-like wording, but no dated event cards were safely extractable yet.'
      : `Agenda.ch is an appointment/practitioner directory in tested Yverdon queries, not a dated event agenda; ${probes.reduce((n, p) => n + p.profileLinks.length, 0)} practitioner/profile links inspected across ${probes.length} probes.`,
    diagnostics: probes.map(p => ({ url: p.url, title: p.title, profiles: p.profileLinks.length, appointmentSignals: p.appointmentSignals, eventSignals: p.eventSignals, sampleProfiles: p.sampleProfiles }))
  };
}

function extractLaDeriveeApiToken(appJs = '') {
  return appJs.match(/Authorization:\\?"Bearer \\?"\+String\(\\?"([^"\\]+)/)?.[1] || '';
}

function laDeriveeDateTime(date, time, isAllDay = false) {
  if (!date) return null;
  if (isAllDay || !time) return date;
  const m = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return date;
  return `${date}T${m[1].padStart(2, '0')}:${m[2]}:00+02:00`;
}

function parseLaDeriveeEvent(raw) {
  const tagText = (raw.tags || []).map(t => t.name || t.slug || '').filter(Boolean).join(', ');
  const partnerText = (raw.partners || []).map(p => p.title || p.subtitle || '').filter(Boolean).join(', ');
  const buttonText = (raw.buttons || []).map(b => [b.name, b.url].filter(Boolean).join(': ')).filter(Boolean).join(' | ');
  const description = clean([raw.subtitle, htmlToText(raw.teaser || ''), tagText, partnerText].filter(Boolean).join(' — '));
  const tags = inferTags(`${raw.title || ''} ${description} ${tagText}`).concat(['outdoor', 'culture', 'water']).filter((v, i, a) => a.indexOf(v) === i);
  return normalizeEvent({
    source: 'la-derivee',
    title: raw.title,
    startDate: laDeriveeDateTime(raw.date_start, raw.time_start, raw.is_all_day),
    endDate: raw.date_end || null,
    locationName: 'La Dérivée',
    locationText: 'La Dérivée, Quai de Nogent, Yverdon-les-Bains',
    city: 'Yverdon-les-Bains',
    url: canonicalUrl(`/event/${raw.slug || raw.id}`, 'https://www.laderivee.ch'),
    description,
    priceText: 'Gratuit / buvette estivale (site: centre culturel estival gratuit)',
    ageText: /enfants?|famille|atelier|animation|biblioth/i.test(description) ? 'famille / enfants mentionnés' : '',
    tags,
    evidence: clean([raw.title, raw.subtitle, `date ${raw.date_start}`, raw.time_start && `heure ${raw.time_start}`, tagText && `tags ${tagText}`, partnerText && `partenaires ${partnerText}`, htmlToText(raw.teaser || ''), buttonText].filter(Boolean).join(' | '))
  });
}

async function fetchLaDeriveeApiToken() {
  const html = await fetchHtml(SOURCES.laDerivee.url, 25000);
  const $ = cheerio.load(html);
  const appScript = $('script[src*="pages/_app-"]').attr('src') || $('script[src*="/_app"]').attr('src');
  if (!appScript) throw new Error('La Dérivée: unable to find Next.js _app script for public API token discovery');
  const appJs = await fetchHtml(canonicalUrl(appScript, SOURCES.laDerivee.url), 30000);
  const token = extractLaDeriveeApiToken(appJs);
  if (!token) throw new Error('La Dérivée: unable to extract public API token from _app script');
  return token;
}

async function scrapeLaDerivee() {
  const token = await fetchLaDeriveeApiToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(SOURCES.laDerivee.apiUrl, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error(`${SOURCES.laDerivee.apiUrl} -> HTTP ${res.status}`);
    const rawEvents = await res.json();
    if (!Array.isArray(rawEvents)) throw new Error('La Dérivée API returned non-array payload');
    return rawEvents
      .filter(e => e && e.date_start && e.title && !/d[ée]riv[ée]e\s+ferm[ée]e|ferm[ée]/i.test(`${e.title} ${e.subtitle || ''} ${htmlToText(e.teaser || '')}`))
      .map(parseLaDeriveeEvent);
  } finally {
    clearTimeout(timer);
  }
}

function orbeEventUrl(id) {
  return `${SOURCES.orbe.url}#/event/${id}`;
}

function parseOrbeEvent(feature) {
  const raw = feature?.properties || feature || {};
  const detailText = clean([
    raw.summary,
    raw.location_details,
    raw.schedule,
    raw.pricing,
    raw.publics,
    raw.genre_evenement,
    raw.organizer_name,
    raw.website
  ].filter(Boolean).join(' | '));
  const publics = clean(raw.publics || '');
  const ageText = /familles?|jeune public|enfants?|tout public/i.test(publics)
    ? publics
    : (/familles?|jeune public|enfants?|tout public|jeux|atelier|animation/i.test(`${raw.title || ''} ${detailText}`) ? 'famille / enfants mentionnés' : publics);
  const tags = inferTags(`${raw.title || ''} ${detailText} ${raw.genre_evenement || ''}`);
  if (/familles?|jeune public/i.test(publics) && !tags.includes('discovery')) tags.push('discovery');
  return normalizeEvent({
    source: 'orbe',
    title: raw.title,
    startDate: raw.starts_at || null,
    endDate: raw.ends_at || null,
    locationName: (raw.location_details || '').split(',')[0],
    locationText: raw.location_details || 'Orbe',
    city: 'Orbe',
    url: orbeEventUrl(raw.id),
    description: clean([raw.summary, raw.schedule].filter(Boolean).join(' — ')),
    priceText: raw.pricing || '',
    ageText,
    tags,
    evidence: clean([
      raw.title,
      raw.starts_at && `début ${raw.starts_at}`,
      raw.ends_at && `fin ${raw.ends_at}`,
      raw.location_details,
      raw.pricing && `prix ${raw.pricing}`,
      raw.publics && `public ${raw.publics}`,
      raw.genre_evenement && `type ${raw.genre_evenement}`,
      raw.organizer_name && `organisateur ${raw.organizer_name}`,
      raw.website && `site ${raw.website}`,
      raw.summary
    ].filter(Boolean).join(' | '))
  });
}

async function fetchOrbeJson(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)',
        accept: 'application/json',
        referer: SOURCES.orbe.url
      }
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeOrbe() {
  const ids = [];
  let nextUrl = `${SOURCES.orbe.apiUrl}?domain=agenda_orbe&page=1&page_size=50`;
  for (let page = 0; nextUrl && page < 10; page++) {
    const payload = await fetchOrbeJson(nextUrl, 30000);
    for (const feature of payload.features || []) {
      const id = feature?.properties?.id;
      if (id) ids.push(id);
    }
    nextUrl = payload.next || '';
  }
  const events = [];
  for (const id of [...new Set(ids)]) {
    try {
      const detail = await fetchOrbeJson(`${SOURCES.orbe.apiUrl}/${id}`, 25000);
      events.push(parseOrbeEvent(detail));
    } catch (e) {
      events.push({ source: 'orbe', title: `Orbe event ${id}`, url: orbeEventUrl(id), error: e.message });
    }
  }
  return events.filter(e => !e.error);
}


function vallorbeEventUrl(id) {
  return canonicalUrl(`/_rte/anlass/${id}`, 'https://www.vallorbe.ch');
}

function extractVallorbeListings(html) {
  const $ = cheerio.load(html);
  const attr = $('#anlassList').attr('data-entities');
  if (!attr) return [];
  const payload = JSON.parse(attr);
  return (payload.data || []).map(row => {
    const nameHtml = row.name || '';
    const name$ = cheerio.load(nameHtml);
    const link = name$('a').attr('href');
    return {
      id: row.id,
      title: clean(name$.text() || row.name),
      url: vallorbeEventUrl(row.id) || canonicalUrl(link, SOURCES.vallorbe.url),
      startDate: row._datumVon || null,
      endDate: row._datumBis || null,
      locationText: clean(cheerio.load(row.lokalitaet || '').text() || row._ort || 'Vallorbe'),
      city: row._ort || 'Vallorbe',
      organizer: clean(cheerio.load(row.organisator || '').text())
    };
  }).filter(x => x.id && x.title && x.startDate);
}

function parseVallorbeDateTime(text, fallbackDate) {
  const date = parseFrenchDate(text, 2026) || parseNumericDate(text, 2026) || fallbackDate;
  return isoDate(date, text);
}

function parseVallorbeDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  let title = clean($('main h1.contentTitle, main h1').first().text()) || fallback.title;
  if (!title || /^(Contact|Connexion|Rechercher)$/i.test(title)) title = fallback.title;
  const mainText = bestDetailText($, title) || clean($('main').first().text()) || clean($('body').text());
  const dateLineRe = new RegExp(`\\d{1,2}\\s+(?:${MONTH_RE})\\.?\\s+\\d{4}(?:,?\\s*\\d{1,2}h\\d{0,2}(?:\\s*-\\s*\\d{1,2}h\\d{0,2})?)?`, 'i');
  const dateLine = (mainText.match(dateLineRe) || [])[0] || '';
  const location = extractAfter('Lieu', mainText, ['Contact', 'Organisateur', 'Organisation', 'Prix', 'Retour']) || fallback.locationText || 'Vallorbe';
  const contact = extractAfter('Contact', mainText, ['Organisateur', 'Organisation', 'Prix', 'Retour']);
  const organizer = fallback.organizer || extractAfter('Organisateur', mainText, ['Lieu', 'Contact', 'Prix', 'Retour']) || extractAfter('Organisation', mainText, ['Lieu', 'Contact', 'Prix', 'Retour']);
  const price = extractAfter('Prix', mainText, ['Contact', 'Organisateur', 'Organisation', 'Retour']);
  const description = clean(mainText
    .replace(/^.*?Agenda\(sélectionné\)/, '')
    .replace(title, '')
    .replace(dateLine, '')
    .replace(/Lieu.*$/i, '')
  );
  const evidence = clean([title, dateLine || fallback.startDate, location, organizer, contact, price, description].filter(Boolean).join(' | '));
  return normalizeEvent({
    source: 'vallorbe',
    title,
    startDate: parseVallorbeDateTime(dateLine, fallback.startDate),
    endDate: fallback.endDate || null,
    locationName: location.split(/Place|Rue|Route|\d{4}/)[0],
    locationText: location,
    city: cityFromLocation(location, fallback.city || 'Vallorbe'),
    url: fallback.url || vallorbeEventUrl(fallback.id),
    description: description || organizer || title,
    priceText: price,
    ageText: /familles?|enfants?|jeunesse|tout public|jeux|atelier|biblioth/i.test(evidence) ? 'famille / enfants mentionnés' : '',
    evidence
  });
}

async function scrapeVallorbe() {
  const html = await fetchHtml(SOURCES.vallorbe.url, 30000);
  const listings = extractVallorbeListings(html);
  const events = [];
  for (const item of listings) {
    try {
      const detailHtml = await fetchHtml(item.url, 25000);
      events.push(parseVallorbeDetail(detailHtml, item));
    } catch (e) {
      events.push(normalizeEvent({
        source: 'vallorbe', title: item.title, startDate: item.startDate, endDate: item.endDate,
        locationText: item.locationText, city: item.city, url: item.url, description: item.organizer,
        evidence: clean([item.title, item.startDate, item.endDate, item.locationText, item.organizer].filter(Boolean).join(' | '))
      }));
    }
  }
  return events;
}


function sainteCroixEventUrl(id) {
  return canonicalUrl(`/evenements/${id}`, SOURCES.sainteCroix.baseUrl);
}

function iwebTimestampToZurichIso(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour === '00' && parts.minute === '00') return date;
  return `${date}T${parts.hour}:${parts.minute}:00${zurichOffsetForDate(date)}`;
}

function extractSainteCroixListings(html) {
  const $ = cheerio.load(html);
  const attr = $('#anlassList').attr('data-entities');
  if (!attr) return [];
  const payload = JSON.parse(attr);
  return (payload.data || []).map(row => {
    const name$ = cheerio.load(row.name || '');
    const title = clean(name$.text() || row.name);
    const link = name$('a').attr('href');
    const location = clean(cheerio.load(row.lokalitaet || '').text() || row.lokalitaet || 'Sainte-Croix');
    const organizer = clean(cheerio.load(row.organisator || '').text() || row.organisator || '');
    const startDate = iwebTimestampToZurichIso(row.datumVon || row._datumVon || row['datumVon-sort']);
    const endDate = iwebTimestampToZurichIso(row.datumBis || row._datumBis || row['datumBis-sort']);
    const iconText = clean(row.hauptkategorieId || '').match(/cms-icon-([a-z-]+)/)?.[1] || '';
    return {
      id: row.id,
      title,
      url: sainteCroixEventUrl(row.id) || canonicalUrl(link, SOURCES.sainteCroix.url),
      startDate,
      endDate: endDate && endDate !== startDate ? endDate : null,
      locationText: location,
      city: cityFromLocation(location, 'Sainte-Croix'),
      organizer,
      category: iconText
    };
  }).filter(x => x.id && x.title && x.startDate);
}

function parseSainteCroixDateTime(text, fallbackDate) {
  const date = parseFrenchDate(text, 2026) || parseNumericDate(text, 2026) || (fallbackDate || '').slice(0, 10);
  return isoDateZurich(date, text);
}

function parseSainteCroixDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer').remove();
  const title = clean($('main h1, h1').first().text()) || fallback.title;
  const mainText = clean($('main').first().text()) || clean($('body').text());
  const locationLine = (mainText.match(new RegExp(`(?:${fallback.locationText ? fallback.locationText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 'Sainte-Croix'})(?:[^|]{0,120}?)(?:\\d{4}\\s+Sainte-Croix)?`, 'i')) || [])[0];
  const location = clean(locationLine || fallback.locationText || 'Sainte-Croix');
  const dateLine = (mainText.match(new RegExp(`\\d{1,2}\\s+(?:${MONTH_RE})\\.?\\s+\\d{4}(?:,?\\s*\\d{1,2}h\\d{0,2})?`, 'i')) || [])[0] || '';
  const price = extractAfter('Prix', mainText, ['Contact', 'Organisateur', 'Organisation', 'Affiche']) || (/entr[ée]e libre|gratuit/i.test(mainText) ? (mainText.match(/entr[ée]e libre|gratuit[e]?/i) || [''])[0] : '');
  const description = clean(mainText
    .replace(/^.*?Contenu principal/i, '')
    .replace(title, '')
    .replace(/Afficher le menu/i, '')
    .replace(dateLine, '')
  ).slice(0, 900);
  const evidence = clean([title, dateLine || fallback.startDate, location, fallback.organizer, fallback.category, price, description].filter(Boolean).join(' | '));
  return normalizeEvent({
    source: 'sainteCroix',
    title,
    startDate: dateLine ? parseSainteCroixDateTime(dateLine, fallback.startDate) : fallback.startDate,
    endDate: fallback.endDate || null,
    locationName: location.split(/Av\.|Avenue|Rue|Route|Place|\d{4}/)[0],
    locationText: location,
    city: cityFromLocation(location, fallback.city || 'Sainte-Croix'),
    url: fallback.url || sainteCroixEventUrl(fallback.id),
    description: description || fallback.organizer || title,
    priceText: price,
    ageText: /familles?|enfants?|jeunesse|tout public|jeux|atelier|cin[ée]|f[êe]te|festival/i.test(evidence) ? 'famille / tout public possible' : '',
    evidence
  });
}

async function scrapeSainteCroix() {
  const html = await fetchHtml(SOURCES.sainteCroix.url, 30000);
  const listings = extractSainteCroixListings(html);
  const events = [];
  for (const item of listings) {
    try {
      const detailHtml = await fetchHtml(item.url, 25000);
      events.push(parseSainteCroixDetail(detailHtml, item));
    } catch (e) {
      events.push(normalizeEvent({
        source: 'sainteCroix', title: item.title, startDate: item.startDate, endDate: item.endDate,
        locationText: item.locationText, city: item.city, url: item.url, description: item.organizer,
        evidence: clean([item.title, item.startDate, item.endDate, item.locationText, item.organizer, item.category].filter(Boolean).join(' | '))
      }));
    }
  }
  return events;
}

function tempsLibrePageUrl(page = 1) {
  return page <= 1 ? SOURCES.tempsLibre.url : `${SOURCES.tempsLibre.url}/${page}`;
}

function extractTempsLibreListings(html, pageUrl = SOURCES.tempsLibre.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('a.container-link[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!/^\/(vaud|neuch-tel|fribourg|jura|berne-partie-fr|gen-ve|valais)\/(manifestations|juniors|festivals|concerts|expositions|spectacles)\//.test(href)) return;
    const article = $(a).find('article').first();
    if (!article.length) return;
    const url = canonicalUrl(href, pageUrl);
    const title = clean($(a).attr('title') || article.find('h3').first().text());
    const teaser = clean(article.find('.teaser').first().text());
    const category = clean(article.find('.categories').first().text());
    const place = clean(article.find('.place').first().text());
    const dateText = clean(article.find('.exergue.date').first().text());
    const priceText = /gratuit/i.test(article.text()) ? 'Gratuit' : '';
    if (url && title && !/sponsored/.test(url)) listings.push({ url, title, teaser, category, place, dateText, priceText });
  });
  return uniqBy(listings, x => x.url);
}

function parseTempsLibreDate(dateText) {
  const t = clean(dateText);
  const numeric = t.match(/(?:Le|Du)?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*(?:-|au|–)\s*(\d{1,2})\.(\d{1,2})\.(\d{4}))?/i);
  if (numeric) {
    const start = `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
    const end = numeric[4] ? `${numeric[6]}-${numeric[5].padStart(2, '0')}-${numeric[4].padStart(2, '0')}` : null;
    return { startDate: start, endDate: end };
  }
  const french = parseFrenchDate(t, new Date().getFullYear());
  return { startDate: french, endDate: null };
}

function parseTempsLibreJsonLd(html) {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text().trim();
    if (!raw || !raw.includes('Event')) continue;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const event = list.find(x => x && (x['@type'] === 'Event' || (Array.isArray(x['@type']) && x['@type'].includes('Event'))));
      if (event) return event;
    } catch {}
  }
  return null;
}

function normalizeTempsLibreDateTime(value) {
  if (!value) return null;
  const s = clean(String(value)).replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return `${s.slice(0, 16)}:00+02:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function extractTempsLibreDataLayer(html) {
  const m = html.match(/dataLayer\.push\((\{[\s\S]*?\})\);/);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

function parseTempsLibreDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const ld = parseTempsLibreJsonLd(html) || {};
  const dataLayer = extractTempsLibreDataLayer(html);
  const title = htmlToText(ld.name || $('h1').first().text() || listing.title);
  const description = htmlToText(ld.description || $('meta[name="description"]').attr('content') || listing.teaser || $('.page h2').first().text());
  const location = ld.location || {};
  const address = typeof location.address === 'string' ? location.address : clean([location.address?.streetAddress, location.address?.postalCode, location.address?.addressLocality].filter(Boolean).join(' '));
  const locationName = clean(location.name || (listing.place || '').replace(/,\s*[^,]+$/, '') || '');
  const locationText = clean([locationName, address || listing.place].filter(Boolean).join(', '));
  const fallbackDates = parseTempsLibreDate(listing.dateText || $('.date').first().text());
  const text = clean($('main').text());
  const detailPrice = /\bgratuit(?:e|s)?\b|entrée libre|accès libre/i.test(`${text} ${listing.priceText}`) ? 'Gratuit / entrée libre' : (listing.priceText || '');
  let ageText = clean((dataLayer.public || []).join(', ') || $('span.title').filter((_, el) => /Age conseillé/i.test($(el).text())).parent().next().text());
  if (/0\s*à\s*5\s*ans/i.test(ageText) && /6\s*à\s*12\s*ans/i.test(ageText)) ageText = '0 à 12 ans';
  const url = clean(ld.url || $('link[rel="canonical"]').attr('href') || listing.url);
  return normalizeEvent({
    source: 'tempsLibre',
    title,
    startDate: normalizeTempsLibreDateTime(ld.startDate) || fallbackDates.startDate,
    endDate: normalizeTempsLibreDateTime(ld.endDate) || fallbackDates.endDate,
    locationName,
    locationText,
    city: cityFromLocation(`${dataLayer.city || ''} ${locationText}`, clean(dataLayer.city || '')),
    url,
    description,
    priceText: detailPrice,
    ageText,
    tags: inferTags(`${title} ${description} ${(dataLayer.pageCategories || []).join(' ')} ${listing.category || ''}`),
    evidence: clean(`TempsLibre ${listing.category || ''}. ${listing.dateText || ''}. ${ageText ? `Public: ${ageText}.` : ''} ${detailPrice ? `Prix: ${detailPrice}.` : ''} ${description} ${text.slice(0, 500)}`)
  });
}

async function scrapeTempsLibre(maxPages = 3) {
  const listings = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = tempsLibrePageUrl(page);
    try {
      const html = await fetchHtml(url, 30000);
      const pageListings = extractTempsLibreListings(html, url);
      if (!pageListings.length) break;
      listings.push(...pageListings);
    } catch (err) {
      console.warn(`[tempsLibre] listing page ${page} failed: ${err.message}`);
      break;
    }
  }
  const events = [];
  for (const listing of uniqBy(listings, x => x.url)) {
    try {
      const html = await fetchHtml(listing.url, 25000);
      events.push(parseTempsLibreDetail(html, listing));
    } catch (err) {
      const dates = parseTempsLibreDate(listing.dateText);
      events.push(normalizeEvent({
        source: 'tempsLibre', title: listing.title, startDate: dates.startDate, endDate: dates.endDate,
        locationText: listing.place, city: cityFromLocation(listing.place), url: listing.url,
        description: listing.teaser, priceText: listing.priceText,
        evidence: `TempsLibre listing fallback: ${listing.dateText} ${listing.place} ${listing.teaser}`
      }));
      console.warn(`[tempsLibre] detail fetch failed for ${listing.url}: ${err.message}`);
    }
  }
  return uniqBy(events.filter(e => e.title && e.url), e => e.id);
}


function lastSundayOfMonth(year, month) {
  const d = new Date(Date.UTC(year, month, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getUTCDate();
}

function zurichOffsetForDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '+02:00';
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month > 3 && month < 10) return '+02:00';
  if (month < 3 || month > 10) return '+01:00';
  if (month === 3) return day >= lastSundayOfMonth(year, 3) ? '+02:00' : '+01:00';
  return day < lastSundayOfMonth(year, 10) ? '+02:00' : '+01:00';
}

function isoDateZurich(date, time = '') {
  if (!date) return null;
  const m = clean(time).match(/(?:^|\D)(\d{1,2})\s*[:h](\d{2})/i) || clean(time).match(/(?:^|\D)(\d{1,2})(?:\s|$)/);
  if (!m) return date;
  const hour = Number(m[1]);
  if (hour > 23) return date;
  const minute = (m[2] || '00').padStart(2, '0');
  return `${date}T${String(hour).padStart(2, '0')}:${minute}:00${zurichOffsetForDate(date)}`;
}



function champventEventLike(text = '') {
  return /f[êe]te|manifest|spectacle|th[ée][âa]tre|tour de romandie|\bvente\b|tracteur|chasse aux|fondue|village|bal|repas|d[îi]ner|jeunesse|concert|programme|soir[ée]e|march[ée]|vin|soutien|enfants?|animation|buvette|gratuit|famille/i.test(clean(text));
}

function parseChampventDateRanges(text, fallbackYear = 2026) {
  const t = clean(text).replace(/1er/g, '1');
  const out = [];
  const pushRange = (startDay, endDay, monthName, year, raw) => {
    const month = MONTHS[clean(monthName).toLowerCase().replace(/\.$/, '')];
    if (!month) return;
    const y = String(year || fallbackYear);
    out.push({ startDate: `${y}-${month}-${String(startDay).padStart(2, '0')}`, endDate: `${y}-${month}-${String(endDay).padStart(2, '0')}`, dateText: clean(raw) });
  };
  const rangeRe = new RegExp(`(?:du\\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*)?(\\d{1,2})\\s*(?:-|–|au)\\s*(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?`, 'gi');
  for (const m of t.matchAll(rangeRe)) pushRange(m[1], m[2], m[3], m[4], m[0]);
  const masked = t.replace(rangeRe, ' ');
  const singleRe = new RegExp(`(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?`, 'gi');
  for (const m of masked.matchAll(singleRe)) {
    const month = MONTHS[m[2].toLowerCase().replace(/\.$/, '')];
    if (!month) continue;
    const y = String(m[3] || fallbackYear);
    out.push({ startDate: `${y}-${month}-${m[1].padStart(2, '0')}`, endDate: null, dateText: clean(m[0]) });
  }
  return uniqBy(out, r => `${r.startDate}|${r.endDate || ''}`);
}

function extractChampventNewsListings(html, pageUrl = SOURCES.champvent.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('.itemList').each((_, item) => {
    const title = clean($(item).find('.itemTitle').first().text());
    const status = clean($(item).find('.itemStatus').first().text());
    const description = clean($(item).find('.itemDescription').first().text());
    const href = $(item).find('a[href]').first().attr('href');
    const url = canonicalUrl(href || '', pageUrl);
    if (!title || !url || !champventEventLike(`${title} ${description} ${status}`)) return;
    const fallbackYear = Number((parseFrenchDate(status, 2026) || '2026').slice(0, 4));
    const dateRanges = parseChampventDateRanges(`${title}. ${description}`, fallbackYear);
    listings.push({ title, url, status, description, fallbackYear, dateRanges, provenance: pageUrl });
  });
  return uniqBy(listings, l => l.url);
}

function extractChampventManifestationRows(html, pageUrl = SOURCES.champvent.manifestationsUrl) {
  const $ = cheerio.load(html);
  const rows = [];
  $('ul.koCheckList li').each((_, li) => {
    const text = clean($(li).text());
    const parts = text.split('|').map(clean).filter(Boolean);
    if (parts.length < 2) return;
    const dateText = parts[0];
    const title = parts[1];
    const organizer = parts.slice(2).join(' | ');
    const ranges = parseChampventDateRanges(dateText, 2026);
    for (const range of ranges) rows.push({ title, organizer, dateText, ...range, url: `${pageUrl}#${sha(text)}`, provenance: pageUrl, description: text });
  });
  return rows;
}

function parseChampventNewsDetail(html, listing) {
  const $ = cheerio.load(html);
  $('script,style,svg,noscript').remove();
  const title = clean($('h1.editorjsH1').first().text() || $('h1').first().text() || listing.title);
  const status = clean($('.itemStatus').first().text() || listing.status || '');
  const fallbackYear = Number((parseFrenchDate(status, listing.fallbackYear || 2026) || `${listing.fallbackYear || 2026}`).slice(0, 4));
  const blocks = $('.ce-block__content, .ce-block').map((_, el) => clean($(el).text())).get().filter(Boolean);
  const description = clean(blocks.join(' ') || listing.description || $('main').text()).slice(0, 900);
  const ranges = parseChampventDateRanges(description || `${title}. ${listing.description}`, fallbackYear);
  const dateRanges = ranges.length ? ranges : listing.dateRanges || [];
  const priceText = /gratuit|totalement gratuits?|entr[ée]e libre|sans inscription/i.test(description) ? clean((description.match(/(?:totalement\s+)?gratuits?|entrée libre|sans inscription(?: nécessaire)?/i) || ['Gratuit / sans inscription'])[0]) : '';
  const locationMatch = description.match(/(?:à la|au|aux|lieu|se déroulera(?: au| à la)?)\s+([^\.]{5,120}?(?:Champvent|Saint-Christophe|Essert-sous-Champvent|Villars-sous-Champvent))/i);
  const locationText = clean(locationMatch ? locationMatch[1] : 'Champvent');
  return dateRanges.map((range, idx) => normalizeEvent({
    source: 'champvent', title, startDate: range.startDate, endDate: range.endDate,
    locationName: locationText, locationText, city: /Saint-Christophe/i.test(locationText) ? 'Champvent' : cityFromLocation(locationText, 'Champvent'),
    url: `${listing.url}${idx ? `#${range.startDate}` : ''}`,
    description, ageText: /enfants?|famille/i.test(description) ? 'famille / enfants' : '', priceText,
    sourceProvenance: `Commune de Champvent actualité: ${listing.url}`,
    evidence: clean(`${range.dateText || ''} ${status} ${description}`)
  }));
}

async function scrapeChampvent() {
  const [currentHtml, olderHtml, manifestationsHtml] = await Promise.all([
    fetchHtml(SOURCES.champvent.url, 30000),
    fetchHtml(SOURCES.champvent.olderUrl, 30000).catch(() => ''),
    fetchHtml(SOURCES.champvent.manifestationsUrl, 30000)
  ]);
  const events = extractChampventManifestationRows(manifestationsHtml).map(row => normalizeEvent({
    source: 'champvent', title: row.title, startDate: row.startDate, endDate: row.endDate,
    locationName: 'Champvent', locationText: ['Champvent', row.organizer].filter(Boolean).join(', '), city: 'Champvent', url: row.url,
    description: row.description, ageText: champventEventLike(row.description) && /jeunesse|th[ée][âa]tre|tracteur|vente|village/i.test(row.description) ? 'tout public / village' : '',
    sourceProvenance: `Commune de Champvent manifestations: ${SOURCES.champvent.manifestationsUrl}`,
    evidence: row.description
  }));
  const listings = uniqBy([
    ...extractChampventNewsListings(currentHtml, SOURCES.champvent.url),
    ...(olderHtml ? extractChampventNewsListings(olderHtml, SOURCES.champvent.olderUrl) : [])
  ], l => l.url);
  for (const listing of listings) {
    try {
      const html = await fetchHtml(listing.url, 25000);
      events.push(...parseChampventNewsDetail(html, listing));
    } catch (err) {
      for (const range of listing.dateRanges || []) events.push(normalizeEvent({
        source: 'champvent', title: listing.title, startDate: range.startDate, endDate: range.endDate,
        locationName: 'Champvent', locationText: 'Champvent', city: 'Champvent', url: listing.url,
        description: listing.description, sourceProvenance: `Commune de Champvent actualité listing: ${listing.provenance}`,
        evidence: `${listing.status} ${listing.description}`
      }));
      console.warn(`[champvent] detail fetch failed for ${listing.url}: ${err.message}`);
    }
  }
  return uniqBy(events.filter(e => e.title && e.startDate && e.url), e => recommendationKey(e));
}


// --- Estavayer-le-Lac « Sunset Jazz » -----------------------------------------
// One event per festival day. Each day is its own `.col-md-4` column carrying a
// dated <h3> and an accordion whose items map a venue (button) to a « HH:MM -
// HH:MM: Artiste » line (body). Headers that don't parse to a French date (e.g.
// the closing « Le Comité de cafetiers-restaurateurs ») are skipped.
function extractSunsetJazzDays(html, pageUrl = SOURCES.sunsetJazz.url) {
  const $ = cheerio.load(html);
  const days = [];
  $('h3').each((_, h) => {
    const dateText = clean($(h).text());
    const startDate = parseFrenchDate(dateText);
    if (!startDate) return;
    // The day's programme lives in the same column container as its <h3>.
    const column = $(h).closest('.col-md-4, .col-md-6, .col-md-3, .col-md-12');
    const scope = column.length ? column : $(h).parent();
    const acts = [];
    scope.find('.accordion-item').each((__, item) => {
      const venue = clean($(item).find('.accordion-button, .accordion-header').first().text());
      $(item).find('.accordion-body').each((___, body) => {
        const line = clean($(body).text());
        if (line) acts.push({ venue, line });
      });
    });
    if (acts.length) days.push({ dateText, startDate, acts });
  });
  return uniqBy(days, d => d.startDate);
}

function sunsetJazzEventFromDay(day, pageUrl = SOURCES.sunsetJazz.url) {
  let earliest = null;
  for (const a of day.acts) {
    const m = a.line.match(/(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
    if (!earliest || hhmm < earliest) earliest = hhmm;
  }
  const startDate = earliest ? isoDateZurich(day.startDate, earliest) : day.startDate;
  const programme = day.acts.map(a => clean(`${a.venue} — ${a.line}`)).join(' ; ');
  return normalizeEvent({
    source: 'sunsetJazz',
    title: `Sunset Jazz Estavayer-le-Lac — ${day.dateText}`,
    startDate,
    endDate: null,
    locationName: 'Le Bourg (vieille ville)',
    locationText: 'Le Bourg (rues et places de la vieille ville), Estavayer-le-Lac',
    city: 'Estavayer-le-Lac',
    url: `${pageUrl}#${day.startDate}`,
    description: clean([
      "Festival Sunset Jazz — concerts de jazz de rue en plein air dans le Bourg médiéval d'Estavayer-le-Lac (Broye / Lac de Neuchâtel).",
      'Organisé par le Comité de cafetiers-restaurateurs du Bourg avec la Commune : plusieurs scènes dans les rues et places emblématiques, spectacle plein air, ambiance festive et conviviale, accès libre.',
      `Programme du jour : ${programme}.`
    ].join(' ')).slice(0, 700),
    ageText: 'tout public / famille',
    priceText: 'Accès libre (concerts de rue dans le Bourg)',
    tags: inferTags('festival spectacle concert musique jazz plein air rue vieille ville estavayer lac famille convivial'),
    sourceProvenance: `Commune d'Estavayer-le-Lac – programmation Sunset Jazz: ${pageUrl}`,
    officialSources: [pageUrl],
    evidence: clean(`${day.dateText} | ${programme}`).slice(0, 1200)
  });
}

async function scrapeSunsetJazz() {
  const html = await fetchHtml(SOURCES.sunsetJazz.url, 30000);
  const days = extractSunsetJazzDays(html);
  const today = new Date().toISOString().slice(0, 10);
  const events = days.map(d => sunsetJazzEventFromDay(d))
    .filter(e => e.title && e.startDate && e.startDate.slice(0, 10) >= today);
  return uniqBy(events, e => recommendationKey(e));
}


function fetchEchallensHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

function echallensMonthUrl(monthDate) {
  return monthDate ? SOURCES.echallens.url + '?date=' + monthDate : SOURCES.echallens.url;
}

function extractEchallensListings(html, pageUrl = SOURCES.echallens.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('#jcl_layout_body .item-event[itemscope], .jcl_layout_flat .item-event[itemscope]').each((_, el) => {
    const $el = $(el);
    const url = canonicalUrl($el.find('meta[itemprop="url"]').attr('content') || $el.find('a.eventtitle[href]').attr('href'), pageUrl);
    const title = clean($el.find('meta[itemprop="name"]').attr('content') || $el.find('a.eventtitle').text() || $el.find('.list-item-title').text());
    let startDate = clean($el.find('meta[itemprop="startDate"]').attr('content') || '');
    if (startDate) startDate = startDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const dateText = clean($el.find('.date-event').text());
    if (!startDate) {
      const m = dateText.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
      if (m) startDate = isoDate(m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'), m[4] || '');
    }
    if (title && startDate && url) listings.push({ title, url, startDate, dateText });
  });
  return uniqBy(listings, x => x.url + '|' + x.startDate);
}

function parseEchallensDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const title = clean($('h1[itemprop="name"]').first().text() || listing.title || $('meta[itemprop="name"]').attr('content'));
  const url = canonicalUrl($('meta[itemprop="url"]').attr('content') || listing.url || SOURCES.echallens.url, SOURCES.echallens.url);
  let startDate = clean($('meta[itemprop="startDate"]').attr('content') || listing.startDate || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const dateText = clean($('.date-event.jcl_event_detail, .date-event').first().text() || listing.dateText || '');
  const endMatch = dateText.match(/-\s*(\d{1,2})[:h](\d{2})\b/);
  const endTime = endMatch ? endMatch[1] + 'h' + endMatch[2] : '';
  const endDate = startDate && endTime ? isoDate(startDate.slice(0, 10), endTime) : null;
  const descHtml = $('.eventdesclarge').first().html() || '';
  const description = clean(htmlToText(descHtml) || $('.eventdesclarge').first().text() || 'Agenda communal des manifestations d’Echallens.');
  const externalLinks = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]).filter(h => /^https?:/i.test(h) && !h.includes('echallens.ch'));
  if (!externalLinks.length && /Vélo Club|vcechallens/i.test(html)) externalLinks.push('https://vcechallens.ch/larandodesbles/');
  const priceText = clean((description.match(/(?:entrée libre|gratuit(?:e|s)?|[0-9]+\s*(?:CHF|fr\.?|-))/i) || [''])[0]);
  const ageText = /enfants?|famille|jeunesse|tout public/i.test(title + ' ' + description) ? 'tout public / famille' : '';
  return normalizeEvent({
    source: 'echallens', title, startDate, endDate, locationName: 'Echallens', locationText: 'Echallens', city: 'Echallens', url,
    description, ageText, priceText, tags: inferTags(title + ' ' + description + ' Echallens'),
    sourceProvenance: 'Commune d’Echallens calendrier des manifestations (' + (dateText || listing.dateText || startDate) + ')',
    officialSources: [url, ...externalLinks].filter(Boolean),
    evidence: clean([dateText, listing.dateText, description, externalLinks.join(' ')].filter(Boolean).join(' | '))
  });
}

async function scrapeEchallens() {
  const monthStarts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2026, 5 + i, 1));
    monthStarts.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-01');
  }
  const listingMap = new Map();
  for (const month of monthStarts) {
    const pageUrl = echallensMonthUrl(month === '2026-06-01' ? null : month);
    const html = fetchEchallensHtml(pageUrl, 30000);
    for (const item of extractEchallensListings(html, pageUrl)) listingMap.set(item.url + '|' + item.startDate, item);
  }
  return uniqBy([...listingMap.values()].map(listing => normalizeEvent({
    source: 'echallens', title: listing.title, startDate: listing.startDate, endDate: null,
    locationName: 'Echallens', locationText: 'Echallens', city: 'Echallens', url: listing.url,
    description: 'Agenda communal des manifestations d’Echallens. Détail officiel à consulter via la fiche de l’événement.',
    ageText: /halte estivale|jeunesse|famille|enfants?/i.test(listing.title) ? 'tout public / famille' : '',
    tags: inferTags(listing.title + ' Echallens manifestation village culture sport marché'),
    sourceProvenance: 'Commune d’Echallens calendrier des manifestations listing (' + (listing.dateText || listing.startDate) + ')',
    officialSources: [listing.url],
    evidence: clean([listing.dateText, listing.title, listing.url].filter(Boolean).join(' | '))
  })).filter(e => e.title && e.startDate && e.url), e => e.id);
}

function parseEchallensTourismeDateRange(text, fallbackYear = 2026) {
  const t = clean(text).toLowerCase();
  const fullRange = t.match(new RegExp('(\\d{1,2})\\s+(' + MONTH_RE + ')\\s+au\\s+(\\d{1,2})\\s+(' + MONTH_RE + ')(?:\\s+(\\d{4}))?', 'i'));
  if (fullRange) {
    const year = fullRange[5] || String(fallbackYear);
    return {
      startDate: `${year}-${MONTHS[fullRange[2]]}-${fullRange[1].padStart(2, '0')}`,
      endDate: `${year}-${MONTHS[fullRange[4]]}-${fullRange[3].padStart(2, '0')}`
    };
  }
  const sameMonthRange = t.match(new RegExp('(\\d{1,2})\\s+au\\s+(\\d{1,2})\\s+(' + MONTH_RE + ')(?:\\s+(\\d{4}))?', 'i'));
  if (sameMonthRange) {
    const year = sameMonthRange[4] || String(fallbackYear);
    return {
      startDate: `${year}-${MONTHS[sameMonthRange[3]]}-${sameMonthRange[1].padStart(2, '0')}`,
      endDate: `${year}-${MONTHS[sameMonthRange[3]]}-${sameMonthRange[2].padStart(2, '0')}`
    };
  }
  const single = parseFrenchDate(t, fallbackYear);
  return { startDate: single, endDate: null };
}

function echallensTourismePageUrl(page = 1) {
  return page <= 1 ? SOURCES.echallensTourisme.url : `${SOURCES.echallensTourisme.url}?_pagination=${page}`;
}

function extractEchallensTourismeListings(html, pageUrl = SOURCES.echallensTourisme.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('article.wpgb-card').each((_, el) => {
    const $el = $(el);
    const url = canonicalUrl($el.find('h3 a[href], a.wpgb-card-layer-link[href]').first().attr('href'), pageUrl);
    const title = clean($el.find('h3').first().text());
    const dateText = clean($el.find('.date_event').first().text());
    const placeText = clean($el.find('.lieu_event').first().text());
    const { startDate, endDate } = parseEchallensTourismeDateRange(dateText, 2026);
    const postId = (($el.attr('class') || '').match(/wpgb-post-(\d+)/) || [])[1] || '';
    if (title && url && startDate) listings.push({ title, url, dateText, startDate, endDate, placeText, postId });
  });
  return uniqBy(listings, x => x.url + '|' + x.startDate);
}

function parseEchallensTourismeDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const $details = $('.event-details.details').first();
  const title = clean($details.find('h2').first().text() || listing.title || $('title').text().replace(/- Echallens.*/i, ''));
  const dateText = clean($details.find('h4').first().text() || listing.dateText || '');
  const range = parseEchallensTourismeDateRange(dateText, 2026);
  const description = clean($details.find('.description').text() || 'Événement régional relayé par Echallens Région Tourisme.');
  const contactLines = [];
  $details.find('.contact-infos p').each((_, p) => { const v = clean($(p).text()); if (v) contactLines.push(v); });
  const locationText = contactLines.find(v => /\d{4}|place|rue|chemin|route|salle|église|eglise|collège|college/i.test(v)) || listing.placeText || '';
  const city = cityFromLocation(`${locationText} ${listing.placeText}`, listing.placeText || 'Echallens');
  const bodyClasses = clean($('body').attr('class') || '');
  const publicTerms = [...bodyClasses.matchAll(/public-cible-([a-z0-9-]+)/g)].map(m => m[1].replace(/-/g, ' '));
  const typeTerms = [...bodyClasses.matchAll(/type-devenement-([a-z0-9-]+)/g)].map(m => m[1].replace(/-/g, ' '));
  const ageText = publicTerms.some(t => /famille|enfants|tout public/i.test(t)) ? clean(publicTerms.join(', ')) : '';
  const priceText = clean((`${description} ${$details.text()}`.match(/entrée libre|gratuit(?:e|s)?|prix libre|[0-9]+\s*(?:CHF|fr\.?)/i) || [''])[0]);
  const officialSources = [listing.url || SOURCES.echallensTourisme.url];
  $details.find('.cta-evenements a[href]').each((_, a) => {
    const href = canonicalUrl($(a).attr('href'), listing.url || SOURCES.echallensTourisme.url);
    if (href) officialSources.push(href);
  });
  return normalizeEvent({
    source: 'echallensTourisme', title, startDate: range.startDate || listing.startDate, endDate: range.endDate || listing.endDate || null,
    locationName: locationText || listing.placeText || 'Gros-de-Vaud', locationText: [locationText, listing.placeText].filter(Boolean).join(' | '), city,
    url: listing.url || SOURCES.echallensTourisme.url, description, ageText, priceText,
    tags: inferTags(`${title} ${description} ${typeTerms.join(' ')} ${listing.placeText || ''}`),
    sourceProvenance: `Echallens Région Tourisme agenda (${dateText || listing.dateText || listing.startDate})`,
    officialSources: uniqBy(officialSources, x => x),
    evidence: clean([dateText, listing.placeText, publicTerms.join(', '), typeTerms.join(', '), description, officialSources.slice(1).join(' ')].filter(Boolean).join(' | '))
  });
}

async function scrapeEchallensTourisme(maxPages = 9) {
  const listingMap = new Map();
  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = echallensTourismePageUrl(page);
    const html = await fetchHtml(pageUrl, 30000);
    const listings = extractEchallensTourismeListings(html, pageUrl);
    for (const listing of listings) listingMap.set(listing.url + '|' + listing.startDate, listing);
    const $ = cheerio.load(html);
    const hasNext = $(`a[data-page="${page + 1}"]`).length > 0 || $('.wpgb-page-next a[href]').length > 0;
    if (!hasNext && page > 1) break;
  }
  const events = [];
  for (const listing of listingMap.values()) {
    try {
      const html = await fetchHtml(listing.url, 25000);
      events.push(parseEchallensTourismeDetail(html, listing));
    } catch (err) {
      console.warn(`[echallensTourisme] detail fetch failed for ${listing.url}: ${err.message}`);
      events.push(normalizeEvent({
        source: 'echallensTourisme', title: listing.title, startDate: listing.startDate, endDate: listing.endDate || null,
        locationName: listing.placeText || 'Gros-de-Vaud', locationText: listing.placeText || 'Gros-de-Vaud', city: listing.placeText || 'Echallens', url: listing.url,
        description: 'Événement régional relayé par Echallens Région Tourisme. Détails à confirmer sur la fiche officielle.',
        tags: inferTags(`${listing.title} ${listing.placeText} manifestation festival concert exposition terroir`),
        sourceProvenance: `Echallens Région Tourisme listing (${listing.dateText})`, officialSources: [listing.url], evidence: `${listing.dateText} | ${listing.placeText}`
      }));
    }
  }
  return uniqBy(events.filter(e => e.title && e.startDate && e.url), e => e.id);
}


function extractNeuchatelVilleListings(html, pageUrl = SOURCES.neuchatelVille.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('.event').each((_, el) => {
    const node = $(el);
    const a = node.find('.title a[href], a.event-detail-link[href], .image a[href]').first();
    const url = canonicalUrl(a.attr('href'), SOURCES.neuchatelVille.baseUrl);
    const title = stripLead(node.find('.title a').first().text() || a.attr('title') || node.find('img[alt]').attr('alt') || '');
    const description = stripLead(node.find('.description').text());
    const periodUid = node.find('.period-uid').val() || (url.match(/\/(\d+)$/) || [])[1] || '';
    const eventUid = node.find('.event-uid').val() || (url.match(/-(\d+)\//) || [])[1] || '';
    const periodTimestamp = node.find('.period-timestamp').val() || '';
    const eventTimestamp = node.find('.event-timestamp').val() || '';
    const dateText = stripLead(node.find('.header .date, .date').first().text());
    if (url && title && /\/agenda\/detail\//.test(url)) listings.push({ url, title, description, periodUid, eventUid, periodTimestamp, eventTimestamp, dateText });
  });
  return uniqBy(listings, x => `${x.url}|${x.periodUid || x.periodTimestamp || x.dateText}`);
}

function parseNeuchatelDateText(text = '') {
  const t = clean(text);
  const numeric = t.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:\s*(?:à|a|,)?\s*(\d{1,2})[:h](\d{2})?)?/i);
  if (numeric) {
    const date = `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
    const time = numeric[4] ? `${numeric[4].padStart(2, '0')}:${(numeric[5] || '00').padStart(2, '0')}:00${zurichOffsetForDate(date)}` : '';
    return { startDate: time ? `${date}T${time}` : date, endDate: null };
  }
  const range = t.match(new RegExp(`du\\s+(\\d{1,2})\\s*(${MONTH_RE})?\\.?\\s+au\\s+(\\d{1,2})\\s*(${MONTH_RE})(?:\\s+(\\d{4}))?`, 'i'));
  if (range) {
    const year = range[5] || String(new Date().getFullYear());
    const startMonth = MONTHS[(range[2] || range[4]).toLowerCase()];
    const endMonth = MONTHS[range[4].toLowerCase()];
    return { startDate: `${year}-${startMonth}-${range[1].padStart(2, '0')}`, endDate: `${year}-${endMonth}-${range[3].padStart(2, '0')}` };
  }
  const date = parseFrenchDate(t, new Date().getFullYear());
  if (!date) return { startDate: null, endDate: null };
  const time = (t.match(/(?:à|a|,)?\s*(\d{1,2})[:h](\d{2})?/i) || []).slice(1);
  return { startDate: time[0] ? `${date}T${time[0].padStart(2, '0')}:${(time[1] || '00').padStart(2, '0')}:00${zurichOffsetForDate(date)}` : date, endDate: null };
}

function parseNeuchatelVilleDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const title = stripLead($('.event-detail h1').first().text() || listing.title);
  const description = stripLead($('.event-detail .description').first().text() || listing.description);
  const headerDate = stripLead($('.event-detail header .dates').first().text());
  const infos = $('.complementary-information .info').map((_, el) => stripLead($(el).text())).get().filter(Boolean);
  const dateInfo = infos.find(x => /\b(le|du):?\s*\d{1,2}[.\/]/i.test(x)) || headerDate || listing.dateText || '';
  const parsed = parseNeuchatelDateText(dateInfo);
  const headerVenue = (headerDate.split('|')[1] || '').trim();
  const address = infos.find(x => /\d{4}\s+Neuch/i.test(x) && !/t[ée]l[ée]phone|e-mail|@/i.test(x)) || '';
  const locationName = headerVenue || infos.find((x, idx) => idx > 1 && !/\d{4}\s+Neuch|t[ée]l[ée]phone|e-mail|@|^https?:|www\./i.test(x)) || 'Neuchâtel';
  const priceText = [description, ...infos].find(x => /gratuit|entrée libre|tarif|prix|collecte|chapeau|CHF/i.test(x)) || '';
  const officialLinks = $('.event-detail a[href]').map((_, a) => canonicalUrl($(a).attr('href'), SOURCES.neuchatelVille.baseUrl)).get()
    .filter(u => u && !/neuchatelville\.ch\/sortir-et-decouvrir\/agenda$/.test(u));
  const evidence = clean([dateInfo, locationName, address, priceText, listing.description].filter(Boolean).join(' | '));
  return { title, description, startDate: parsed.startDate, endDate: parsed.endDate, locationName, locationText: clean([locationName, address].filter(Boolean).join(', ')), city: 'Neuchâtel', priceText, officialSources: uniqBy([listing.url, ...officialLinks], x => x), evidence };
}

async function fetchNeuchatelVilleNextPage(loadMoreUrl, visiblePeriods, fromTimestamp, limit = 9) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const body = new URLSearchParams({
      'tx_culturoscope_list[fromTimestamp]': fromTimestamp,
      'tx_culturoscope_list[limit]': String(limit),
      'tx_culturoscope_list[visiblePeriods]': visiblePeriods
    });
    const res = await fetch(loadMoreUrl, { method: 'POST', signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', referer: SOURCES.neuchatelVille.url, 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
    if (!res.ok) throw new Error(`${loadMoreUrl} -> HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function scrapeNeuchatelVille(maxPages = 8) {
  const firstHtml = await fetchHtml(SOURCES.neuchatelVille.url, 30000);
  const $first = cheerio.load(firstHtml);
  let loadMoreUrl = canonicalUrl($first('#load-more-url').val(), SOURCES.neuchatelVille.baseUrl);
  let listings = extractNeuchatelVilleListings(firstHtml, SOURCES.neuchatelVille.url);
  let html = firstHtml;
  for (let page = 2; page <= maxPages && loadMoreUrl; page++) {
    const $ = cheerio.load(html);
    const visiblePeriods = listings.map(x => x.periodUid).filter(Boolean).join(',');
    const fromTimestamp = (listings[listings.length - 1] || {}).periodTimestamp || $('.event:last-child .period-timestamp').val();
    if (!fromTimestamp || !visiblePeriods) break;
    html = await fetchNeuchatelVilleNextPage(loadMoreUrl, visiblePeriods, fromTimestamp, 9);
    const more = extractNeuchatelVilleListings(html, SOURCES.neuchatelVille.url);
    if (!more.length) break;
    listings = uniqBy([...listings, ...more], x => `${x.url}|${x.periodUid || x.periodTimestamp || x.dateText}`);
    if (!/show-load-more-button/.test(html)) break;
  }
  const events = [];
  for (let i = 0; i < listings.length; i += 6) {
    const batch = listings.slice(i, i + 6);
    const parsed = await Promise.all(batch.map(async listing => {
      try { return { listing, detail: parseNeuchatelVilleDetail(await fetchHtml(listing.url, 18000), listing) }; }
      catch { return { listing, detail: parseNeuchatelVilleDetail('', listing) }; }
    }));
    for (const { listing, detail } of parsed) {
      const startDate = detail.startDate || parseNeuchatelDateText(listing.dateText).startDate;
      if (!startDate) continue;
      events.push(normalizeEvent({
        source: 'neuchatelVille', url: listing.url, title: detail.title || listing.title, startDate, endDate: detail.endDate,
        locationName: detail.locationName || 'Neuchâtel', locationText: detail.locationText || 'Neuchâtel', city: 'Neuchâtel',
        description: detail.description || listing.description, priceText: detail.priceText, officialSources: detail.officialSources || [listing.url],
        sourceProvenance: `Ville de Neuchâtel agenda / Culturoscope: ${SOURCES.neuchatelVille.url}`,
        evidence: detail.evidence || listing.description
      }));
    }
  }
  return uniqBy(events, e => e.id);
}

function extractLePommierListings(html, pageUrl = SOURCES.lePommier.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('.eventv2-grid a.grid-item[href], .eventv2-grid-wrapper a.grid-item[href]').each((_, a) => {
    const $a = $(a);
    const url = canonicalUrl($a.attr('href'), pageUrl);
    if (!url || !/\/event\/\d+/.test(url)) return;
    const title = clean($a.find('.content').attr('title') || $a.attr('title') || $a.find('.title').text() || $a.find('.contentWrapper').children().last().text());
    const dateText = clean($a.find('.date').first().text());
    const typeText = clean($a.find('.type').first().text() || $a.find('.band').first().text());
    const epoch = Number($a.attr('data-date'));
    const startDate = Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString().slice(0, 10) : isoDate(parseFrenchDate(dateText, 2027), dateText);
    if (!title) return;
    listings.push({ title, url, dateText, typeText, startDate });
  });
  return uniqBy(listings, x => x.url);
}

function lePommierInfoValue(text, label, nextLabels = []) {
  const labels = [label, ...nextLabels].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const stop = labels.slice(1).join('|') || 'Billetterie|Les horaires et tarifs';
  const re = new RegExp(`${labels[0]}\\s+(.+?)(?=\\s+(?:${stop})\\s+|$)`, 'i');
  const m = clean(text).match(re);
  return m ? clean(m[1]) : '';
}

function parseLePommierDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const pageText = clean($('body').text());
  const title = clean(listing.title || $('h1').first().text().replace(/^(?:Le|Du)\s+\d{1,2}\s+\S+\.?\s+(?:au\s+\d{1,2}\s+\S+\.?\s+)?/i, '').replace(/\s+(Théâtre|Impro|Musique|Danse|Festival d'impro)$/i, '') || $('title').text().replace(/- Le Pommier.*/i, ''));
  const url = listing.url || $('link[rel="canonical"]').attr('href') || SOURCES.lePommier.url;
  const ageText = lePommierInfoValue(pageText, 'Age conseillé', ['Durée', 'Made in', 'Lieu']);
  const duration = lePommierInfoValue(pageText, 'Durée', ['Made in', 'Lieu']);
  const locationBlock = lePommierInfoValue(pageText, 'Lieu', ['Billetterie']);
  const genre = lePommierInfoValue(pageText, 'Genre', ["Type d'événement", 'Age conseillé', 'Durée']);
  const eventType = lePommierInfoValue(pageText, "Type d'événement", ['Age conseillé', 'Durée']);
  const descMatch = pageText.match(/Billetterie\s+(.+?)\s+Les horaires et tarifs\s+/i);
  const description = clean([descMatch?.[1] || '', duration ? `Durée: ${duration}` : '', genre || '', eventType || ''].filter(Boolean).join(' | '));
  const tariffMatch = pageText.match(/Les horaires et tarifs\s+(.+?)(?=\s+Distribution\s+|\s+Soutiens et production\s+|\s+Teaser\s+|\s+Cela pourrait vous intéresser\s+|$)/i);
  const tariffText = clean(tariffMatch?.[1] || '');
  const priceText = clean((tariffText.match(/(?:Jeune public\s+)?(?:Tarif|Ecole|École|Abonnement|AG Culturel|gratuit).+/i) || [tariffText]).at(0));
  const occurrences = [];
  const dateLineRe = new RegExp(`(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+\\d{1,2}\\s+(?:${MONTH_RE})\\.?\\s+\\d{4}\\s+à\\s+\\d{1,2}\\s*h(?:\\s*\\d{2})?`, 'gi');
  for (const m of tariffText.matchAll(dateLineRe)) {
    const line = clean(m[0]);
    const date = parseFrenchDate(line, 2027);
    if (date) occurrences.push({ line, startDate: isoDate(date, line) });
  }
  if (!occurrences.length && listing.startDate) occurrences.push({ line: listing.dateText || listing.startDate, startDate: listing.startDate });
  return occurrences.map(occ => normalizeEvent({
    source: 'lePommier',
    title,
    startDate: occ.startDate,
    endDate: null,
    locationName: 'Le Pommier',
    locationText: locationBlock || 'Le Pommier, Rue du Pommier 9, 2000 Neuchâtel',
    city: 'Neuchâtel',
    url,
    description,
    ageText,
    priceText,
    tags: ['culture', 'indoor'],
    sourceProvenance: `Le Pommier saison jeune public (${listing.dateText || occ.line})`,
    officialSources: [url],
    evidence: clean([listing.typeText, eventType, ageText, duration, occ.line, priceText, description].filter(Boolean).join(' | '))
  }));
}

async function scrapeLePommier() {
  const html = await fetchHtml(SOURCES.lePommier.url, 30000);
  const listings = extractLePommierListings(html, SOURCES.lePommier.url);
  const events = [];
  for (const listing of listings) {
    try {
      const detailHtml = await fetchHtml(listing.url, 30000);
      events.push(...parseLePommierDetail(detailHtml, listing));
    } catch (err) {
      console.warn(`[lePommier] detail fetch failed for ${listing.url}: ${err.message}`);
      events.push(...parseLePommierDetail('', listing));
    }
  }
  return { events: uniqBy(events, e => e.id), note: `${events.length} Le Pommier young-audience occurrence(s) from ${listings.length} listing(s)` };
}

function bennoSeasonYearFromMonth(month) {
  const m = Number(month);
  return m >= 9 ? 2026 : 2027;
}

function parseBennoDateWithoutYear(text) {
  const date = parseFrenchDate(clean(text).normalize('NFC'), 2026);
  if (!date) return null;
  const month = date.slice(5, 7);
  return `${bennoSeasonYearFromMonth(month)}-${month}-${date.slice(8, 10)}`;
}

function bennoSlug(title = '') {
  return titleKey(title).replace(/\s+/g, '-').slice(0, 80) || sha(title);
}

function extractTheatreBennoBessonListings(html, pageUrl = SOURCES.theatreBennoBesson.url) {
  const $ = cheerio.load(html);
  const events = [];
  const seen = new Set();
  const byId = id => $(`[id="${String(id).replace(/"/g, '\"')}"]`);
  const textById = id => clean(byId(id).text()).normalize('NFC');

  $('[id^="comp-mbunoa8k__item"]').each((_, root) => {
    const id = ($(root).attr('id') || '').replace(/^comp-mbunoa8k__item/, '');
    if (!id) return;
    const dateText = textById(`comp-mbunoa8p2__item${id}`);
    let title = textById(`comp-mbunoa8s__item${id}`);
    let company = textById(`comp-mbunp8b8__item${id}`);
    const categoryAge = textById(`comp-mbunoa8t2__item${id}`);
    const schoolNote = textById(`comp-mbunqfsw__item${id}`);
    if (/[-–]\s*$/.test(title) && company) { title = `${title} ${company}`; company = ''; }
    const date = parseBennoDateWithoutYear(dateText);
    const detailUrl = canonicalUrl(byId(`comp-mbuo7ime1__item${id}`).find('a[href*="/programme-26-27/"]').attr('href') || '', pageUrl)
      || `${pageUrl}#${bennoSlug(title)}`;
    const ageText = (categoryAge.match(/d[èe]s\s*\d+\s*ans/i) || [''])[0];
    if (!title || !date) return;
    const key = `${title}|${date}`;
    if (seen.has(key)) return; seen.add(key);
    events.push(normalizeEvent({
      source: 'theatreBennoBesson', title, startDate: date,
      locationName: 'Théâtre Benno Besson', locationText: 'Théâtre Benno Besson, Yverdon-les-Bains', city: 'Yverdon-les-Bains',
      url: detailUrl, ageText, priceText: '',
      description: clean([company, categoryAge, schoolNote].filter(Boolean).join(' — ')),
      evidence: clean([dateText, title, company, categoryAge, schoolNote, detailUrl].filter(Boolean).join(' | ')),
      sourceProvenance: `${pageUrl} — page Jeune Public Wix statique`,
      officialSources: [pageUrl, detailUrl]
    }));
  });

  $('[id^="comp-mbyu0lxn__item"]').each((_, root) => {
    const id = ($(root).attr('id') || '').replace(/^comp-mbyu0lxn__item/, '');
    if (!id) return;
    const category = textById(`comp-mbyu0lyi__item${id}`);
    const title = textById(`comp-mbyu0lyy__item${id}`);
    const company = textById(`comp-mbyu0lz3__item${id}`);
    const dateAge = textById(`comp-mbyu0lz52__item${id}`);
    const date = parseFrenchDate(dateAge, 2027);
    const ageText = (dateAge.match(/d[èe]s\s*\d+\s*ans/i) || [''])[0];
    if (!title || !date) return;
    const key = `${title}|${date}`;
    if (seen.has(key)) return; seen.add(key);
    const eventUrl = `${pageUrl}#${bennoSlug(title)}`;
    events.push(normalizeEvent({
      source: 'theatreBennoBesson', title, startDate: date,
      locationName: 'Théâtre Benno Besson', locationText: 'Théâtre Benno Besson, Yverdon-les-Bains', city: 'Yverdon-les-Bains',
      url: eventUrl, ageText, priceText: '',
      description: clean([company, category, dateAge].filter(Boolean).join(' — ')),
      evidence: clean([category, title, company, dateAge].filter(Boolean).join(' | ')),
      sourceProvenance: `${pageUrl} — bloc Spectacles à venir`,
      officialSources: [pageUrl]
    }));
  });
  return events;
}

async function scrapeTheatreBennoBesson() {
  const html = await fetchHtml(SOURCES.theatreBennoBesson.url, 30000);
  return extractTheatreBennoBessonListings(html, SOURCES.theatreBennoBesson.url);
}


function parseEchandoleDateText(text, fallbackYear = 2026) {
  const t = clean(text);
  const date = parseNumericDate(t, fallbackYear);
  return isoDateZurich(date, t);
}

function extractEchandoleListings(html, pageUrl = SOURCES.echandole.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('.event-item').each((_, item) => {
    const $item = $(item);
    const url = canonicalUrl($item.find('a[href*="/spectacles/"]').first().attr('href'), pageUrl);
    const title = clean($item.find('h2').first().text());
    if (!url || !title) return;
    const dateTexts = $item.find('.date').map((__, d) => clean($(d).text())).get().filter(Boolean);
    const category = clean($item.find('.infos.category').first().text());
    const infos = $item.find('.infos').map((__, info) => clean($(info).text())).get().filter(Boolean);
    const ageText = infos.find(x => /d[èe]s\s*\d+\s*ans|tout public|famille/i.test(x)) || '';
    listings.push({ title, url, dateTexts, category, ageText, rawText: clean($item.text()) });
  });
  return uniqBy(listings, l => `${l.url}|${l.title}|${l.dateTexts.join(',')}`);
}

function parseEchandoleDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const $scope = $('.single-event').length ? $('.single-event') : $('body');
  const title = clean($scope.find('h1').first().text() || listing.title || $('title').text().split('|')[0]);
  const subtitle = clean($scope.find('h1').first().next('p').text());
  const dateTexts = $scope.find('.date').map((_, d) => clean($(d).text())).get().filter(Boolean);
  const occurrenceDates = (dateTexts.length ? dateTexts : (listing.dateTexts || []))
    .map(t => parseEchandoleDateText(t, 2026)).filter(Boolean);
  const infos = $scope.find('.infos').map((_, info) => clean($(info).text())).get().filter(Boolean);
  const category = clean($scope.find('.infos.category').first().text() || listing.category || '');
  const ageText = infos.find(x => /d[èe]s\s*\d+\s*ans|tout public|famille/i.test(x)) || listing.ageText || '';
  const durationText = infos.find(x => /\b\d+\s*min\b|\b\d+h\b/i.test(x)) || '';
  const priceText = infos.find(x => /tarif|gratuit|chf|\.\-/i.test(x)) || '';
  const paragraphs = $scope.find('p.wp-block-paragraph').map((_, p) => clean($(p).text())).get()
    .filter(t => t && !/^texte, mise en scène/i.test(t) && !/^ecouter le podcast/i.test(t));
  const description = clean([subtitle, category, durationText, ...paragraphs.slice(0, 3)].filter(Boolean).join(' '));
  const evidence = clean([...(dateTexts.length ? dateTexts : listing.dateTexts || []), category, ageText, durationText, priceText].filter(Boolean).join(' | '));
  const dates = occurrenceDates.length ? occurrenceDates : [null];
  return dates.map((startDate, idx) => normalizeEvent({
    source: 'echandole',
    title,
    startDate,
    locationName: "Théâtre de L'Échandole",
    locationText: "Théâtre de L'Échandole, Le Château, Yverdon-les-Bains",
    city: 'Yverdon-les-Bains',
    url: listing.url || $('link[rel="canonical"]').attr('href') || SOURCES.echandole.url,
    description,
    ageText,
    priceText,
    tags: inferTags(`${title} ${description} théâtre spectacle famille ${ageText}`),
    evidence: evidence || clean($scope.text()).slice(0, 600),
    sourceProvenance: `L'Échandole official agenda/detail page${idx > 0 ? ` occurrence ${idx + 1}` : ''}`
  }));
}

async function scrapeEchandole() {
  const html = await fetchHtml(SOURCES.echandole.url, 30000);
  const listings = extractEchandoleListings(html, SOURCES.echandole.url);
  const events = [];
  for (const listing of listings) {
    try {
      const detailHtml = await fetchHtml(listing.url, 25000);
      events.push(...parseEchandoleDetail(detailHtml, listing));
    } catch (err) {
      for (const dateText of listing.dateTexts || []) {
        events.push(normalizeEvent({
          source: 'echandole', title: listing.title, startDate: parseEchandoleDateText(dateText, 2026),
          locationName: "Théâtre de L'Échandole", locationText: "Théâtre de L'Échandole, Le Château, Yverdon-les-Bains", city: 'Yverdon-les-Bains',
          url: listing.url, description: listing.category || listing.rawText, ageText: listing.ageText || '', evidence: `Listing fallback: ${listing.rawText}`
        }));
      }
      console.warn(`[echandole] detail fetch failed for ${listing.url}: ${err.message}`);
    }
  }
  return uniqBy(events.filter(e => e.title && e.url && e.startDate), e => e.id);
}

function leProgrammeVaudPageUrl(page = 1) {
  return page <= 1 ? SOURCES.leProgrammeVaudKids.url : `${SOURCES.leProgrammeVaudKids.url}?page=${page}`;
}

function parseLeProgrammeVaudDateText(text, fallbackYear = 2026) {
  const t = clean(text);
  const occurrences = [];
  const range = t.match(new RegExp(`Du\\s+(\\d{1,2})\\s+au\\s+(\\d{1,2})\\s+(${MONTH_RE})\\s+(\\d{4})(?:\\s+à\\s+([^,;]+))?`, 'i'));
  if (range) {
    const year = range[4];
    const month = MONTHS[range[3].toLowerCase()];
    const startDate = `${year}-${month}-${range[1].padStart(2, '0')}`;
    const endDate = `${year}-${month}-${range[2].padStart(2, '0')}`;
    occurrences.push({ startDate: isoDateZurich(startDate, range[5] || ''), endDate, dateText: t });
    return occurrences;
  }
  const date = parseFrenchDate(t, fallbackYear);
  if (!date) return occurrences;
  const afterA = clean((t.match(/à\s+(.+)$/i) || [])[1] || '');
  const times = afterA.match(/\d{1,2}\s*[:h]\s*\d{2}/g) || [];
  if (times.length) {
    for (const time of times) occurrences.push({ startDate: isoDateZurich(date, time), endDate: null, dateText: t });
  } else {
    occurrences.push({ startDate: date, endDate: null, dateText: t });
  }
  return occurrences;
}

function extractLeProgrammeVaudListings(html, pageUrl = SOURCES.leProgrammeVaudKids.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('a.card-spectacle[href]').each((_, a) => {
    const $a = $(a);
    const url = canonicalUrl($a.attr('href'), pageUrl);
    if (!url) return;
    const title = clean($a.find('.card-title').first().text() || $a.attr('title'));
    const cardText = clean($a.text());
    const metaText = clean($a.find('.card-text').first().text());
    const description = clean($a.find('.card-description').first().text());
    const category = clean($a.find('.card-tags li').map((_, li) => clean($(li).text())).get().join(' | '));
    const dateLine = clean((metaText.match(new RegExp(`(?:Le|Du)\\s+.+?(?:${MONTH_RE})\\s+\\d{4}(?:\\s+à\\s+(?:\\d{1,2}\\s*[:h]\\s*\\d{2}(?:\\s+et\\s+)?)+)?`, 'i')) || [])[0] || '');
    const locationText = clean(dateLine ? metaText.replace(dateLine, '') : metaText);
    const ageText = clean((description.match(/(?:D[èe]s\s*\d+\s*ans|Tout public|Famille)[^.]*/i) || [])[0] || 'Spectacle pour enfant / famille');
    const occurrences = parseLeProgrammeVaudDateText(dateLine, 2026);
    if (title && occurrences.length) listings.push({ title, url, dateLine, locationText, description, category, ageText, occurrences, rawText: cardText });
  });
  return uniqBy(listings, x => `${x.url}|${x.dateLine}`);
}

function leProgrammeCityFromLocation(text = '') {
  const t = clean(text);
  const known = cityFromLocation(t, '');
  if (known) return known;
  const commaCity = clean((t.match(/,\s*([^,]+)$/) || [])[1] || '');
  if (commaCity && commaCity.length <= 40 && !/\d/.test(commaCity)) return commaCity;
  const postal = clean((t.match(/\b\d{4}\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’ -]{2,40})/) || [])[1] || '');
  return postal;
}

function parseLeProgrammeVaudDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const bodyText = clean($('body').text());
  const canonical = $('link[rel="canonical"]').attr('href') || listing.url || SOURCES.leProgrammeVaudKids.url;
  const h1 = clean($('h1').first().text());
  const title = clean(h1 || listing.title || $('title').text().split('-')[0]);
  const eventType = clean($('a[href*="/spectacle-enfants"], .breadcrumb, .card-time-rotate').first().text()) || 'Enfant et famille';
  const duration = clean((bodyText.match(/Durée\s*:\s*([^\n]+?)(?:\s+Entrée|\s+Dates|\s+Infos pratiques|$)/i) || [])[1] || '');
  const priceText = clean((bodyText.match(/(?:Entrée libre|Gratuit|\d+\s*CHF[^.\n]*|Tarif[^.\n]*|prix des ateliers[^.\n]*)/i) || [])[0] || listing.priceText || '');
  const detailDateBlock = clean((bodyText.match(/Dates & horaires\s+(.+?)\s+Infos pratiques/i) || [])[1] || '');
  const occurrences = detailDateBlock ? parseLeProgrammeVaudDateText(detailDateBlock, 2026) : (listing.occurrences || []);
  const infoBlock = clean((bodyText.match(/Infos pratiques\s+(.+?)\s+Lieu de l’événement/i) || [])[1] || '');
  const venueBlock = clean((bodyText.match(/Lieu de l’événement\s+(.+?)\s+(?:Contact|Pour s’y rendre|Agenda|$)/i) || [])[1] || '');
  const locationText = clean(venueBlock || infoBlock || listing.locationText || 'Canton de Vaud');
  const firstSentence = clean((bodyText.split('Galerie de photos')[0] || bodyText).split('Lieu de l’événement').pop() || listing.description || '');
  const description = clean([listing.category, eventType, duration ? `Durée: ${duration}` : '', listing.description, firstSentence].filter(Boolean).join(' | ')).slice(0, 900);
  const ageText = clean((description.match(/(?:D[èe]s\s*\d+\s*ans|Tout public|Famille)[^.|]*/i) || [])[0] || listing.ageText || 'Spectacle pour enfant / famille');
  return (occurrences.length ? occurrences : (listing.occurrences || [])).map((occ, idx) => normalizeEvent({
    source: 'leProgrammeVaudKids',
    title,
    startDate: occ.startDate,
    endDate: occ.endDate || null,
    locationName: clean((locationText.split(/\d{4}|Contact|Durée/)[0] || listing.locationText || '').replace(/Durée\s*:.*/i, '')),
    locationText,
    city: leProgrammeCityFromLocation(locationText) || leProgrammeCityFromLocation(listing.locationText || ''),
    url: canonical,
    description,
    ageText,
    priceText,
    tags: inferTags(`${title} ${description} spectacle enfant famille théâtre musique cirque`),
    sourceProvenance: `leprogramme.ch Vaud spectacle-enfants aggregator${idx > 0 ? ` occurrence ${idx + 1}` : ''}`,
    officialSources: [canonical],
    evidence: clean([listing.dateLine, occ.dateText, locationText, ageText, priceText, listing.category, duration].filter(Boolean).join(' | '))
  }));
}

async function scrapeLeProgrammeVaudKids(maxPages = 6) {
  const listings = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = leProgrammeVaudPageUrl(page);
    try {
      const html = await fetchHtml(url, 30000);
      const pageListings = extractLeProgrammeVaudListings(html, url);
      listings.push(...pageListings);
      if (!pageListings.length) break;
    } catch (err) {
      console.warn(`[leProgrammeVaudKids] listing page ${page} failed: ${err.message}`);
      break;
    }
  }
  const events = [];
  const uniqueListings = uniqBy(listings, x => x.url);
  for (let i = 0; i < uniqueListings.length; i += 6) {
    const batch = uniqueListings.slice(i, i + 6);
    const batchEvents = await Promise.all(batch.map(async (listing) => {
      try {
        const detailHtml = await fetchHtml(listing.url, 15000);
        return parseLeProgrammeVaudDetail(detailHtml, listing);
      } catch (err) {
        console.warn(`[leProgrammeVaudKids] detail fetch failed for ${listing.url}: ${err.message}`);
        return listing.occurrences.map(occ => normalizeEvent({
          source: 'leProgrammeVaudKids', title: listing.title, startDate: occ.startDate, endDate: occ.endDate || null,
          locationName: listing.locationText, locationText: listing.locationText, city: leProgrammeCityFromLocation(listing.locationText),
          url: listing.url, description: clean([listing.category, listing.description].filter(Boolean).join(' | ')),
          ageText: listing.ageText, evidence: `Listing fallback: ${listing.rawText}`, sourceProvenance: 'leprogramme.ch Vaud spectacle-enfants listing fallback'
        }));
      }
    }));
    events.push(...batchEvents.flat());
  }
  return uniqBy(events.filter(e => e.title && e.url && e.startDate), e => e.id);
}

function extractTheatreDuPassageDetailLinks(html, pageUrl = SOURCES.theatreDuPassage.listUrl) {
  const $ = cheerio.load(html);
  const links = new Map();
  $('a[href*="/programme/detail/"]').each((_, a) => {
    const href = $(a).attr('href');
    const url = canonicalUrl(href, pageUrl);
    const text = clean($(a).text());
    const title = clean(text.replace(/^(?:LU|MA|ME|JE|VE|SA|DI)?\s*\d{1,2}(?:\s*-\s*(?:LU|MA|ME|JE|VE|SA|DI)?\s*\d{1,2})?\s+(?:JAN|FÉV|FEV|MARS|AVRIL|MAI|JUIN|JUIL|AOÛT|AOUT|SEPT|OCT|NOV|DÉC|DEC)\s*\d{2}/i, '').replace(/^(?:Famille|Théâtre|Théâtre d’ombres|Théâtre de marionnettes|Cirque|Danse|Musique|Humour|Marionnettes|[^A-ZÀ-Ÿ]{0,30})/i, ''));
    const slugTitle = clean((href || '').split('/').pop().replace(/^\d+-/, '').replace(/-/g, ' '));
    for (const key of [title, slugTitle]) if (key) links.set(titleKey(key), url);
  });
  return links;
}

function extractTheatreDuPassageFamilyListings(html) {
  const $ = cheerio.load(html);
  const listings = [];
  $('input[name="evenements_dates_id[]"]').each((_, input) => {
    const id = clean($(input).attr('value') || '');
    const title = clean($(input).attr('aria-label') || '');
    const rowText = clean($(input).parent().text());
    const m = rowText.match(/-\s*(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\s*-\s*(\d{1,2}:\d{2})/i);
    const date = m ? parseFrenchDate(m[1], 2026) : null;
    if (id && title && date) listings.push({ id, title, rowText, startDate: isoDateZurich(date, m[2]) });
  });
  return listings;
}

function parseTheatreDuPassageDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const bodyText = clean($('body').text());
  const title = clean($('h1,h2').filter((_, el) => clean($(el).text()).toLowerCase() === (listing.title || '').toLowerCase()).first().text()) || listing.title;
  const genre = clean($('body').text().match(/(?:Théâtre d’ombres|Théâtre de marionnettes|Famille, Théâtre|Famille|Cirque|Danse|Théâtre)/i)?.[0] || 'Famille / théâtre');
  const duration = clean((bodyText.match(/Durée\s*([^Â]+?)(?:Âge|Lieu|Par le|$)/i) || [])[1] || '');
  const ageText = clean((bodyText.match(/Âge\s*([^L]+?)(?:Lieu|Par le|$)/i) || [])[1] || 'Famille');
  const venue = clean((bodyText.match(/Lieu\s*([^P]+?)(?:Par le|Quitter|\w+ la vie|$)/i) || [])[1] || 'Théâtre du Passage');
  const description = clean((bodyText.split(venue).pop() || bodyText).replace(/Texte et mise en scène.*$/i, '').slice(0, 1200));
  const priceText = clean(bodyText.match(/Tarif plein\s*\d+\.-\s*Tarif réduit\s*\d+\.-\s*Tarif enfant\s*\d+\.-/i)?.[0] || 'Pass’famille: enfant 10.–, adulte -30%; tarifs page détail disponibles');
  return normalizeEvent({
    source: 'theatreDuPassage',
    title,
    startDate: listing.startDate,
    locationName: 'Théâtre du Passage',
    locationText: `Théâtre du Passage, ${venue}, Passage Maximilien-de-Meuron 4, 2000 Neuchâtel`,
    city: 'Neuchâtel',
    url: listing.url || SOURCES.theatreDuPassage.url,
    description: clean(`${genre}. ${duration ? `Durée ${duration}. ` : ''}${description}`),
    ageText,
    priceText,
    tags: inferTags(`${title} ${genre} ${description} famille enfants théâtre marionnettes`),
    evidence: clean(`Pass’famille officiel. ${listing.rowText || ''}. ${ageText ? `Âge: ${ageText}.` : ''} ${duration ? `Durée: ${duration}.` : ''} ${priceText}`)
  });
}

async function scrapeTheatreDuPassage() {
  const [familyHtml, listHtml] = await Promise.all([
    fetchHtml(SOURCES.theatreDuPassage.url, 30000),
    fetchHtml(SOURCES.theatreDuPassage.listUrl, 30000).catch(() => '')
  ]);
  const detailLinks = extractTheatreDuPassageDetailLinks(listHtml);
  const listings = extractTheatreDuPassageFamilyListings(familyHtml).map(item => ({
    ...item,
    url: detailLinks.get(titleKey(item.title)) || `${SOURCES.theatreDuPassage.url}#event-${item.id}`
  }));
  const events = [];
  const detailCache = new Map();
  for (const listing of listings) {
    try {
      if (!detailCache.has(listing.url) && /\/programme\/detail\//.test(listing.url)) detailCache.set(listing.url, await fetchHtml(listing.url, 25000));
      const detailHtml = detailCache.get(listing.url) || familyHtml;
      events.push(parseTheatreDuPassageDetail(detailHtml, listing));
    } catch (err) {
      events.push(normalizeEvent({
        source: 'theatreDuPassage', title: listing.title, startDate: listing.startDate,
        locationName: 'Théâtre du Passage', locationText: 'Théâtre du Passage, Passage Maximilien-de-Meuron 4, 2000 Neuchâtel', city: 'Neuchâtel',
        url: listing.url, description: 'Spectacle estampillé Pass’famille au Théâtre du Passage.', ageText: 'Famille',
        priceText: 'Pass’famille: enfant 10.–, adulte -30%', evidence: `Pass’famille listing fallback: ${listing.rowText}`
      }));
    }
  }
  return uniqBy(events.filter(e => e.title && e.startDate), e => e.id);
}

function rejectionReason(e, window) {
  if (e.source === 'manualJohan' && !['confirmed', 'verified'].includes(e.confidenceStatus || e.status || 'candidate')) return `manual_${e.confidenceStatus || e.status || 'candidate'}`;
  if (!e.url) return 'missing_url';
  if (!e.title || /contact|horaires d'ouverture|agenda des manifestations|accueil/i.test(e.title)) return 'navigation_or_empty_title';
  if (looksLikeNonEvent(e)) return 'non_event_or_administrative';
  if (!e.startDate) return 'missing_date';
  const date = e.startDate.slice(0,10);
  const end = (e.endDate || e.startDate).slice(0,10);
  if (end < window.start || date >= window.endExclusive) return `outside_window_${window.start}_${window.endExclusive}`;
  if (!e.locationText && !e.city) return 'missing_location';
  const distance = estimateDistanceKm(e);
  if (distance != null && distance > 60) return `too_far_${distance}km`;
  if (/caves? ouvertes?|vin|vigneron|d[ée]gustation/i.test(`${e.title} ${e.description}`)) return 'adult_or_alcohol_focused';
  if (isLateAdultLeaningEvent(e)) return 'late_evening_not_family';
  if (isVagueLongRunningNonFamilyEvent(e)) return 'too_vague_not_family_enough';
  const age = ageFitDetail(e);
  if (!age.andy.compatible || !age.lennon.compatible) return 'age_mismatch';
  return null;
}

function scoreEvent(e, window) {
  const age = ageFitDetail(e);
  const date = dateFitDetail(e, window);
  const location = locationFitDetail(e);
  const interest = interestFitDetail(e);
  const confidence = confidenceDetail(e);
  const total = Math.min(100, age.andy.score + age.lennon.score + date.score + location.score + interest.score + confidence.score);
  const childCentric = hasChildCentricSignal(e);
  return {
    total,
    components: {
      ageFitAndy: age.andy.score,
      ageFitLennon: age.lennon.score,
      dateWeekendFit: date.score,
      locationTravelBurden: location.score,
      interestFit: interest.score,
      practicalConfidence: confidence.score
    },
    details: { age, date, location, interest, confidence },
    reasons: buildFitReasons(e, { age, date, location, interest, confidence }),
    caveats: buildCaveats(e, { age, date, location, interest, confidence }),
    label: total >= 70 && childCentric ? 'recommandé' : 'option secondaire'
  };
}

// --- Two-stage scoring (TASK-229) ---------------------------------------------
// Stage 1: cheap score on listing-only fields, computed for every accepted event
// (no network). Stage 2: for promising *and* data-poor candidates only, fetch the
// detail page, enrich description/age/price/tags, and re-score. Capped per run and
// robust — any fetch/parse failure falls back cleanly to the stage-1 score.
const TWO_STAGE_CONFIG = {
  enabled: true,
  stage1Threshold: 45,   // stage-1 total at/above which a candidate is "promising"
  topNPerSource: 3,      // also enrich the top-N per source even if below threshold
  maxDetailFetches: 25,  // hard cap on detail fetches per run
  detailTimeoutMs: 15000
};

// Listing-only projection of an event: strips fields that realistically only exist
// on a detail page (long description, explicit age/price) and re-derives tags from
// the title + location alone. Stage-1 scoring runs on this so its number reflects
// "what the scraper listing gives us", independent of any accidental enrichment.
function listingView(e) {
  const listingTags = inferTags(`${e.title} ${e.locationText || e.city || ''}`);
  return {
    ...e,
    description: '',
    ageMin: null,
    ageMax: null,
    ageText: '',
    priceText: '',
    tags: listingTags
  };
}

function scoreEventStage1(e, window) {
  const s = scoreEvent(listingView(e), window);
  s.stage = 1;
  s.stage1Total = s.total;
  return s;
}

// True when the event lacks detail-only signals that a detail fetch could add.
function isDataPoor(e) {
  const thinDescription = clean(e.description || '').length < 60;
  const noAge = e.ageMin == null && e.ageMax == null && !clean(e.ageText || '');
  const noPrice = !clean(e.priceText || '');
  return thinDescription || noAge || noPrice;
}

// Only real http(s) detail pages are fetchable — skip manual:// and empty URLs.
function isEnrichableUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Generic detail-page extractor. Sources have bespoke parseXxxDetail() for their
// own listing→detail flows; this is the fallback used by the conditional enrichment
// layer for aggregator events (e.g. j3l) that arrive data-poor with only a URL.
function extractDetailFields(html, e) {
  const $ = cheerio.load(html);
  const text = bestDetailText($, e.title) || clean($('main').first().text()) || clean($('body').text());
  if (!text) return {};
  const priceMatch = text.match(/gratuit\w*|entr[ée]e libre|acc[èe]s libre|\bchf\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:chf|fr\.?|\.-)/i);
  const priceText = priceMatch ? clean(priceMatch[0]) : '';
  const age = parseAge('', text);
  return {
    description: text.slice(0, 700),
    priceText,
    ageText: age.ageText,
    text
  };
}

// Re-normalize an event with detail fields merged in, preserving existing tags and
// unioning freshly inferred ones from the richer text. Returns a new event object.
function mergeEnrichment(e, fields) {
  if (!fields || !fields.description) return e;
  const description = clean(fields.description) || e.description;
  const inferred = inferTags(`${e.title} ${description} ${e.locationText || ''}`);
  const tags = [...new Set([...(e.tags || []), ...inferred])];
  return normalizeEvent({
    ...e,
    description,
    ageText: clean(e.ageText || '') || fields.ageText || '',
    priceText: clean(e.priceText || '') || fields.priceText || '',
    tags,
    evidence: clean(`${e.evidence || ''} ${fields.text || fields.description || ''}`).slice(0, 1200)
  });
}

// Selects promising candidates (threshold OR top-N per source) from a stage-1
// scored list. Returns the set of scored-item references eligible for stage 2.
function selectPromising(scored, cfg) {
  const promising = new Set();
  for (const item of scored) if (item.score.total >= cfg.stage1Threshold) promising.add(item);
  const bySource = new Map();
  for (const item of scored) {
    const src = item.event.source || 'unknown';
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src).push(item);
  }
  for (const items of bySource.values()) {
    items.sort((a, b) => b.score.total - a.score.total);
    for (const item of items.slice(0, cfg.topNPerSource)) promising.add(item);
  }
  return promising;
}

// Stage 2: conditionally enrich the promising, data-poor, fetchable candidates and
// re-score them. `fetchDetail` is injectable so fixture tests never hit the network.
// Mutates each scored item in place (event + score) and returns run statistics.
async function enrichPromisingCandidates(scored, window, opts = {}) {
  const cfg = { ...TWO_STAGE_CONFIG, ...opts };
  const fetchDetail = opts.fetchDetail || ((url) => fetchHtml(url, cfg.detailTimeoutMs));
  const startedAt = Date.now();
  const stats = {
    accepted: scored.length,
    enrichableAccepted: scored.filter(s => isEnrichableUrl(s.event.url)).length, // "before": systematic-fetch baseline
    promising: 0,
    fetchAttempts: 0,
    fetchSuccess: 0,
    fetchFailures: 0,
    enrichedRescored: 0,
    improved: 0,
    fetched: []
  };
  if (!cfg.enabled) { stats.elapsedMs = Date.now() - startedAt; return stats; }

  const promising = selectPromising(scored, cfg);
  stats.promising = promising.size;
  // Fetch in descending stage-1 order so the cap spends on the best candidates.
  const queue = [...promising]
    .filter(item => isEnrichableUrl(item.event.url) && isDataPoor(item.event))
    .sort((a, b) => b.score.total - a.score.total);

  for (const item of queue) {
    if (stats.fetchAttempts >= cfg.maxDetailFetches) break;
    stats.fetchAttempts += 1;
    let html;
    try {
      html = await fetchDetail(item.event.url);
      stats.fetchSuccess += 1;
    } catch (err) {
      stats.fetchFailures += 1;
      stats.fetched.push({ url: item.event.url, ok: false, error: err.message });
      continue; // robust fallback: keep the stage-1 score untouched
    }
    try {
      const fields = extractDetailFields(html, item.event);
      const enriched = mergeEnrichment(item.event, fields);
      const newScore = scoreEvent(enriched, window);
      const before = item.score.total;
      item.event = enriched;
      item.score = newScore;
      item.score.stage = 2;
      item.score.stage1Total = before;
      item.enriched = true;
      stats.enrichedRescored += 1;
      if (newScore.total > before) stats.improved += 1;
      stats.fetched.push({ url: enriched.url, ok: true, before, after: newScore.total });
    } catch (err) {
      // Parse/score failure after a successful fetch: keep stage-1 score.
      stats.fetched.push({ url: item.event.url, ok: false, error: `enrich: ${err.message}` });
    }
  }
  stats.elapsedMs = Date.now() - startedAt;
  return stats;
}

function hasChildCentricSignal(e) {
  const text = `${e.title} ${e.description} ${e.ageText}`;
  const tags = new Set(e.tags || []);
  if (/enfants?|famille|kids?|atelier|conte|\bjeux?\b|lecture|bibli|d[ée]couverte|exploration|observation/i.test(text)) return true;
  if (['nature', 'animals', 'science', 'water'].some(t => tags.has(t))) return true;
  return false;
}

function eventStartHour(e) {
  const m = String(e.startDate || '').match(/T(\d{2}):/);
  return m ? Number(m[1]) : null;
}

function isLateAdultLeaningEvent(e) {
  const hour = eventStartHour(e);
  if (hour == null || hour < 20) return false;
  return !hasChildCentricSignal(e);
}

function isVagueLongRunningNonFamilyEvent(e) {
  if (!e.endDate || hasChildCentricSignal(e)) return false;
  const start = Date.parse(`${String(e.startDate).slice(0, 10)}T12:00:00Z`);
  const end = Date.parse(`${String(e.endDate).slice(0, 10)}T12:00:00Z`);
  const days = Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : 0;
  return days >= 7 && !/enfants?|famille|kids?/i.test(`${e.title} ${e.description} ${e.ageText}`);
}

function looksLikeNonEvent(e) {
  const text = `${e.title} ${e.description}`.toLowerCase();
  return /formulaire|page de contact|horaires administratifs|newsletter|politique de confidentialit[ée]|conditions g[ée]n[ée]rales/.test(text);
}

function ageFitDetail(e) {
  const child = (age) => {
    if (e.ageMin == null && e.ageMax == null) return { compatible: true, score: 8, reason: 'âge non précisé, probablement familial à vérifier' };
    if (e.ageMin != null && age < e.ageMin) return { compatible: false, score: 0, reason: `âge minimum ${e.ageMin} ans` };
    if (e.ageMax != null && age > e.ageMax) return { compatible: false, score: 0, reason: `âge maximum ${e.ageMax} ans` };
    return { compatible: true, score: 10, reason: e.ageText || 'âge compatible' };
  };
  return { andy: child(FAMILY.andy.age), lennon: child(FAMILY.lennon.age), ageText: e.ageText || '' };
}

function dateFitDetail(e, window) {
  if (!e.startDate) return { score: 0, reason: 'date manquante' };
  const start = e.startDate.slice(0,10);
  const end = (e.endDate || e.startDate).slice(0,10);
  const overlaps = end >= window.start && start < window.endExclusive;
  if (!overlaps) return { score: 0, reason: `hors fenêtre ${window.start} → ${window.endExclusive}` };
  const day = new Date(`${start}T12:00:00Z`).getUTCDay();
  const weekendBonus = day === 0 || day === 6 ? 20 : 14;
  return { score: weekendBonus, reason: day === 0 || day === 6 ? 'tombe le week-end ciblé' : 'recouvre la fenêtre ciblée' };
}

function estimateDistanceKm(e) {
  const hay = clean(`${e.city || ''} ${e.locationText || ''}`).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [city, km] of Object.entries(LOCATION_KM_FROM_YVERDON)) {
    const key = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (hay.includes(key)) return km;
  }
  if (/yverdon|grandson/i.test(hay)) return /grandson/i.test(hay) ? 5 : 0;
  return null;
}

function locationFitDetail(e) {
  const km = estimateDistanceKm(e);
  if (km == null) return { score: 10, distanceKm: null, reason: 'distance inconnue, lieu à vérifier' };
  if (km <= 8) return { score: 20, distanceKm: km, reason: 'très proche d’Yverdon' };
  if (km <= 25) return { score: 16, distanceKm: km, reason: 'trajet court en famille' };
  if (km <= 45) return { score: 11, distanceKm: km, reason: 'day-trip raisonnable mais trajet notable' };
  return { score: 5, distanceKm: km, reason: 'trajet lourd pour une sortie enfants' };
}

function interestFitDetail(e) {
  const tags = new Set(e.tags || []);
  const matched = [];
  let score = 0;
  for (const person of [FAMILY.lennon, FAMILY.andy, FAMILY.daisy, FAMILY.johan]) {
    const hits = person.tags.filter(t => tags.has(t));
    if (hits.length) matched.push({ person: person.name, tags: hits.slice(0, 3) });
  }
  score += matched.some(m => m.person === 'Lennon') ? 8 : 0;
  score += matched.some(m => m.person === 'Andy') ? 7 : 0;
  score += matched.some(m => m.person === 'Daisy') ? 4 : 0;
  score += matched.some(m => m.person === 'Johan') ? 4 : 0;
  if (/bibli|lecture|conte/i.test(e.title + e.description)) score += 4;
  if (/atelier|d[ée]couverte|observation|exp[ée]rience/i.test(e.title + e.description)) score += 3;
  return { score: Math.min(25, score), matched, reason: matched.length ? matched.map(m => `${m.person}: ${m.tags.map(t => TAG_FR[t] || t).join(', ')}`).join(' ; ') : 'peu de signaux d’intérêt familial' };
}

function confidenceDetail(e) {
  const bits = [e.url && 'URL', e.startDate && 'date', (e.locationText || e.city) && 'lieu', e.description && 'description', e.priceText && 'prix', (e.officialSources || []).length && 'source officielle'].filter(Boolean);
  let score = Math.min(15, bits.length * 3);
  if (e.source === 'manualJohan' && ['candidate', 'needs_review'].includes(e.confidenceStatus || e.status)) score = Math.min(score, 6);
  return { score, evidence: bits, status: e.confidenceStatus || e.status || 'confirmed', reason: bits.length ? `infos présentes: ${bits.join(', ')} (${e.confidenceStatus || e.status || 'confirmed'})` : 'détails pratiques pauvres' };
}

function buildFitReasons(e, d) {
  return [d.interest.reason, d.location.reason, d.date.reason]
    .filter(Boolean)
    .slice(0, 3);
}

function buildCaveats(e, d) {
  const out = [];
  if (!e.priceText) out.push('prix à vérifier');
  if (!e.ageText) out.push('âge non précisé');
  if (d.location.distanceKm != null && d.location.distanceKm > 35) out.push(`trajet env. ${d.location.distanceKm} km`);
  if (/inscription|r[ée]servation/i.test(e.evidence)) out.push('inscription/réservation à vérifier');
  if (!out.length) out.push(e.priceText || 'détails pratiques à vérifier');
  return out;
}

function inspectQuality(events, accepted, rejected, sourceLogs) {
  const withDate = accepted.filter(e => e.startDate).length;
  const withLoc = accepted.filter(e => e.locationText || e.city).length;
  const withUrl = accepted.filter(e => e.url).length;
  const dupes = events.length - uniqBy(events, recommendationKey).length;
  return {
    sourceLogs,
    counts: { raw: events.length, accepted: accepted.length, rejected: rejected.length, duplicates: dupes },
    acceptedQuality: {
      withDatePct: accepted.length ? Math.round(withDate / accepted.length * 100) : 0,
      withLocationPct: accepted.length ? Math.round(withLoc / accepted.length * 100) : 0,
      withUrlPct: accepted.length ? Math.round(withUrl / accepted.length * 100) : 0
    },
    topRejected: rejected.slice(0, 15).map(r => ({ title: r.event.title, source: r.event.source, reason: r.reason, url: r.event.url })),
    sampleAccepted: accepted.slice(0, 5).map(e => ({ title: e.title, startDate: e.startDate, location: e.locationText || e.city, evidence: e.evidence }))
  };
}

function fitReason(e) {
  if (e.tags.includes('nature') || e.tags.includes('animals')) return 'nature/exploration, très bon fit Lennon et sortie facile pour Andy';
  if (/bibli|lecture|conte/i.test(e.title + e.description)) return 'lecture/conte, bon fit intellectuel pour Andy et format doux pour Lennon';
  if (e.tags.includes('culture')) return 'culture locale proche, sortie simple en famille';
  if (e.tags.includes('sport')) return 'activité dynamique/sportive, bon fit Johan et enfants';
  return 'proche et sourcé, option familiale raisonnable';
}
function caveat(e) {
  if (!e.priceText) return 'prix à vérifier';
  if (!e.ageText) return 'âge non précisé';
  if (/inscription/i.test(e.evidence)) return 'inscription à vérifier';
  return e.priceText || 'détails pratiques à vérifier';
}
function frDate(iso) {
  if (!iso) return 'date à vérifier';
  const [y,m,d] = iso.slice(0,10).split('-');
  const time = iso.includes('T') ? ` à ${iso.slice(11,16).replace(':','h')}` : '';
  return `${d}.${m}.${y}${time}`;
}
function frWindow(window) {
  const end = new Date(`${window.endExclusive}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${frDate(window.start).replace(/\.2026$/, '')}–${frDate(end.toISOString().slice(0, 10))}`;
}
function practicalCaveat(caveats = []) {
  if (!caveats.length) return 'détails pratiques à vérifier';
  return caveats.slice(0, 2).join(' ; ');
}
// --- Digest selection (TASK-230) ---------------------------------------------
// The window filter (dateFit) lets a permanent exhibit through *every* weekend
// because it started months ago and ends far in the future. Those evergreen
// exhibits also score near the top (childCentric + nature tags + free + close),
// so a naive `slice(0, 5)` served the same 3 Champ-Pittet + 2 Grandson entries
// week after week and crowded out the dated one-off gems (ateliers, fêtes) that
// actually happen *on* the target weekend. The selection below fixes that with:
//  - an explicit deterministic sort (recommandé first, then score desc, stable),
//  - a per-source cap so one venue can't monopolise the shortlist,
//  - an evergreen-vs-dated distinction that caps permanent exhibits so dated
//    events surface, while keeping the best evergreen ones eligible.
const SHORTLIST_SIZE = 5;
const SHORTLIST_MAX_EVERGREEN = 1;   // at most this many permanent exhibits in the top-N
const EVERGREEN_MIN_SPAN_DAYS = 8;   // spans more than a week → treated as ongoing/permanent

// An event is "evergreen" (permanent/ongoing exhibit) when it started before the
// target window, still runs past it, and spans more than a week — i.e. it passes
// the date filter mechanically every weekend rather than being a dated one-off.
function isEvergreenEvent(e, window) {
  if (!window || !e || !e.startDate) return false;
  const start = e.startDate.slice(0, 10);
  const end = (e.endDate || e.startDate).slice(0, 10);
  const startsBeforeWindow = start < window.start;
  const runsPastWindow = end >= window.endExclusive;
  const spanDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  return startsBeforeWindow && runsPastWindow && spanDays >= EVERGREEN_MIN_SPAN_DAYS;
}

function shortlistedRecommendations(scored, window) {
  const candidates = scored.filter(x => x.score.total >= 60);
  // Deterministic order: recommandé label first, then score desc, then a stable
  // tiebreak on source + event id so the same pool always yields the same list.
  const ordered = candidates.slice().sort((a, b) => {
    const la = a.score.label === 'recommandé' ? 0 : 1;
    const lb = b.score.label === 'recommandé' ? 0 : 1;
    if (la !== lb) return la - lb;
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    const sa = a.event.source || '', sb = b.event.source || '';
    if (sa !== sb) return sa < sb ? -1 : 1;
    const ia = a.event.id || '', ib = b.event.id || '';
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });

  const picked = [];
  const sourceCount = new Map();
  let evergreenCount = 0;
  // Escalating passes: enforce diversity (1/source) and the evergreen cap first;
  // only relax them if the pool is too thin to fill the shortlist otherwise, so
  // we never return fewer entries than the old slice() when candidates exist.
  const passes = [
    { perSourceCap: 1, capEvergreen: true },
    { perSourceCap: 2, capEvergreen: true },
    { perSourceCap: Infinity, capEvergreen: false }
  ];
  for (const { perSourceCap, capEvergreen } of passes) {
    for (const c of ordered) {
      if (picked.length >= SHORTLIST_SIZE) break;
      if (picked.includes(c)) continue;
      const src = c.event.source || 'unknown';
      if ((sourceCount.get(src) || 0) >= perSourceCap) continue;
      const evergreen = isEvergreenEvent(c.event, window);
      if (evergreen && capEvergreen && evergreenCount >= SHORTLIST_MAX_EVERGREEN) continue;
      picked.push(c);
      sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
      if (evergreen) evergreenCount++;
    }
    if (picked.length >= SHORTLIST_SIZE) break;
  }
  return picked.slice(0, SHORTLIST_SIZE);
}

function telegramSummary(scored, window) {
  const top = shortlistedRecommendations(scored, window);
  if (!top.length) return `Idées famille pour ce week-end — ${frWindow(window)}\n\nAucune recommandation fiable: les sources ont été collectées, mais rien ne passe les filtres date/lieu/qualité.`;
  const lines = [
    `BROUILLON NON VALIDÉ — reviews dédiées par événement requises avant envoi`,
    `Idées famille pour ce week-end — ${frWindow(window)}`,
    `Sélection sourcée autour d’Yverdon, à vérifier avant de partir.`
  ];
  return lines.concat(top.map(({event:e, score}, i) =>
    `${i+1}. ${e.title}\n` +
    `📅 ${frDate(e.startDate)}\n` +
    `📍 ${e.locationText || e.city}\n` +
    `Pourquoi: ${(score.reasons && score.reasons.length) ? score.reasons.join(' · ') : fitReason(e)}. Score ${score.total}/100 — ${score.label}.\n` +
    `À vérifier: ${practicalCaveat(score.caveats && score.caveats.length ? score.caveats : [caveat(e)])}\n` +
    `${e.url}`
  )).join('\n\n');
}

function eventReviewQueue(scored, window) {
  const top = shortlistedRecommendations(scored, window);
  return {
    status: top.length ? 'reviews_required_before_send' : 'no_recommendations',
    instruction: 'Open one isolated subagent/session per shortlisted event. Each must open/read the canonical event page, verify practical facts, challenge ranking, and write event-reviews/<event-id>.md before any final Telegram summary is sent.',
    window,
    count: top.length,
    events: top.map(({ event, score }) => ({
      id: event.id,
      title: event.title,
      url: event.url,
      startDate: event.startDate,
      location: event.locationText || event.city || event.locationName,
      source: event.source,
      score: score.total,
      label: score.label,
      reasons: score.reasons || [],
      caveats: score.caveats || []
    }))
  };
}

// --- Avenches / Broye (MyCity Tourism) ---------------------------------------
// MyCity exposes agenda dates as `YYYY/MM/DD` with no time component. The detail
// pages only repeat date ranges ("Ouvert, horaires variables") so there is no
// reliable time/price to enrich from; we keep date-level occurrences plus the
// rich listing metadata (categories, types, location, geo, description).
function avenchesDateToIso(value) {
  const m = clean(value || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function parseAvenchesEvent(raw, opts = {}) {
  const base = opts.baseUrl || SOURCES.avenches.baseUrl;
  const startDate = avenchesDateToIso(raw?.dates?.start);
  const endIso = avenchesDateToIso(raw?.dates?.end);
  const endDate = endIso && endIso !== startDate ? endIso : null;
  const categories = (raw.categories || []).map(c => clean(c && c.label)).filter(Boolean);
  const types = (raw.types || []).map(t => clean(t && t.label)).filter(Boolean);
  const catText = [...new Set([...categories, ...types])].join(', ');
  const location = clean(raw.location || '');
  const url = canonicalUrl(raw.url, base);
  const title = clean(raw.title);
  const description = clean(raw.description);
  const ageText = /famille|enfant|jeune public|tout public/i.test(`${title} ${description} ${catText}`)
    ? 'famille / tout public mentionné'
    : '';
  const priceText = /gratuit|entr[ée]e libre|offert/i.test(`${title} ${description}`) ? 'Gratuit (à confirmer)' : '';
  const tags = inferTags(`${title} ${description} ${catText}`);
  return normalizeEvent({
    source: 'avenches',
    title,
    startDate,
    endDate,
    locationName: location,
    locationText: location,
    city: location || cityFromLocation(location, 'Avenches'),
    url,
    description,
    ageText,
    priceText,
    tags,
    officialSources: [url].filter(Boolean),
    sourceProvenance: 'Office du tourisme d’Avenches (MyCity) — agenda des manifestations Broye/Lac de Morat via _format=json',
    evidence: clean([
      title,
      startDate && `début ${startDate}`,
      endDate && `fin ${endDate}`,
      location && `lieu ${location}`,
      catText && `catégories ${catText}`,
      description
    ].filter(Boolean).join(' | '))
  });
}

async function scrapeAvenches() {
  let payload;
  try {
    payload = await fetchEmoiJson(SOURCES.avenches.apiUrl, 30000);
  } catch (e) {
    return [{ source: 'avenches', title: 'Avenches agenda', url: SOURCES.avenches.url, error: e.message }];
  }
  const data = Array.isArray(payload && payload.data) ? payload.data : [];
  const events = [];
  for (const raw of data) {
    if (!raw || !raw.title) continue;
    const ev = parseAvenchesEvent(raw, { baseUrl: SOURCES.avenches.baseUrl });
    if (!ev.startDate) continue;
    events.push(ev);
  }
  return uniqBy(events, e => e.url || e.id);
}

// --- Vallée de Joux Tourisme — Lac de Joux / Jura vaudois (MyCity JSON) -------
// Same MyCity Tourism CMS as `avenches`: the agenda page id has a `?_format=json`
// variant returning the whole upcoming list in one request. The listing carries
// title, `dates.start`/`dates.end` (YYYY/MM/DD), a `location` town string and
// `categories[].label`; horaire/prix/âge live on the P-code detail pages and are
// filled by the generic conditional-enrichment layer. Strong La Dérivée / terroir /
// plein-air / lac fit: repas & buvettes d'alpage, raclette parties, marchés, fêtes
// de village, festivals, Fête du Vacherin Mont-d'Or, concerts en plein air.
function parseValleeDeJouxEvent(raw, opts = {}) {
  const base = opts.baseUrl || SOURCES.valleeDeJoux.baseUrl;
  const startDate = avenchesDateToIso(raw?.dates?.start);
  const endIso = avenchesDateToIso(raw?.dates?.end);
  const endDate = endIso && endIso !== startDate ? endIso : null;
  const categories = (raw.categories || []).map(c => clean(c && c.label)).filter(Boolean);
  const types = (raw.types || []).map(t => clean(t && t.label)).filter(Boolean);
  const catText = [...new Set([...categories, ...types])].join(', ');
  const location = clean(raw.location || '');
  const url = canonicalUrl(raw.url, base);
  const title = clean(raw.title);
  const description = clean(raw.description);
  const ageText = /famille|enfant|jeune public|tout public/i.test(`${title} ${description} ${catText}`)
    ? 'famille / tout public mentionné'
    : '';
  const priceText = /gratuit|entr[ée]e libre|offert/i.test(`${title} ${description}`) ? 'Gratuit (à confirmer)' : '';
  const tags = inferTags(`${title} ${description} ${catText}`);
  return normalizeEvent({
    source: 'valleeDeJoux',
    title,
    startDate,
    endDate,
    locationName: location,
    locationText: location,
    city: location || cityFromLocation(location, 'Vallée de Joux'),
    url,
    description,
    ageText,
    priceText,
    tags,
    officialSources: [url].filter(Boolean),
    sourceProvenance: 'Vallée de Joux Tourisme (MyCity) — agenda des événements Lac de Joux / Jura vaudois via _format=json',
    evidence: clean([
      title,
      startDate && `début ${startDate}`,
      endDate && `fin ${endDate}`,
      location && `lieu ${location}`,
      catText && `catégories ${catText}`,
      description
    ].filter(Boolean).join(' | '))
  });
}

async function scrapeValleeDeJoux() {
  let payload;
  try {
    payload = await fetchEmoiJson(SOURCES.valleeDeJoux.apiUrl, 30000);
  } catch (e) {
    return [{ source: 'valleeDeJoux', title: 'Vallée de Joux agenda', url: SOURCES.valleeDeJoux.url, error: e.message }];
  }
  const data = Array.isArray(payload && payload.data) ? payload.data : [];
  const events = [];
  for (const raw of data) {
    if (!raw || !raw.title) continue;
    const ev = parseValleeDeJouxEvent(raw, { baseUrl: SOURCES.valleeDeJoux.baseUrl });
    if (!ev.startDate) continue;
    events.push(ev);
  }
  return uniqBy(events, e => e.url || e.id);
}

// --- Château de La Sarraz — agenda propre (WordPress / The Events Calendar) ---
// The castle runs WordPress with the "The Events Calendar" (Tribe) plugin, whose
// public REST API returns every upcoming event as structured JSON in one call:
// title, `start_date_details`/`end_date_details` (components already in the site
// timezone Europe/Zurich), an `all_day` flag, `venue.city`, `cost_details`
// (currency + values) and an HTML `description`. No HTML scraping or detail
// enrichment is needed. Strong terroir / heritage / plein-air / famille fit and
// distinct from every existing source (no source relays the castle's own agenda).
function laSarrazDayFromDetails(d) {
  if (!d || !d.year || !d.month || !d.day) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function laSarrazPrice(raw) {
  const cd = raw && raw.cost_details ? raw.cost_details : {};
  const vals = Array.isArray(cd.values) ? cd.values.map(v => clean(String(v))).filter(Boolean) : [];
  if (vals.length) {
    const sym = clean(cd.currency_symbol || cd.currency_code || 'CHF');
    return `${sym} ${vals.join('–')}`.trim();
  }
  const cost = clean(raw && raw.cost || '');
  if (cost) return cost;
  return '';
}

function parseLaSarrazEvent(raw, opts = {}) {
  const base = opts.baseUrl || SOURCES.chateauLaSarraz.baseUrl;
  const allDay = raw.all_day === true || raw.all_day === '1' || raw.all_day === 'yes';
  const startDay = laSarrazDayFromDetails(raw.start_date_details);
  if (!startDay) return null;
  let endDay = laSarrazDayFromDetails(raw.end_date_details);
  // Tribe stores all-day multi-day events with an end just past midnight of the
  // following day (here shifted +2h → "01:59:59"): roll such an end back one day
  // so a "4 au 6 septembre" salon ends on the 6th, not the 7th.
  if (allDay && endDay && raw.end_date_details && Number(raw.end_date_details.hour) < 3) {
    const dt = new Date(`${endDay}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - 1);
    endDay = dt.toISOString().slice(0, 10);
  }
  let startDate;
  let endDate = null;
  if (allDay) {
    startDate = startDay;
    endDate = endDay && endDay !== startDay ? endDay : null;
  } else {
    const sd = raw.start_date_details || {};
    startDate = isoDateZurich(startDay, `${sd.hour || ''}:${sd.minutes || '00'}`);
    // Timed events spanning several calendar days keep a date-level end.
    endDate = endDay && endDay !== startDay ? endDay : null;
  }
  const title = decodeHtmlEntities(raw.title || '');
  const venue = raw.venue && typeof raw.venue === 'object' ? raw.venue : {};
  const locationName = clean(venue.venue || 'Château de La Sarraz');
  const city = clean(venue.city || '') || 'La Sarraz';
  const categories = (raw.categories || []).map(c => clean(c && c.name)).filter(Boolean);
  const tagLabels = (raw.tags || []).map(t => clean(t && t.name)).filter(Boolean);
  const catText = [...new Set([...categories, ...tagLabels])].join(', ');
  const description = decodeHtmlEntities(raw.description || raw.excerpt || '');
  const url = canonicalUrl(raw.url || raw.rest_url || '', base);
  const hay = `${title} ${description} ${catText}`;
  const ageText = /famille|enfants?|jeune public|tout public|d[èe]s \d/i.test(hay)
    ? 'famille / tout public mentionné'
    : '';
  let priceText = laSarrazPrice(raw);
  if (!priceText && /gratuit|entr[ée]e libre|chapeau|prix libre/i.test(hay)) {
    priceText = 'Gratuit / prix libre (à confirmer)';
  }
  const tags = inferTags(hay);
  return normalizeEvent({
    source: 'chateauLaSarraz',
    title,
    startDate,
    endDate,
    locationName,
    locationText: [locationName, city].filter(Boolean).join(', '),
    city,
    url,
    description,
    ageText,
    priceText,
    tags,
    officialSources: [url].filter(Boolean),
    sourceProvenance: 'Château de La Sarraz — agenda propre (WordPress / The Events Calendar, WP REST /wp-json/tribe/events/v1)',
    evidence: clean([
      title,
      startDate && `début ${startDate}`,
      endDate && `fin ${endDate}`,
      city && `lieu ${locationName} (${city})`,
      catText && `catégories ${catText}`,
      priceText && `prix ${priceText}`,
      description
    ].filter(Boolean).join(' | '))
  });
}

async function scrapeChateauLaSarraz() {
  const today = isoDateZurich(new Date().toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10);
  const startDate = today.slice(0, 10);
  const events = [];
  try {
    let url = `${SOURCES.chateauLaSarraz.apiUrl}?per_page=50&start_date=${startDate}`;
    for (let page = 0; page < 6 && url; page++) {
      const payload = await fetchEmoiJson(url, 30000);
      const list = Array.isArray(payload && payload.events) ? payload.events : [];
      for (const raw of list) {
        if (!raw || !raw.title) continue;
        const ev = parseLaSarrazEvent(raw, { baseUrl: SOURCES.chateauLaSarraz.baseUrl });
        if (ev && ev.startDate) events.push(ev);
      }
      url = payload && payload.next_rest_url ? payload.next_rest_url : null;
    }
  } catch (e) {
    return [{ source: 'chateauLaSarraz', title: 'Château de La Sarraz agenda', url: SOURCES.chateauLaSarraz.url, error: e.message }];
  }
  return uniqBy(events, e => e.url || e.id);
}

// --- Commune de Pomy — agenda communal (WordPress / The Events Calendar REST) --
// Même plateforme Tribe que chateauLaSarraz : on réutilise les helpers génériques
// laSarrazDayFromDetails / laSarrazPrice. Le calendrier brut mélange réservations
// de salles + entraînements de clubs (salle-polyvalente, réservations-poméranne,
// salle-du-levant, ~1300 occurrences) : on scope à la catégorie publique
// « autres-evenements » côté API (categories=<slug>) pour ne garder que les vraies
// manifestations du village. La plupart sont all-day (fêtes, marchés, votations).
function parsePomyEvent(raw, opts = {}) {
  const base = opts.baseUrl || SOURCES.pomy.baseUrl;
  const allDay = raw.all_day === true || raw.all_day === '1' || raw.all_day === 'yes';
  const startDay = laSarrazDayFromDetails(raw.start_date_details);
  if (!startDay) return null;
  let endDay = laSarrazDayFromDetails(raw.end_date_details);
  // Tribe borne les all-day à 23:59:59 du même jour (ou juste après minuit du
  // lendemain pour certains) : replier une fin < 3h sur le jour précédent.
  if (allDay && endDay && raw.end_date_details && Number(raw.end_date_details.hour) < 3) {
    const dt = new Date(`${endDay}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - 1);
    endDay = dt.toISOString().slice(0, 10);
  }
  let startDate;
  let endDate = null;
  if (allDay) {
    startDate = startDay;
    endDate = endDay && endDay !== startDay ? endDay : null;
  } else {
    const sd = raw.start_date_details || {};
    startDate = isoDateZurich(startDay, `${sd.hour || ''}:${sd.minutes || '00'}`);
    endDate = endDay && endDay !== startDay ? endDay : null;
  }
  const title = decodeHtmlEntities(raw.title || '');
  const venue = raw.venue && typeof raw.venue === 'object' && !Array.isArray(raw.venue) ? raw.venue : {};
  const locationName = clean(venue.venue || '') || 'Pomy';
  const city = clean(venue.city || '') || 'Pomy';
  const categories = (raw.categories || []).map(c => clean(c && c.name)).filter(Boolean);
  const tagLabels = (raw.tags || []).map(t => clean(t && t.name)).filter(Boolean);
  const catText = [...new Set([...categories, ...tagLabels])].join(', ');
  const description = decodeHtmlEntities(raw.description || raw.excerpt || '');
  const url = canonicalUrl(raw.url || raw.rest_url || '', base);
  const hay = `${title} ${description} ${catText}`;
  const ageText = /famille|enfants?|jeune public|tout public|intergén|d[èe]s \d/i.test(hay)
    ? 'famille / tout public mentionné'
    : '';
  let priceText = laSarrazPrice(raw);
  if (!priceText && /gratuit|entr[ée]e libre|chapeau|prix libre/i.test(hay)) {
    priceText = 'Gratuit / prix libre (à confirmer)';
  }
  const tags = inferTags(hay);
  return normalizeEvent({
    source: 'pomy',
    title,
    startDate,
    endDate,
    locationName,
    locationText: [locationName, city].filter(Boolean).join(', '),
    city,
    url,
    description,
    ageText,
    priceText,
    tags,
    officialSources: [url].filter(Boolean),
    sourceProvenance: 'Commune de Pomy — agenda communal (WordPress / The Events Calendar, WP REST /wp-json/tribe/events/v1, catégorie « autres-evenements »)',
    evidence: clean([
      title,
      startDate && `début ${startDate}`,
      endDate && `fin ${endDate}`,
      city && `lieu ${locationName} (${city})`,
      catText && `catégories ${catText}`,
      priceText && `prix ${priceText}`,
      description
    ].filter(Boolean).join(' | '))
  });
}

async function scrapePomy() {
  const today = isoDateZurich(new Date().toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10);
  const startDate = today.slice(0, 10);
  const events = [];
  try {
    let url = `${SOURCES.pomy.apiUrl}?per_page=50&start_date=${startDate}&categories=${encodeURIComponent(SOURCES.pomy.category)}`;
    for (let page = 0; page < 6 && url; page++) {
      const payload = await fetchEmoiJson(url, 30000);
      const list = Array.isArray(payload && payload.events) ? payload.events : [];
      for (const raw of list) {
        if (!raw || !raw.title) continue;
        const ev = parsePomyEvent(raw, { baseUrl: SOURCES.pomy.baseUrl });
        if (ev && ev.startDate) events.push(ev);
      }
      url = payload && payload.next_rest_url ? payload.next_rest_url : null;
    }
  } catch (e) {
    return [{ source: 'pomy', title: 'Commune de Pomy agenda', url: SOURCES.pomy.url, error: e.message }];
  }
  return uniqBy(events, e => e.url || e.id);
}

// --- FribourgRégion / Terroir Fribourg — Broye & Lac de Morat (WP REST) -------
// fribourg.ch (ex fribourgregion.ch) exposes an `event` post type on its public
// WP REST API. The canton-wide list is 845 events, so we scope by the `region`
// taxonomy to the two Broye / lakeside areas matching Johan's terroir / Lac de
// Morat / Estavayer-Payerne taste (182 + 194). Dates/times, price and venue
// only live on the detail pages (`#horaires`, `#tarifs`, `#description`,
// `#liens`), so each scoped event is enriched from its page.
function decodeHtmlEntities(s = '') {
  return clean(cheerio.load(`<x>${s || ''}</x>`)('x').text());
}

function parseFribourgHoraire(h5Text) {
  const t = clean(h5Text);
  const range = t.match(new RegExp(`du\\s+(\\d{1,2})(?:\\s+(${MONTH_RE})\\.?)?\\s+au\\s+(\\d{1,2})\\s+(${MONTH_RE})\\.?\\s+(\\d{4})`, 'i'));
  if (range) {
    const year = range[5];
    const startMonth = MONTHS[(range[2] || range[4]).toLowerCase()];
    const endMonth = MONTHS[range[4].toLowerCase()];
    return {
      startDate: `${year}-${startMonth}-${range[1].padStart(2, '0')}`,
      endDate: `${year}-${endMonth}-${range[3].padStart(2, '0')}`
    };
  }
  return { startDate: parseFrenchDate(t), endDate: null };
}

function fribourgCity(text, regionLabel = '') {
  // Town = a single (possibly hyphenated) capitalised token after a CH postal
  // code, e.g. "Estavayer-le-Lac", "Salavaux", "Sugiez".
  const m = clean(text).match(/\b(?:1[45]\d{2}|3[23]\d{2})\s+([A-ZÀ-Ÿ][a-zà-ÿ'’]+(?:-[A-Za-zà-ÿ'’]+)*)/);
  if (m) {
    // Adjacent CMS blocks can glue text without a space (e.g. "KerzersPrix");
    // split such CamelCase glue and cut at any trailing heading label.
    const town = clean(m[1]).replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2')
      .split(/\s+(?:Prix|Tarif|Description|Contact|Horaire|Lien|Website|Information)/)[0];
    return town.replace(/[\s.,;:\-]+$/, '').trim() || regionLabel;
  }
  return regionLabel;
}

function parseFribourgDetail(html, listing, opts = {}) {
  const $ = cheerio.load(html);
  const base = opts.baseUrl || SOURCES.fribourgTerroir.baseUrl;
  const regionLabel = opts.regionLabel || 'Broye / Lac de Morat';
  const url = canonicalUrl(listing.link, base);
  const title = decodeHtmlEntities(listing?.title?.rendered || listing?.title || '') || clean($('h1').first().text());
  const description = clean($('#description').text());
  const tarifText = clean($('#tarifs').text());
  let priceText = clean(tarifText.replace(/^\s*Prix\s*/i, ''));
  if (/gratuit|entr[ée]e libre|kostenlos|\bfree\b/i.test(`${tarifText} ${description} ${title}`)) {
    priceText = priceText || 'Gratuit / entrée libre (à confirmer)';
  }
  const website = $('#liens a[href]').map((i, el) => $(el).attr('href')).get()
    .find(h => h && /^https?:/i.test(h) && !/fribourg\.ch/i.test(h)) || '';
  // Scope city lookup to clean blocks only — the full `main` text glues adjacent
  // CMS blocks without spaces. #fp_contact carries the area tourism-office town
  // (Morat / Estavayer), a good region-level approximation when no venue town shows.
  const city = fribourgCity(`${description} ${$('#fp_contact').text()}`, regionLabel);
  const officialSources = [url, website].filter(Boolean);

  const occurrences = [];
  $('#horaires .horaires h5').each((i, el) => {
    const $h = $(el);
    const { startDate, endDate } = parseFribourgHoraire($h.text());
    if (!startDate) return;
    occurrences.push({ startDate, endDate, timeText: clean($h.nextUntil('h5').text()) });
  });

  const tags = inferTags(`${title} ${description} ${regionLabel}`);
  const ageText = /famille|enfant|jeune public|tout public|kinder|familien/i.test(`${title} ${description}`)
    ? 'famille / tout public mentionné' : '';
  const events = [];
  for (const occ of occurrences.slice(0, 12)) {
    events.push(normalizeEvent({
      source: 'fribourgTerroir',
      title,
      startDate: isoDateZurich(occ.startDate, occ.timeText),
      endDate: occ.endDate,
      locationName: city || regionLabel,
      locationText: clean([city, regionLabel].filter(Boolean).join(' — ')),
      city: city || regionLabel,
      url,
      description,
      ageText,
      priceText,
      tags,
      officialSources,
      sourceProvenance: `FribourgRégion / Terroir Fribourg (${regionLabel}) — WP REST event API, détail enrichi`,
      evidence: clean([
        title,
        occ.startDate && `date ${occ.startDate}`,
        occ.endDate && `→ ${occ.endDate}`,
        occ.timeText && `horaire ${occ.timeText}`,
        city && `lieu ${city}`,
        priceText && `tarif ${priceText}`,
        description
      ].filter(Boolean).join(' | '))
    }));
  }
  return events;
}

async function scrapeFribourgTerroir() {
  const regions = SOURCES.fribourgTerroir.regions;
  const regionIds = Object.keys(regions).join(',');
  const listings = [];
  try {
    for (let page = 1; page <= 6; page++) {
      const url = `${SOURCES.fribourgTerroir.apiUrl}?region=${regionIds}&per_page=100&page=${page}&_fields=id,link,title,region`;
      let batch;
      try {
        batch = await fetchEmoiJson(url, 30000);
      } catch (e) {
        break; // WP returns HTTP 400 past the last page; treat as end of pagination.
      }
      if (!Array.isArray(batch) || !batch.length) break;
      listings.push(...batch);
      if (batch.length < 100) break;
    }
  } catch (e) {
    return [{ source: 'fribourgTerroir', title: 'FribourgRégion agenda', url: SOURCES.fribourgTerroir.url, error: e.message }];
  }
  if (!listings.length) return [];

  const today = new Date().toISOString().slice(0, 10);
  const deadline = Date.now() + 75000; // stay under the 90s per-source guard; return partial if slow.
  const events = [];
  const batchSize = 8;
  for (let i = 0; i < listings.length; i += batchSize) {
    if (Date.now() > deadline) break;
    const batch = listings.slice(i, i + batchSize);
    const parsed = await Promise.all(batch.map(async (listing) => {
      const regionId = (listing.region || []).find(r => regions[r]);
      const regionLabel = regions[regionId] || 'Broye / Lac de Morat';
      try {
        const html = await fetchHtml(listing.link, 20000);
        return parseFribourgDetail(html, listing, { regionLabel, baseUrl: SOURCES.fribourgTerroir.baseUrl });
      } catch (e) {
        return [];
      }
    }));
    for (const evs of parsed) {
      for (const ev of evs) {
        // Keep upcoming + currently-running (range) occurrences; the canton list is not date-sorted.
        const effectiveEnd = (ev.endDate || ev.startDate || '').slice(0, 10);
        if (effectiveEnd && effectiveEnd >= today) events.push(ev);
      }
    }
  }
  return uniqBy(events, e => e.id);
}

// --- Payerne (Broye) communal manifestations --------------------------------
// www.payerne.ch is a WordPress site whose /manifestations/ page renders the
// whole season as a static Bootstrap accordion: one `.card` per event with a
// header "<date prefix> - <title>" and a body holding the authoritative French
// date sentence ("a lieu le …" / "du … au …" / "le X et Y …"), an
// "Emplacement" line, an optional "Horaire(s)" line and an external info link.
// There is no per-event detail page or REST `event` type, so events use a
// stable #heading fragment of the manifestations page as their URL and the
// external "Informations / Programme complet" link is kept as evidence. The
// strongly Broye/terroir-flavoured programme (caves ouvertes, Red Pigs / Poulpe
// / Malt'Broye / Foodtruck festivals, Marché du Jeu, Fête de la Terre, slowUp)
// fits Johan's La Dérivée / free-festival taste.
function fetchPayerneHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  const caBundle = path.join(__dirname, SOURCES.payerne.caBundle);
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--cacert', caBundle, '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse the authoritative French date sentence from a Payerne card body. Days,
// months and years are matched positionally so days that omit their own month
// or year inherit the next one to their right (handles "du 5 au 7 juin 2026",
// "le 26 et 27 juin 2026", "le 31 juillet et 1er août 2026", cross-year ranges).
function parsePayerneDateSentence(text, fallbackYear = 2026) {
  const t = clean(text).toLowerCase().replace(/(\d)\s*er\b/g, '$1');
  const sm = t.match(/(?:a|ont|aura|auront)\s+lieu[^.]*|se\s+d[ée]roule[nt]?[^.]*|\bdu\s+\d[^.]*/);
  let sentence = sm ? sm[0] : t;
  sentence = sentence.split(/\b(?:emplacement|horaires?|informations?|programme|animations|plus d)/i)[0];
  const months = [...sentence.matchAll(new RegExp(`\\b(${MONTH_RE})\\b`, 'gi'))].map(m => ({ i: m.index, v: MONTHS[m[1].toLowerCase().replace(/\.$/, '')] }));
  const years = [...sentence.matchAll(/\b(20\d{2})\b/g)].map(m => ({ i: m.index, v: m[1] }));
  const days = [...sentence.matchAll(/\b(\d{1,2})\b/g)].map(m => ({ i: m.index, v: m[1].padStart(2, '0') }));
  if (!days.length || !months.length) return null;
  const pick = (arr, idx) => { const after = arr.filter(x => x.i >= idx); return (after[0] || arr[arr.length - 1]).v; };
  const toDate = d => `${pick(years, d.i) || fallbackYear}-${pick(months, d.i)}-${d.v}`;
  const isRange = (/\bdu\b/.test(sentence) && /\bau\b/.test(sentence)) || /\bet\b/.test(sentence) || days.length > 1;
  const startDate = toDate(days[0]);
  const endDate = isRange ? toDate(days[days.length - 1]) : null;
  return { startDate, endDate: endDate === startDate ? null : endDate };
}

function extractPayerneCards(html, pageUrl = SOURCES.payerne.url) {
  const $ = cheerio.load(html);
  const cards = [];
  $('.card').each((_, el) => {
    const $el = $(el);
    const header = $el.find('.card-header').first();
    if (!header.length) return;
    const headingId = (header.attr('id') || '').replace(/^heading-?/, '');
    const headerText = clean(header.find('.col').first().text() || header.text());
    const $body = $el.find('.card-body.the-content').first();
    if (!headerText || !$body.length) return;
    const title = clean(headerText.replace(/^\s*\d[^-–]*[-–]\s*/, '')) || headerText;
    const dateSentence = clean($body.find('p').first().text());
    const bodyText = clean($body.text());
    const dates = parsePayerneDateSentence(dateSentence || bodyText) || parsePayerneDateSentence(headerText);
    if (!dates) return;
    let emplacement = '';
    let horaire = '';
    $body.find('li').each((__, li) => {
      const txt = clean($(li).text());
      if (/^emplacement\s*:/i.test(txt)) emplacement = clean(txt.replace(/^emplacement\s*:/i, ''));
      else if (/^horaires?\s*:/i.test(txt) && !horaire) horaire = clean(txt.replace(/^horaires?\s*:/i, ''));
    });
    const links = [];
    $body.find('a[href]').each((__, a) => {
      const href = canonicalUrl($(a).attr('href'), pageUrl);
      if (href && !/payerne\.ch\/manifestations/i.test(href)) links.push(href);
    });
    const fragment = headingId ? `#heading-${headingId}` : `#${sha(title)}`;
    cards.push({
      title, startDate: dates.startDate, endDate: dates.endDate, emplacement, horaire,
      description: bodyText, url: `${pageUrl}${fragment}`, officialSources: uniqBy(links, x => x), provenance: pageUrl
    });
  });
  return uniqBy(cards, c => `${c.title}|${c.startDate}`);
}

async function scrapePayerne() {
  let html;
  try {
    html = fetchPayerneHtml(SOURCES.payerne.url, 30000);
  } catch (e) {
    return [{ source: 'payerne', title: 'Payerne manifestations', url: SOURCES.payerne.url, error: e.message }];
  }
  const today = new Date().toISOString().slice(0, 10);
  const events = extractPayerneCards(html, SOURCES.payerne.url).map(c => {
    const priceText = (c.description.match(/gratuit\w*|entr[ée]e libre|chf\s?\d+[.\-]?\d*|\d+[.\-]\s?(?:chf|frs?)\b/i) || [''])[0];
    return normalizeEvent({
      source: 'payerne', title: c.title, startDate: isoDate(c.startDate, c.horaire), endDate: c.endDate,
      locationName: c.emplacement || 'Payerne', locationText: [c.emplacement, 'Payerne'].filter(Boolean).join(', '),
      city: cityFromLocation(c.emplacement, 'Payerne'), url: c.url, description: c.description,
      ageText: /enfants?|famille|jeunesse|jouets?|p[ée]tanque|march[ée] du jeu/i.test(c.description) ? 'tout public / famille' : '',
      priceText: clean(priceText), officialSources: c.officialSources,
      sourceProvenance: `Commune de Payerne – manifestations: ${SOURCES.payerne.url}`,
      evidence: clean(`${c.startDate}${c.endDate ? ' → ' + c.endDate : ''} | ${c.horaire || ''} | ${c.description}`).slice(0, 1200)
    });
  });
  // Keep upcoming + currently-running occurrences (the page lists the full season).
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

// --- Commune de Vully-les-Lacs (I-Web static agenda) ---------------------------
// Node fetch is flaky on these I-Web communal sites (see echallens), so use a
// curl-backed fetch for reliability and speed.
function fetchVullyHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

function vullyPageUrl(page = 1) {
  return page <= 1 ? SOURCES.vullyLesLacs.url : `${SOURCES.vullyLesLacs.url}/${page}`;
}

// Parse an upcoming Vully agenda date cell: `dayText` is the <span> content
// ("4", "14-16") and `monthText` the trailing month abbreviation(s) ("juil.",
// "août", "janv.-déc."). Returns null when the cell is a past-event cell (the
// trailing text is a 4-digit year like "2024") or is unparseable. Years are NOT
// assigned here — the listing is chronological, so years are resolved in order by
// assignVullyYears.
function parseVullyListingDate(dayText, monthText) {
  const mt = clean(monthText);
  if (/^\s*20\d{2}\s*$/.test(mt)) return null; // past-event cell (year in the month slot)
  const monthMatches = [...mt.toLowerCase().matchAll(new RegExp(`(${MONTH_RE})`, 'gi'))]
    .map(m => MONTHS[m[1].toLowerCase().replace(/\.$/, '')]).filter(Boolean);
  if (!monthMatches.length) return null;
  const dayNums = [...clean(dayText).matchAll(/\d{1,2}/g)].map(m => m[0].padStart(2, '0'));
  if (!dayNums.length) return null;
  const startMonth = monthMatches[0];
  const endMonth = monthMatches[monthMatches.length - 1];
  const startDay = dayNums[0];
  const endDay = dayNums[dayNums.length - 1];
  const isRange = dayNums.length > 1 || monthMatches.length > 1;
  return { startDay, startMonth, endDay: isRange ? endDay : null, endMonth: isRange ? endMonth : startMonth };
}

// Extract the upcoming events from one agenda page, in listing order. Stops at the
// first past-format card (reachedPast=true) because everything after it is past.
function extractVullyListings(html, pageUrl = SOURCES.vullyLesLacs.url) {
  const $ = cheerio.load(html);
  const items = [];
  let reachedPast = false;
  $('.card-body .media').each((_, el) => {
    if (reachedPast) return;
    const $el = $(el);
    const $date = $el.find('.media-date').first();
    const $body = $el.find('.media-body').first();
    if (!$date.length || !$body.length) return;
    const dayText = clean($date.find('span').first().text());
    const monthText = clean($date.clone().children().remove().end().text());
    const title = clean($body.find('.media-title').first().text());
    if (!title) return;
    if (/^\s*20\d{2}\s*$/.test(monthText)) { reachedPast = true; return; } // past section begins
    if (/annoncez\s+votre\s+manifestation/i.test(title)) return; // year-round placeholder card
    const parsed = parseVullyListingDate(dayText, monthText);
    if (!parsed) return;
    const description = clean($body.children('div').not('.d-flex').first().text());
    const links = [];
    $body.find('a[href]').each((__, a) => {
      const href = $(a).attr('href');
      if (href && /^https?:/i.test(href)) links.push(href);
    });
    items.push({ ...parsed, title, description, links: uniqBy(links, x => x), dateText: clean(`${dayText} ${monthText}`) });
  });
  return { items, reachedPast };
}

// Resolve years for chronological (ascending) upcoming listings. The first event
// year is inferred from the current month; subsequent years increment whenever the
// month wraps backwards (Dec -> Jan) relative to the previous event.
function assignVullyYears(listings, now = new Date()) {
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  let prevMonth = null, prevYear = null;
  return listings.map(l => {
    const sm = Number(l.startMonth);
    let year;
    if (prevMonth === null) year = sm >= curM ? curY : curY + 1;
    else year = sm < prevMonth ? prevYear + 1 : prevYear;
    const startDate = `${year}-${l.startMonth}-${l.startDay}`;
    let endDate = null;
    if (l.endDay) {
      const em = Number(l.endMonth);
      const endYear = em < sm ? year + 1 : year;
      endDate = `${endYear}-${l.endMonth}-${l.endDay}`;
    }
    prevMonth = sm; prevYear = year;
    return { ...l, startDate, endDate: endDate === startDate ? null : endDate };
  });
}

const VULLY_VILLAGES = ['Salavaux', 'Vallamand', 'Mur', 'Chabrey', 'Constantine', 'Montmagny', 'Villars-le-Grand', 'Bellerive', 'Cotterd', 'Guévaux'];

async function scrapeVully() {
  const listings = [];
  let stop = false;
  for (let page = 1; page <= 6 && !stop; page++) {
    let html;
    try {
      html = fetchVullyHtml(vullyPageUrl(page), 30000);
    } catch (e) {
      if (page === 1) return [{ source: 'vullyLesLacs', title: 'Vully-les-Lacs agenda', url: SOURCES.vullyLesLacs.url, error: e.message }];
      break;
    }
    const { items, reachedPast } = extractVullyListings(html, SOURCES.vullyLesLacs.url);
    listings.push(...items);
    if (reachedPast || items.length === 0) stop = true;
  }
  const dated = assignVullyYears(listings);
  const today = new Date().toISOString().slice(0, 10);
  const events = dated.map(l => {
    const haystack = `${l.title} ${l.description}`;
    const village = VULLY_VILLAGES.find(v => new RegExp(`\\b${v}\\b`, 'i').test(haystack)) || '';
    const priceText = (l.description.match(/gratuit\w*|entr[ée]e libre|chf\s?\d+[.\-]?\d*|\d+[.\-]\s?(?:chf|frs?)\b|d[èe]s\s?\d+[.\-]/i) || [''])[0];
    return normalizeEvent({
      source: 'vullyLesLacs', title: l.title,
      startDate: isoDate(l.startDate, l.description), endDate: l.endDate,
      locationName: village || 'Vully-les-Lacs',
      locationText: [village, 'Vully-les-Lacs'].filter(Boolean).join(', '),
      city: 'Vully-les-Lacs',
      url: `${SOURCES.vullyLesLacs.url}#${sha(`${l.title}|${l.startDate}`)}`,
      description: l.description || l.title,
      ageText: /enfants?|famille|jeunesse|tout public|gâteaux|chasse aux|contes?|marmots?/i.test(haystack) ? 'tout public / famille' : '',
      priceText: clean(priceText),
      tags: inferTags(`${haystack} Vully lac vignoble terroir village`),
      sourceProvenance: `Commune de Vully-les-Lacs – agenda: ${SOURCES.vullyLesLacs.url} (${l.dateText})`,
      officialSources: [SOURCES.vullyLesLacs.url, ...l.links].filter(Boolean),
      evidence: clean(`${l.dateText} | ${l.startDate}${l.endDate ? ' → ' + l.endDate : ''} | ${l.description} | ${l.links.join(' ')}`).slice(0, 1200)
    });
  });
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

// --- Morat / Murten — agenda communal (I-Web) --------------------------------
function murtenMoratEventUrl(id) {
  return id ? canonicalUrl(`/_rte/anlass/${id}`, SOURCES.murtenMorat.baseUrl) : '';
}

// German detail date/time line, e.g. "15. Nov. 2026, 13.00 Uhr - 17.00 Uhr".
// The listing epoch (datumVon) is authoritative for the day; we only pull the
// start/end clock time from the detail page and normalize "13.00" -> "13:00".
function parseMurtenDetailTime(text) {
  const uhrMatches = [...clean(text).matchAll(/(\d{1,2})[.:h](\d{2})\s*Uhr/gi)];
  if (!uhrMatches.length) return { startTime: '', endTime: '' };
  const norm = m => `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
  return { startTime: norm(uhrMatches[0]), endTime: uhrMatches[1] ? norm(uhrMatches[1]) : '' };
}

function extractMurtenListings(html) {
  const $ = cheerio.load(html);
  const attr = $('#anlassList').attr('data-entities');
  if (!attr) return [];
  let payload;
  try { payload = JSON.parse(attr); } catch { return []; }
  return (payload.data || []).map(row => {
    const name$ = cheerio.load(row.name || '');
    const title = clean(name$.text() || row.name);
    const link = name$('a').attr('href');
    const id = row.id || (link && (link.match(/anlass\/(\d+)/) || [])[1]) || '';
    const ort = clean(cheerio.load(row.ort || '').text() || row.ort || 'Murten');
    const venue = clean(cheerio.load(row.lokalitaet || '').text() || row.lokalitaet || '');
    const organisatorText = clean(cheerio.load(row.organisator || '').text() || row.organisator || '');
    const organizer = /^https?:\/\//i.test(organisatorText) ? '' : organisatorText;
    const organizerUrl = /^https?:\/\//i.test(organisatorText) ? organisatorText : ((row.organisator || '').match(/https?:\/\/[^"'\s<]+/) || [''])[0];
    const startDate = iwebTimestampToZurichIso(row.datumVon || row['datumVon-sort']);
    const endDate = iwebTimestampToZurichIso(row.datumBis || row['datumBis-sort']);
    return {
      id,
      title,
      url: murtenMoratEventUrl(id) || canonicalUrl(link, SOURCES.murtenMorat.url),
      startDate: startDate ? startDate.slice(0, 10) : null,
      endDate: endDate && endDate.slice(0, 10) !== (startDate || '').slice(0, 10) ? endDate.slice(0, 10) : null,
      locationText: clean([venue, ort].filter(Boolean).join(', ')) || ort,
      city: ort,
      organizer,
      organizerUrl
    };
  }).filter(x => x.id && x.title && x.startDate);
}

function parseMurtenDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer').remove();
  const mainText = clean($('main').first().text()) || clean($('body').text());
  const { startTime, endTime } = parseMurtenDetailTime(mainText);
  const startDate = startTime ? isoDateZurich(fallback.startDate, startTime) : fallback.startDate;
  const endDate = fallback.endDate
    ? (endTime ? isoDateZurich(fallback.endDate, endTime) : fallback.endDate)
    : (endTime && startTime ? isoDateZurich(fallback.startDate, endTime) : null);
  const freeMatch = mainText.match(/eintritt\s+frei|kostenlos|gratis|freier\s+eintritt/i);
  const priceMatch = mainText.match(/CHF\s?\d+[.\-]?\d*|\d+[.\-]\s?(?:CHF|Fr\.?)\b/i);
  const price = freeMatch ? freeMatch[0] : (priceMatch ? priceMatch[0] : '');
  // Description: drop the leading breadcrumb/title and the date/time sentence.
  let description = mainText;
  if (fallback.title) description = description.replace(fallback.title, ' ');
  description = clean(description
    .replace(/^.*?(?:Inhalt|Kontakt)?\s*/i, m => m.length > 400 ? '' : m)
    .replace(/\d{1,2}\.\s*[A-Za-zä]+\.?\s*\d{4},?\s*\d{1,2}[.:h]\d{2}\s*Uhr(?:\s*-\s*\d{1,2}[.:h]\d{2}\s*Uhr)?/i, ' ')
  ).slice(0, 700) || fallback.organizer || fallback.title;
  const familyHay = `${fallback.title} ${description} ${fallback.organizer}`;
  const ageText = /famil|kinder|\bkind\b|spielfest|spielnachmittag|jugend|für alle|puur|märit|märt|markt|brocante|fest\b|kino|theater|lauf/i.test(familyHay)
    ? 'famille / tout public possible' : '';
  const officialSources = [fallback.organizerUrl, fallback.url].filter(Boolean);
  const evidence = clean([fallback.title, startDate, endDate, fallback.locationText, fallback.organizer, price, description].filter(Boolean).join(' | ')).slice(0, 1200);
  return normalizeEvent({
    source: 'murtenMorat',
    title: fallback.title,
    startDate,
    endDate: endDate && endDate !== startDate ? endDate : (fallback.endDate && fallback.endDate !== fallback.startDate ? fallback.endDate : null),
    locationName: (fallback.locationText || 'Murten').split(',')[0],
    locationText: fallback.locationText || 'Murten',
    city: fallback.city || 'Murten',
    url: fallback.url,
    description,
    priceText: price,
    ageText,
    tags: inferTags(`${familyHay} Morat Murten lac lakeside vieille ville festival`),
    sourceProvenance: `Ville de Morat / Stadt Murten — agenda des manifestations: ${fallback.url}`,
    officialSources,
    evidence
  });
}

async function scrapeMurtenMorat() {
  let html;
  try {
    html = await fetchHtml(SOURCES.murtenMorat.url, 30000);
  } catch (e) {
    return [{ source: 'murtenMorat', title: 'Morat / Murten agenda', url: SOURCES.murtenMorat.url, error: e.message }];
  }
  const listings = extractMurtenListings(html);
  const today = new Date().toISOString().slice(0, 10);
  const events = [];
  for (const item of listings) {
    // Skip clearly past single-day events before spending a detail fetch.
    if (((item.endDate || item.startDate) || '').slice(0, 10) < today) continue;
    try {
      const detailHtml = await fetchHtml(item.url, 20000);
      events.push(parseMurtenDetail(detailHtml, item));
    } catch (e) {
      events.push(normalizeEvent({
        source: 'murtenMorat', title: item.title, startDate: item.startDate, endDate: item.endDate,
        locationName: (item.locationText || 'Murten').split(',')[0], locationText: item.locationText, city: item.city,
        url: item.url, description: item.organizer || item.title,
        tags: inferTags(`${item.title} ${item.organizer} Morat Murten lac`),
        sourceProvenance: `Ville de Morat / Stadt Murten — agenda des manifestations: ${item.url}`,
        officialSources: [item.organizerUrl, item.url].filter(Boolean),
        evidence: clean([item.title, item.startDate, item.endDate, item.locationText, item.organizer].filter(Boolean).join(' | '))
      }));
    }
  }
  return uniqBy(events.filter(e => e.title && e.startDate), e => recommendationKey(e));
}

// --- Chavornay — agenda communal (I-Web, Nord vaudois) -----------------------
// The raw listing link is `/_rte/anlass/<id>`, which 301-redirects to the
// canonical `/anlaesseaktuelles/<id>` detail page; we store the canonical form
// directly so the stable URL matches what a visitor lands on.
function chavornayEventUrl(id) {
  return id ? canonicalUrl(`/anlaesseaktuelles/${id}`, SOURCES.chavornay.baseUrl) : '';
}

// Conservative French start-time extraction from a detail body. Civic items
// (votations/élections) carry polling-office opening hours that are NOT event
// times, so the caller guards those out by title; here we only accept a time
// introduced by a real event cue ("dès", "à", "départ", "ouverture", "portes",
// "rendez-vous") to avoid grabbing incidental hours.
function parseChavornayDetailTime(text) {
  const m = clean(text).match(/(?:d[èe]s|\bà\b|d[ée]part\s*:?|ouverture\s*:?|portes\s*:?|rendez-?vous\s*:?)\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return '';
  const hour = Number(m[1]);
  if (hour > 23) return '';
  return `${String(hour).padStart(2, '0')}:${m[2] || '00'}`;
}

function extractChavornayListings(html) {
  const $ = cheerio.load(html);
  const attr = $('#anlassList').attr('data-entities');
  if (!attr) return [];
  let payload;
  try { payload = JSON.parse(attr); } catch { return []; }
  return (payload.data || []).map(row => {
    const name$ = cheerio.load(row.name || '');
    const title = clean(name$.text() || row.name);
    const link = name$('a').attr('href');
    const id = row.id || (link && (link.match(/anlass\/(\d+)/) || [])[1]) || '';
    const ort = clean(cheerio.load(row.ort || '').text() || row.ort || 'Chavornay').split('\n')[0] || 'Chavornay';
    const venue = clean(cheerio.load(row.lokalitaet || '').text() || row.lokalitaet || '').split('\n')[0];
    const organisatorText = clean(cheerio.load(row.organisator || '').text() || row.organisator || '');
    const organizer = /^https?:\/\//i.test(organisatorText) ? '' : organisatorText;
    const organizerUrl = /^https?:\/\//i.test(organisatorText) ? organisatorText : ((row.organisator || '').match(/https?:\/\/[^"'\s<]+/) || [''])[0];
    const startDate = iwebTimestampToZurichIso(row.datumVon || row['datumVon-sort']);
    const endDate = iwebTimestampToZurichIso(row.datumBis || row['datumBis-sort']);
    return {
      id,
      title,
      url: chavornayEventUrl(id) || canonicalUrl(link, SOURCES.chavornay.url),
      startDate: startDate ? startDate.slice(0, 10) : null,
      endDate: endDate && endDate.slice(0, 10) !== (startDate || '').slice(0, 10) ? endDate.slice(0, 10) : null,
      locationText: clean([venue, ort].filter(Boolean).join(', ')) || ort,
      city: ort,
      organizer,
      organizerUrl
    };
  }).filter(x => x.id && x.title && x.startDate);
}

function parseChavornayDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer').remove();
  let mainText = clean($('main').first().text()) || clean($('body').text());
  // Drop the I-Web breadcrumb prefix and the "modify this listing" boilerplate tail.
  const cut = mainText.search(/Objets associés|Si vous souhaitez modifier|Partager\b/i);
  if (cut > 0) mainText = clean(mainText.slice(0, cut));
  const isCivic = /votation|élection|election|scrutin/i.test(fallback.title || '');
  const startTime = (!isCivic && !fallback.endDate) ? parseChavornayDetailTime(mainText) : '';
  const startDate = startTime ? isoDateZurich(fallback.startDate, startTime) : fallback.startDate;
  const freeMatch = mainText.match(/entr[ée]e?\s+libre|entr[ée]e?\s+gratuite|gratuit(?:e|es)?\b|prix\s+libre/i);
  const priceMatch = mainText.match(/CHF\s?\d+[.\-]?\d*|\d+[.\-]\s?(?:CHF|Fr\.?)\b/i);
  const price = freeMatch ? freeMatch[0] : (priceMatch ? priceMatch[0] : '');
  // Description: strip the leading title + venue/address/date fragment, keep the body.
  let description = mainText;
  if (fallback.title) { const i = description.indexOf(fallback.title); if (i >= 0) description = description.slice(i + fallback.title.length); }
  description = clean(description
    .replace(/\b\d{1,2}\s*[a-zàâäéèêëîïôöûü]+\.?\s*\d{4}(?:\s*-\s*\d{1,2}\s*[a-zàâäéèêëîïôöûü]+\.?\s*\d{4})?/i, ' ')
    .replace(/^\s*(?:\d{4}\s+)?[A-Za-zÀ-ÿ'’\- ]{0,60}?(?:Contact\b)/i, m => m.length > 120 ? '' : ' ')
  ).slice(0, 700) || fallback.organizer || fallback.title;
  const familyHay = `${fallback.title} ${description} ${fallback.organizer}`;
  const ageText = /famil|enfant|jeunesse|ejed|caf[ée]\s+contact|cr[ée]atif|march[ée]|f[êe]te|atelier|conte|spectacle|jeux|ludoth[èe]que|brocante|cirque|tout\s+public|d[èe]s\s+\d/i.test(familyHay)
    ? 'famille / tout public possible' : '';
  const officialSources = [fallback.organizerUrl, fallback.url].filter(Boolean);
  const evidence = clean([fallback.title, startDate, fallback.endDate, fallback.locationText, fallback.organizer, price, description].filter(Boolean).join(' | ')).slice(0, 1200);
  return normalizeEvent({
    source: 'chavornay',
    title: fallback.title,
    startDate,
    endDate: fallback.endDate && fallback.endDate !== fallback.startDate ? fallback.endDate : null,
    locationName: (fallback.locationText || 'Chavornay').split(',')[0],
    locationText: fallback.locationText || 'Chavornay',
    city: fallback.city || 'Chavornay',
    url: fallback.url,
    description,
    priceText: price,
    ageText,
    tags: inferTags(`${familyHay} Chavornay Nord vaudois village famille`),
    sourceProvenance: `Commune de Chavornay — agenda des manifestations: ${fallback.url}`,
    officialSources,
    evidence
  });
}

async function scrapeChavornay() {
  let html;
  try {
    html = await fetchHtml(SOURCES.chavornay.url, 30000);
  } catch (e) {
    return [{ source: 'chavornay', title: 'Chavornay agenda', url: SOURCES.chavornay.url, error: e.message }];
  }
  const listings = extractChavornayListings(html);
  const today = new Date().toISOString().slice(0, 10);
  const events = [];
  for (const item of listings) {
    // Skip clearly past events before spending a detail fetch.
    if (((item.endDate || item.startDate) || '').slice(0, 10) < today) continue;
    try {
      const detailHtml = await fetchHtml(item.url, 20000);
      events.push(parseChavornayDetail(detailHtml, item));
    } catch (e) {
      events.push(normalizeEvent({
        source: 'chavornay', title: item.title, startDate: item.startDate, endDate: item.endDate,
        locationName: (item.locationText || 'Chavornay').split(',')[0], locationText: item.locationText, city: item.city,
        url: item.url, description: item.organizer || item.title,
        tags: inferTags(`${item.title} ${item.organizer} Chavornay Nord vaudois village`),
        sourceProvenance: `Commune de Chavornay — agenda des manifestations: ${item.url}`,
        officialSources: [item.organizerUrl, item.url].filter(Boolean),
        evidence: clean([item.title, item.startDate, item.endDate, item.locationText, item.organizer].filter(Boolean).join(' | '))
      }));
    }
  }
  return uniqBy(events.filter(e => e.title && e.startDate), e => recommendationKey(e));
}

// --- Centre-Nature BirdLife de La Sauge (Cudrefin, Grande Cariçaie) -----------
// Drupal page; Node fetch works, but use a curl-backed fetch for the same
// reliability the other communal/CMS sources rely on.
function fetchLaSaugeHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse a La Sauge `<h4>` date line, e.g. "Samedi 4 juillet, 13h – 15h",
// "Lundi 13 juillet au vendredi 17 juillet, 8h30 – 17h", "Samedi 1er août, 20h – 22h30".
// Times always follow the date (the first `\d+h` token starts the time part).
// Days/months are matched positionally so a range's first day inherits the month
// to its right. Years are NOT assigned here (see assignLaSaugeYears).
function parseLaSaugeDateLine(text) {
  let t = clean(text).toLowerCase().replace(/(\d)\s*er\b/g, '$1');
  t = t.replace(/lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/g, ' ');
  const normTime = (h, m) => { const H = Number(h); return H > 23 ? '' : `${String(H).padStart(2, '0')}:${(m || '00').padStart(2, '0')}`; };
  const times = [...t.matchAll(/(\d{1,2})\s*h\s*(\d{2})?/g)].map(m => normTime(m[1], m[2])).filter(Boolean);
  const firstH = t.search(/\d{1,2}\s*h/);
  const dateSeg = firstH >= 0 ? t.slice(0, firstH) : t;
  const months = [...dateSeg.matchAll(new RegExp(`(${MONTH_RE})`, 'gi'))].map(m => ({ i: m.index, v: MONTHS[m[1].toLowerCase().replace(/\.$/, '')] }));
  const days = [...dateSeg.matchAll(/\b(\d{1,2})\b/g)].map(m => ({ i: m.index, v: m[1].padStart(2, '0') }));
  if (!days.length || !months.length) return null;
  const pick = (arr, idx) => { const after = arr.filter(x => x.i >= idx); return (after[0] || arr[arr.length - 1]).v; };
  const isRange = /\bau\b/.test(dateSeg) || days.length > 1;
  return {
    startDay: days[0].v, startMonth: pick(months, days[0].i),
    endDay: isRange ? days[days.length - 1].v : null, endMonth: pick(months, days[days.length - 1].i),
    startTime: times[0] || '', endTime: times[1] || '', dateText: clean(text)
  };
}

// Extract La Sauge events in document order (month sections juin→novembre). Each
// event is a `<h4>` date line followed by `<p><strong>` title, `<p>` description(s)
// and a `<p><i>` meta line with links (Pour en savoir plus / inscription / Prix).
function extractLaSaugeListings(html) {
  const $ = cheerio.load(html);
  const yearMatch = clean($.root().text()).match(/programme\s+annuel\s+(20\d{2})/i);
  const baseYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  const listings = [];
  $('div.collapse[id]').each((_, div) => {
    $(div).find('h4').each((__, h4) => {
      const dl = parseLaSaugeDateLine($(h4).text());
      if (!dl) return;
      const block = $(h4).nextUntil('h4');
      let title = '';
      const descParts = [];
      let meta = '';
      const links = [];
      block.filter('p').each((k, p) => {
        const $p = $(p);
        const txt = clean($p.text());
        if (!txt) return;
        if (!title && $p.find('strong').length) { title = clean($p.find('strong').first().text()); return; }
        if ($p.find('a[href]').length && /savoir plus|inscription|prix|entr[ée]e|r[ée]servation/i.test(txt)) {
          meta = txt;
          $p.find('a[href]').each((___, a) => { const href = $(a).attr('href'); if (href) links.push(href); });
          return;
        }
        descParts.push(txt);
      });
      if (!title) title = clean(block.filter('p').first().text());
      if (!title) return;
      listings.push({ ...dl, title, description: descParts.join(' '), meta, links, baseYear });
    });
  });
  return listings;
}

// Assign calendar years to La Sauge listings in document order, seeded by the
// page's "programme annuel YYYY" base year. Rolls the year forward if the month
// sequence ever wraps backwards (future-proofs a saison spanning Dec→Jan).
function assignLaSaugeYears(listings) {
  let prevMonth = null, prevYear = null;
  return listings.map(l => {
    const sm = Number(l.startMonth);
    let year;
    if (prevMonth === null) year = l.baseYear;
    else year = sm < prevMonth ? prevYear + 1 : prevYear;
    const startDate = `${year}-${l.startMonth}-${l.startDay}`;
    let endDate = null;
    if (l.endDay) {
      const em = Number(l.endMonth);
      const endYear = em < sm ? year + 1 : year;
      endDate = `${endYear}-${l.endMonth}-${l.endDay}`;
    }
    prevMonth = sm; prevYear = year;
    return { ...l, startDate, endDate: endDate === startDate ? null : endDate };
  });
}

async function scrapeLaSauge() {
  let html;
  try {
    html = fetchLaSaugeHtml(SOURCES.laSauge.url, 30000);
  } catch (e) {
    return [{ source: 'laSauge', title: 'Centre-Nature BirdLife de La Sauge', url: SOURCES.laSauge.url, error: e.message }];
  }
  const dated = assignLaSaugeYears(extractLaSaugeListings(html));
  const today = new Date().toISOString().slice(0, 10);
  const venue = 'Centre-Nature BirdLife de La Sauge';
  const events = dated.map(l => {
    const hay = `${l.title} ${l.description} ${l.meta}`;
    const free = /gratuit\w*|entr[ée]e libre/i.test(hay);
    const price = free ? (hay.match(/gratuit\w*|entr[ée]e libre/i) || [''])[0]
      : (/prix\s*:\s*entr[ée]e au centre/i.test(l.meta) ? 'Entrée au centre (voir horaires et tarifs)' : '');
    // Non-http links (mailto:) stay evidence-only; keep http(s) links as officialSources.
    const officialSources = uniqBy(l.links.filter(h => /^https?:/i.test(h)).map(h => canonicalUrl(h, SOURCES.laSauge.url)).filter(Boolean), x => x);
    const familyLike = /enfants?|famille|camp|dimanche nature|mare|jumelles|oiseaux|souris|chauves?-souris|biodiversit|dessiner|nature|migrateur|grande cari[çc]aie/i.test(hay)
      && !/journ[ée]e d.entretien|taille|fauchage/i.test(l.title);
    return normalizeEvent({
      source: 'laSauge', title: l.title,
      startDate: isoDateZurich(l.startDate, l.startTime), endDate: l.endDate,
      locationName: venue,
      locationText: `${venue}, La Sauge, Cudrefin`,
      city: 'Cudrefin',
      url: `${SOURCES.laSauge.url}#${sha(`${l.title}|${l.startDate}`)}`,
      description: l.description || l.title,
      ageText: familyLike ? 'tout public / famille' : '',
      priceText: clean(price),
      tags: inferTags(`${hay} nature lac Grande Cariçaie oiseaux plein air famille Cudrefin`),
      sourceProvenance: `Centre-Nature BirdLife de La Sauge – agenda: ${SOURCES.laSauge.url} (${l.dateText})`,
      officialSources: [SOURCES.laSauge.url, ...officialSources].filter(Boolean),
      evidence: clean(`${l.dateText} | ${l.startDate}${l.endDate ? ' → ' + l.endDate : ''} | ${l.description} | ${l.meta}`).slice(0, 1200)
    });
  });
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

// --- Parc naturel régional Jura vaudois (Vallée de Joux / Jura-Nord vaudois) ---
// Static listing on the Swiss parks platform. Use a curl-backed fetch for the same
// reliability the other CMS sources rely on.
function fetchParcJuraHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse a Parc Jura vaudois `.date` cell: "10.07" (single) or "18-19.07" (same-month
// range). Returns day/month strings (no year — resolved by assignParcJuraVaudoisYears).
function parseParcJuraVaudoisDate(text) {
  const t = clean(text);
  const m = t.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\.(\d{1,2})/);
  if (!m) return null;
  const month = m[3].padStart(2, '0');
  if (Number(month) < 1 || Number(month) > 12) return null;
  return {
    startDay: m[1].padStart(2, '0'), startMonth: month,
    endDay: m[2] ? m[2].padStart(2, '0') : null, endMonth: m[2] ? month : null
  };
}

// Parse a `.time` cell such as "09:15 ><br> 15:00" → { startTime, endTime }.
function parseParcJuraVaudoisTime(text) {
  const times = [...clean(text).matchAll(/(\d{1,2}):(\d{2})/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
  return { startTime: times[0] || '', endTime: times[1] || '' };
}

// Extract the activity cards from the /fr/activites listing, in document (chronological)
// order. Each card links a stable /fr/loisir/<id> detail page.
function extractParcJuraVaudoisListings(html, baseUrl = SOURCES.parcJuraVaudois.baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('#posts-list a.mozaic-link').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const idMatch = href.match(/\/loisir\/(\d+)/);
    if (!idMatch) return;
    const $info = $a.find('.mozaic-info').first();
    const parsed = parseParcJuraVaudoisDate($info.find('.date').first().text());
    if (!parsed) return;
    const { startTime, endTime } = parseParcJuraVaudoisTime($info.find('.time').first().text());
    const location = clean($info.find('.location').first().text());
    let title = clean($a.find('h3').first().text()) || clean($a.attr('title') || '');
    // Strip status prefixes ("NOUVEAU - ", "COMPLET - ") from the display title but
    // remember them so a full activity keeps a caveat and NEW ones are still surfaced.
    const complet = /^\s*COMPLET\b/i.test(title);
    title = title.replace(/^\s*(NOUVEAU|COMPLET)\s*-\s*/i, '').trim();
    if (!title) return;
    items.push({
      id: idMatch[1], url: canonicalUrl(href, baseUrl) || `${baseUrl}/fr/loisir/${idMatch[1]}`,
      title, ...parsed, startTime, endTime, location, complet,
      dateText: clean($info.find('.date').first().text())
    });
  });
  return items;
}

// Resolve years for chronological (ascending) listings: first event year from the
// current month, then increment whenever the month wraps backwards (Dec -> Jan).
function assignParcJuraVaudoisYears(listings, now = new Date()) {
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  let prevMonth = null, prevYear = null;
  return listings.map(l => {
    const sm = Number(l.startMonth);
    let year;
    if (prevMonth === null) year = sm >= curM ? curY : curY + 1;
    else year = sm < prevMonth ? prevYear + 1 : prevYear;
    const startDate = `${year}-${l.startMonth}-${l.startDay}`;
    let endDate = null;
    if (l.endDay) endDate = `${year}-${l.endMonth}-${l.endDay}`;
    prevMonth = sm; prevYear = year;
    return { ...l, startDate, endDate: endDate === startDate ? null : endDate };
  });
}

// Enrich a listing from its /fr/loisir/<id> detail page: description, meeting-point
// address (NPA + town), and price/tarif evidence (free vs adult/child CHF tariffs).
function parseParcJuraVaudoisDetail(html, listing) {
  const $ = cheerio.load(html);
  const description = clean($('.activite_description').first().text()) || listing.title;
  // "Lieu de rendez-vous" block: <p>venue<br>NPA town</p>
  let address = '';
  $('.activite_block').each((_, b) => {
    const h2 = clean($(b).find('h2').first().text());
    if (/rendez-vous|lieu/i.test(h2) && !address) address = clean($(b).find('p').first().text());
  });
  const cityMatch = address.match(/(?<!\d)\d{4}\s+([A-Za-zÀ-ÿ'’ -]+?)\s*$/);
  const priceRaw = clean($('.activite_prix').first().text().replace(/^\s*Prix\s*/i, ''));
  const free = /gratuit|entr[ée]e libre|offert/i.test(`${priceRaw} ${description}`);
  const childPrice = priceRaw.match(/enfant[^:]*:\s*(\d+)\s*chf/i);
  const priceText = free ? 'Gratuit' : clean(priceRaw).slice(0, 200);
  // Family-friendliness evidence: an explicit child tariff, or family/kid keywords.
  const hay = `${listing.title} ${description}`;
  const familyLike = !!childPrice || /enfants?|famille|d[èe]s\s*\d+\s*ans|conte|potager|champignon|[âa]ne|chauve|animal|nature en famille/i.test(hay);
  return { description, address, city: cityMatch ? clean(cityMatch[1]) : '', priceText, childPrice: childPrice ? Number(childPrice[1]) : null, familyLike };
}

async function scrapeParcJuraVaudois() {
  let html;
  try {
    html = fetchParcJuraHtml(SOURCES.parcJuraVaudois.url, 30000);
  } catch (e) {
    return [{ source: 'parcJuraVaudois', title: 'Parc Jura vaudois — activités', url: SOURCES.parcJuraVaudois.url, error: e.message }];
  }
  const dated = assignParcJuraVaudoisYears(extractParcJuraVaudoisListings(html));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = dated.filter(l => ((l.endDate || l.startDate) || '').slice(0, 10) >= today);
  const events = [];
  const batchSize = 6;
  for (let i = 0; i < upcoming.length; i += batchSize) {
    const batch = upcoming.slice(i, i + batchSize);
    const parsed = await Promise.all(batch.map(async (l) => {
      let detail = { description: l.title, address: '', city: '', priceText: '', childPrice: null, familyLike: false };
      try { detail = parseParcJuraVaudoisDetail(await fetchHtml(l.url, 20000), l); } catch { /* listing-level fallback */ }
      const city = detail.city || (l.location || '').replace(/^Saint Cergue$/i, 'Saint-Cergue');
      const locationText = clean([detail.address, l.location].filter(Boolean).join(' · ')) || l.location;
      const caveats = l.complet ? 'COMPLET (activité affichée complète — à vérifier avant déplacement)' : '';
      return normalizeEvent({
        source: 'parcJuraVaudois', title: l.title,
        startDate: isoDateZurich(l.startDate, l.startTime), endDate: l.endDate,
        locationName: (locationText || 'Parc Jura vaudois').split('·')[0].trim() || 'Parc Jura vaudois',
        locationText: locationText || 'Parc naturel régional Jura vaudois',
        city,
        url: l.url,
        description: clean([detail.description, caveats].filter(Boolean).join(' — ')),
        ageText: detail.familyLike ? (detail.childPrice != null ? `famille (tarif enfant ${detail.childPrice} CHF)` : 'tout public / famille') : '',
        priceText: detail.priceText,
        tags: inferTags(`${l.title} ${detail.description} ${l.location} nature plein air découverte Jura vaudois famille terroir`),
        sourceProvenance: `Parc naturel régional Jura vaudois — activités: ${l.url} (${l.dateText}${l.startTime ? ' ' + l.startTime : ''})`,
        officialSources: [l.url],
        evidence: clean([l.dateText, l.startDate, l.endDate, l.startTime && `${l.startTime}${l.endTime ? '–' + l.endTime : ''}`, l.location, detail.address, detail.priceText, l.complet ? 'COMPLET' : ''].filter(Boolean).join(' | ')).slice(0, 1200)
      });
    }));
    events.push(...parsed);
  }
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

// --- Office des Vins Vaudois (OVV) — agenda du vignoble vaudois ---
// Static Drupal listing: one `a.teaser-event` card per event with a `.date` cell
// (single date or `d1 month1 — d2 month2 year` range, plus an optional time/schedule
// line after the first <br>), an `<h3>` title, a `.domain` (winery/organizer) and a
// `.address` (street + NPA + city). Detail pages add a `.lead` description and an
// official Website link. Listing-level extraction is sufficient; detail is enrichment.
function fetchOvvHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

// Parse an OVV `.date` cell. The first line is the date; text after the first <br>
// is a schedule/time line. Handles single dates ("23 novembre 2026") and ranges
// ("20 août — 3 septembre 2026" / "20 août — 22 août 2026"), where the year at the
// end applies to both bounds and the first month may be implicit only when repeated.
function parseOvvListingDate(dateCell) {
  const raw = clean(String(dateCell || '').replace(/<br\s*\/?>(?![\s\S]*<br)/i, '\u0001').replace(/<br\s*\/?>/gi, '\u0001'));
  const firstLine = raw.split('\u0001')[0] || raw;
  const timeLine = raw.split('\u0001').slice(1).join(' ').trim();
  const t = clean(firstLine).toLowerCase();
  // Range: "<d1> <m1?> — <d2> <m2> <year>"
  const range = t.match(new RegExp(`^(\\d{1,2})\\s*(?:(${MONTH_RE})\\.?)?\\s*[—–-]\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?`, 'i'));
  if (range) {
    const year = range[5] || String(new Date().getFullYear());
    const endMonth = MONTHS[range[4]];
    const startMonth = MONTHS[range[2] || range[4]];
    if (!startMonth || !endMonth) return null;
    const startDate = `${year}-${startMonth}-${range[1].padStart(2, '0')}`;
    const endDate = `${year}-${endMonth}-${range[3].padStart(2, '0')}`;
    return { startDate, endDate: endDate === startDate ? null : endDate, timeLine, dateText: clean(firstLine) };
  }
  const single = parseFrenchDate(firstLine);
  if (!single) return null;
  return { startDate: single, endDate: null, timeLine, dateText: clean(firstLine) };
}

// Extract a start time from an OVV schedule line. Returns '' for recurring/ambiguous
// lines ("Tous les samedis de 10h à 13h") so those stay date-level rather than binding
// a misleading time. Handles "16h30 à 20h", "De 9h00 à 12h30", "18h-22h", "18h30".
function parseOvvTime(timeLine) {
  const t = clean(String(timeLine || ''));
  if (!t) return '';
  if (/tous les|chaque|sur (?:rendez|réservation)|horaires? variables|arriv[ée]e libre/i.test(t)) {
    // still allow an explicit "entre 17h et 20h" start
    const between = t.match(/entre\s+(\d{1,2})\s*h\s*(\d{2})?/i);
    if (between) return `${between[1].padStart(2, '0')}:${(between[2] || '00').padStart(2, '0')}`;
    return '';
  }
  const m = t.match(/(\d{1,2})\s*h\s*(\d{2})?/i) || t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!m) return '';
  const hour = Number(m[1]);
  if (hour > 23) return '';
  return `${String(hour).padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
}

// City from an OVV address ("Rue de Genève 97 B 1004 Lausanne" -> "Lausanne").
function ovvCityFromAddress(address) {
  const m = clean(String(address || '')).match(/(?<!\d)\d{4}\s+([A-Za-zÀ-ÿ'’()\- ]+?)\s*$/);
  return m ? clean(m[1]) : '';
}

function extractOvvListings(html, baseUrl = SOURCES.ovv.baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('a.teaser-event').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    if (!/\/agenda\//.test(href)) return;
    const dateHtml = $a.find('.date').first().html() || '';
    const parsed = parseOvvListingDate(dateHtml);
    if (!parsed) return;
    const title = clean($a.find('h3').first().text());
    if (!title) return;
    const domain = clean($a.find('.domain').first().text());
    const address = clean($a.find('.address').first().text());
    items.push({
      url: canonicalUrl(href, baseUrl) || `${baseUrl}${href}`,
      title, domain, address,
      city: ovvCityFromAddress(address),
      startDate: parsed.startDate, endDate: parsed.endDate,
      startTime: parseOvvTime(parsed.timeLine),
      dateText: parsed.dateText, timeLine: clean(parsed.timeLine)
    });
  });
  // Dedupe by canonical URL (some cards repeat across listing sections).
  return uniqBy(items, i => i.url);
}

// Enrich from the detail page: `.lead` description + an official external Website link.
function parseOvvDetail(html) {
  const $ = cheerio.load(html);
  const description = clean($('.lead').first().text());
  let website = '';
  $('.contact-infos a[href], a[href]').each((_, a) => {
    if (website) return;
    const label = clean($(a).closest('p').find('.label').first().text());
    const href = $(a).attr('href') || '';
    if (/website|site/i.test(label) && /^https?:/i.test(href)) website = href;
  });
  return { description, website };
}

async function scrapeOvv() {
  let html;
  try {
    html = fetchOvvHtml(SOURCES.ovv.url, 30000);
  } catch (e) {
    return [{ source: 'ovv', title: 'Office des Vins Vaudois — agenda', url: SOURCES.ovv.url, error: e.message }];
  }
  const today = new Date().toISOString().slice(0, 10);
  const listings = extractOvvListings(html)
    .filter(l => ((l.endDate || l.startDate) || '').slice(0, 10) >= today);
  const events = [];
  const batchSize = 8;
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const parsed = await Promise.all(batch.map(async (l) => {
      let detail = { description: '', website: '' };
      try { detail = parseOvvDetail(await fetchHtml(l.url, 15000)); } catch { /* listing-level fallback */ }
      const hay = `${l.title} ${l.domain} ${detail.description} ${l.timeLine}`;
      const free = /gratuit\w*|entr[ée]e libre|libre acc[èe]s/i.test(hay);
      const priceText = free ? (hay.match(/gratuit\w*|entr[ée]e libre|libre acc[èe]s/i) || [''])[0] : '';
      // Caves ouvertes / fêtes / balades / marchés are family-compatible terroir outings;
      // pure adult tastings ("bar à vins", "dégustation") are kept but not flagged famille.
      const familyLike = /caves? ouvertes|f[êe]te|festival|balade|march[ée]|portes ouvertes|vendanges|guinguette|terroir en f[êe]te|famille|enfants?/i.test(hay)
        && !/^bar à vins/i.test(l.title);
      const locationText = clean([l.domain, l.address].filter(Boolean).join(' · ')) || l.address || 'Vignoble vaudois';
      const officialSources = uniqBy([l.url, detail.website].filter(h => /^https?:/i.test(h)).map(h => canonicalUrl(h, SOURCES.ovv.baseUrl)).filter(Boolean), x => x);
      return normalizeEvent({
        source: 'ovv', title: l.title,
        startDate: isoDateZurich(l.startDate, l.startTime), endDate: l.endDate,
        locationName: l.domain || (l.city ? `Vignoble vaudois — ${l.city}` : 'Vignoble vaudois'),
        locationText,
        city: l.city,
        url: l.url,
        description: detail.description || l.title,
        ageText: familyLike ? 'tout public / famille (terroir)' : '',
        priceText: clean(priceText),
        tags: inferTags(`${hay} vin vignoble terroir cave dégustation ${familyLike ? 'famille plein air' : ''} Vaud`),
        sourceProvenance: `Office des Vins Vaudois — agenda: ${l.url} (${l.dateText}${l.timeLine ? ' / ' + l.timeLine : ''})`,
        officialSources,
        evidence: clean([l.dateText, l.startDate, l.endDate && `→ ${l.endDate}`, l.timeLine, l.domain, l.address, priceText].filter(Boolean).join(' | ')).slice(0, 1200)
      });
    }));
    events.push(...parsed);
  }
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

// --- Centre Pro Natura de Champ-Pittet (Cheseaux-Noréaz, Grande Cariçaie) ------
// Drupal listing; use a curl-backed fetch for the same reliability the other CMS
// sources rely on.
function fetchChampPittetHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Convert a DD.MM.YYYY card query-string date to YYYY-MM-DD (numeric, unambiguous).
function champPittetIsoDate(text) {
  const m = clean(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0'), month = m[2].padStart(2, '0');
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${m[3]}-${month}-${day}`;
}

// Extract the event cards from the /fr/agenda listing. Each `.cards__wrapper a.card`
// links a stable /fr/<slug> detail page and carries its date range in the href
// query-string (startDate/endDate DD.MM.YYYY). Titles use soft hyphens + &nbsp;,
// which are stripped here (the detail JSON-LD name is preferred later anyway).
function extractChampPittetListings(html, baseUrl = SOURCES.champPittet.baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('.cards__wrapper a.card').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const slugMatch = href.match(/^(\/fr\/[^?#]+)/);
    if (!slugMatch) return;
    const q = href.match(/startDate=([\d.]+)[^]*?endDate=([\d.]+)/);
    const startDate = q ? champPittetIsoDate(q[1]) : null;
    let endDate = q ? champPittetIsoDate(q[2]) : null;
    if (!startDate) return;
    if (endDate === startDate) endDate = null;
    const title = clean($a.find('.card__title').first().text().replace(/\u00AD/g, '').replace(/\u00A0/g, ' '));
    if (!title) return;
    const category = clean($a.find('.card__tags').first().text());
    items.push({
      url: canonicalUrl(slugMatch[1], baseUrl) || `${baseUrl}${slugMatch[1]}`,
      slug: slugMatch[1], startDate, endDate, title, category
    });
  });
  return uniqBy(items, x => x.url);
}

// Enrich a card from its /fr/<slug> detail page: schema.org Event name/description,
// the visible local "Heure HH:MM - HH:MM" (`.hero__cta__time .cta-value`), price
// ("Coûts") and the location name. The JSON-LD start/end datetimes are UTC and are
// intentionally NOT used for the time-of-day — the visible Heure field is local.
function parseChampPittetDetail(html, listing) {
  const $ = cheerio.load(html);
  let name = '', description = '';
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const graph = JSON.parse(ld[1])['@graph'] || [];
      const ev = graph.find(g => g['@type'] === 'Event');
      if (ev) { name = clean(ev.name || ''); description = clean(ev.description || ''); }
    } catch { /* fall back to the listing title */ }
  }
  const timeVal = clean($('.hero__cta__time .cta-value').first().text());
  const timeM = timeVal.match(/(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?/);
  const startTime = timeM ? timeM[1] : '';
  const endTime = timeM ? (timeM[2] || '') : '';
  const priceRaw = clean($('.field--name-field-price .field__item').first().text());
  const locationName = clean($('.field--name-field-location-name .field__item').first().text()) || (listing && listing.locationName) || 'Centre Pro Natura de Champ-Pittet';
  const hay = `${priceRaw} ${description}`;
  const free = /gratuit|entr[ée]e libre|offert/i.test(hay);
  const priceText = free ? (hay.match(/gratuit\w*|entr[ée]e libre|offert/i) || [''])[0] : priceRaw;
  return { name, description, startTime, endTime, priceText: clean(priceText), locationName };
}

async function scrapeChampPittet() {
  const base = SOURCES.champPittet.url;
  let listings = [];
  try {
    const first = fetchChampPittetHtml(base, 25000);
    listings = extractChampPittetListings(first);
    const totalM = clean(cheerio.load(first)('body').text()).match(/de\s+(\d+)\s+sont affich/i);
    const total = totalM ? Number(totalM[1]) : listings.length;
    for (let page = 1; listings.length < total && page < 8; page++) {
      const more = extractChampPittetListings(fetchChampPittetHtml(`${base}?page=${page}`, 25000));
      if (!more.length) break;
      listings = uniqBy([...listings, ...more], x => x.url);
    }
  } catch (e) {
    return [{ source: 'champPittet', title: 'Centre Pro Natura de Champ-Pittet — agenda', url: base, error: e.message }];
  }
  const today = new Date().toISOString().slice(0, 10);
  listings = listings.filter(l => ((l.endDate || l.startDate) || '').slice(0, 10) >= today);
  const venue = 'Centre Pro Natura de Champ-Pittet';
  const events = [];
  const batchSize = 6;
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const parsed = batch.map((l) => {
      let detail = { name: '', description: '', startTime: '', endTime: '', priceText: '', locationName: venue };
      try { detail = parseChampPittetDetail(fetchChampPittetHtml(l.url, 15000), l); } catch { /* listing-level fallback */ }
      const title = detail.name || l.title;
      // Single-day activities carry a local "Heure HH:MM - HH:MM"; multi-day expos
      // (ongoing) stay date-level.
      const multiDay = !!l.endDate;
      const startDate = multiDay ? l.startDate : isoDateZurich(l.startDate, detail.startTime);
      const endDate = multiDay ? l.endDate : (detail.endTime ? isoDateZurich(l.startDate, detail.endTime) : null);
      const hay = `${title} ${detail.description} ${l.category}`;
      const familyLike = /famille|enfants?|atelier|bricolage|sentier|expo|nature|for[êe]t|jardin|abeille|conte|d[ée]couverte|bibliothèque|bain de for[êe]t|tout public/i.test(hay);
      return normalizeEvent({
        source: 'champPittet', title,
        startDate, endDate,
        locationName: detail.locationName || venue,
        locationText: `${detail.locationName || venue}, Cheseaux-Noréaz`,
        city: 'Cheseaux-Noréaz',
        url: l.url,
        description: detail.description || title,
        ageText: familyLike ? 'tout public / famille' : '',
        priceText: detail.priceText,
        tags: inferTags(`${hay} ${l.category} nature Grande Cariçaie lac roselière plein air famille Champ-Pittet Cheseaux-Noréaz`),
        sourceProvenance: `Centre Pro Natura de Champ-Pittet — agenda: ${l.url}${l.category ? ` (${l.category})` : ''}`,
        officialSources: [l.url],
        evidence: clean([l.category, l.startDate, l.endDate && `→ ${l.endDate}`, detail.startTime && `${detail.startTime}${detail.endTime ? `-${detail.endTime}` : ''}`, detail.priceText, detail.description].filter(Boolean).join(' | ')).slice(0, 1200)
      });
    });
    events.push(...parsed);
  }
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

// --- Buskers Festival de Neuchâtel (arts de la rue) ---------------------------
// WordPress/Elementor site; the home page mixes leftover text from several past
// editions, so use the /programme/horaires/ page which carries the current dated
// edition. Node fetch works, but use a curl-backed fetch for the same reliability
// the other CMS/WordPress sources rely on.
function fetchBuskersHtml(url, maxTime = 25) {
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse the Buskers horaires page text into festival-level editions. Returns the
// main street festival (a dated day-day month YEAR range in Neuchâtel's pedestrian
// zone, starting "dès HHhMM") plus the family day at La Ramée in Marin. The main
// range requires an explicit 4-digit year, which isolates the current edition from
// the daily-schedule lines ("du 11 au 13 août: de 17h00 à 23h00") that have none.
function parseBuskersEditions(text, fallbackYear = new Date().getFullYear()) {
  const t = clean(text).replace(/&nbsp;/gi, ' ');
  const out = [];
  const dayName = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';

  const rangeRe = new RegExp(`du\\s+(?:${dayName})?\\s*(\\d{1,2})\\s+au\\s+(?:${dayName})?\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?\\s+(\\d{4})`, 'i');
  const r = t.match(rangeRe);
  if (r) {
    const month = MONTHS[r[3].toLowerCase().replace(/\.$/, '')];
    const year = r[4];
    // Start time: the first "dès HHhMM" that follows the dated range.
    const after = t.slice(r.index + r[0].length, r.index + r[0].length + 160);
    const tm = after.match(/d[èe]s\s+(\d{1,2})\s*h\s*(\d{2})?/i);
    out.push({
      kind: 'street',
      startDate: `${year}-${month}-${String(r[1]).padStart(2, '0')}`,
      endDate: `${year}-${month}-${String(r[2]).padStart(2, '0')}`,
      startTime: tm ? `${tm[1]}h${tm[2] || '00'}` : '',
      dateText: clean(r[0]),
      year
    });
  }

  // La Ramée family day: "Dimanche 16 août à la Ramée à Marin de 11h00 à 18h00".
  const rameeRe = new RegExp(`(?:${dayName})?\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?\\s+[àa]\\s+la\\s+ram[ée]e[^.]*?\\bde\\s+(\\d{1,2})\\s*h\\s*(\\d{2})?\\s+[àa]\\s+(\\d{1,2})\\s*h\\s*(\\d{2})?`, 'i');
  const rm = t.match(rameeRe);
  if (rm) {
    const month = MONTHS[rm[2].toLowerCase().replace(/\.$/, '')];
    // The La Ramée line carries no year; inherit from the main range when present.
    const year = (out[0] && out[0].year) || String(fallbackYear);
    out.push({
      kind: 'ramee',
      startDate: `${year}-${month}-${String(rm[1]).padStart(2, '0')}`,
      endDate: null,
      startTime: `${rm[3]}h${rm[4] || '00'}`,
      endTime: `${rm[5]}h${rm[6] || '00'}`,
      dateText: clean(rm[0]),
      year
    });
  }
  return out;
}

async function scrapeBuskers() {
  const html = fetchBuskersHtml(SOURCES.buskers.url);
  const text = htmlToText(html);
  const editions = parseBuskersEditions(text);
  const today = new Date().toISOString().slice(0, 10);
  const officialSources = [SOURCES.buskers.url, SOURCES.buskers.baseUrl + '/'];
  const events = editions.map(ed => {
    if (ed.kind === 'ramee') {
      return normalizeEvent({
        source: 'buskers',
        title: 'Buskers Festival – La Ramée (journée famille au bord du lac)',
        startDate: isoDateZurich(ed.startDate, ed.startTime), endDate: ed.endDate,
        locationName: 'La Ramée',
        locationText: 'La Ramée, Chem. de la Ramée 4, 2074 Marin-Epagnier',
        city: 'Marin-Epagnier',
        url: `${SOURCES.buskers.url}#${sha(`ramee|${ed.startDate}`)}`,
        description: `Journée familiale de clôture du Buskers Festival à La Ramée (rive du lac, Marin-Epagnier), concerts et spectacles de rue de ${ed.startTime} à ${ed.endTime}. Ambiance plein-air/famille, accès participatif (chapeau).`,
        ageText: 'tout public / famille',
        priceText: 'Gratuit / chapeau (soutien)',
        tags: inferTags('festival arts de la rue concert spectacle plein air lac famille gratuit chapeau La Ramée Marin'),
        sourceProvenance: `Buskers Festival Neuchâtel – horaires: ${SOURCES.buskers.url} (${ed.dateText})`,
        officialSources,
        evidence: clean(`${ed.dateText} | ${ed.startDate} ${ed.startTime}-${ed.endTime} | La Ramée, Marin-Epagnier`).slice(0, 1200)
      });
    }
    return normalizeEvent({
      source: 'buskers',
      title: `Buskers Festival Neuchâtel ${ed.year} (arts de la rue)`,
      startDate: isoDateZurich(ed.startDate, ed.startTime), endDate: ed.endDate,
      locationName: 'Vieille ville de Neuchâtel (zone piétonne)',
      locationText: 'Vieille ville / zone piétonne, Neuchâtel',
      city: 'Neuchâtel',
      url: `${SOURCES.buskers.url}#${sha(`street|${ed.startDate}`)}`,
      description: `Le plus ancien festival de musique et d'arts de la rue de Suisse (depuis 1990) : une vingtaine de compagnies déambulent dans la zone piétonne de Neuchâtel${ed.startTime ? `, dès ${ed.startTime}` : ''}. Spectacles de rue en accès libre (modèle chapeau/soutien, programme papier CHF 10), ambiance familiale et plein-air.`,
      ageText: 'tout public / famille',
      priceText: 'Spectacles de rue gratuits (chapeau) – programme CHF 10',
      tags: inferTags('festival musique arts de la rue cirque concert spectacle déambulation plein air famille gratuit chapeau Neuchâtel'),
      sourceProvenance: `Buskers Festival Neuchâtel – horaires: ${SOURCES.buskers.url} (${ed.dateText})`,
      officialSources,
      evidence: clean(`${ed.dateText} | ${ed.startDate} → ${ed.endDate} | Neuchâtel zone piétonne | dès ${ed.startTime || '17h00'}`).slice(0, 1200)
    });
  });
  return uniqBy(events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today), e => recommendationKey(e));
}

function fetchCastrumData(url, maxTime = 30) {
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
}

// Convert a Payload/CMS UTC ISO instant ("2026-08-08T19:00:00.000Z") to a DST-aware
// Europe/Zurich ISO string. Le Castrum stores session start/end in UTC while the site
// displays local wall-clock time (Fri 18:30Z → "vendredi 20h30" in August), so we must
// shift, never take the Z time verbatim.
function castrumUtcToZurichIso(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return iwebTimestampToZurichIso(ms);
}

// Le Castrum's /programme is a SvelteKit route whose `__data.json` uses devalue's
// flattened pool: every value (including strings/numbers) is stored once in a flat array
// and referenced by its integer index; negative indices are devalue specials (undefined
// etc.). `deref` follows one index into the pool; the extractor only walks the few fields
// it needs (title, slug, category name, booking, sessions{location,startDate,endDate}),
// deliberately never descending into the cyclic `edition`/`theme` graph.
function derefCastrum(pool, idx) {
  if (typeof idx !== 'number' || idx < 0) return null;
  return pool[idx];
}

function extractCastrumListings(json, now = new Date()) {
  const nodes = json && Array.isArray(json.nodes) ? json.nodes : [];
  const node = nodes.find(n => n && n.type === 'data' && Array.isArray(n.data)
    && n.data[0] && typeof n.data[0] === 'object' && 'events' in n.data[0]);
  if (!node) return [];
  const pool = node.data;
  const D = i => derefCastrum(pool, i);
  const eventsArr = D(pool[0].events);
  if (!Array.isArray(eventsArr)) return [];
  const todayIso = now.toISOString().slice(0, 10);
  const rows = [];
  for (const ei of eventsArr) {
    const ev = D(ei);
    if (!ev || typeof ev !== 'object') continue;
    const title = clean(D(ev.title) || '');
    const slug = clean(D(ev.slug) || '');
    if (!title || !slug) continue;
    const shortDescription = clean(D(ev.shortDescription) || '');
    const info = D(ev.info) || {};
    const catObj = D(info.category);
    const category = catObj && typeof catObj === 'object' ? clean(D(catObj.name) || '') : '';
    const booking = D(info.booking) === true;
    const bookingLink = clean(D(info.bookingLink) || '');
    const sessionsArr = D(info.sessions);
    if (!Array.isArray(sessionsArr)) continue;
    for (const si of sessionsArr) {
      const s = D(si);
      if (!s || typeof s !== 'object') continue;
      const startIso = castrumUtcToZurichIso(D(s.startDate));
      if (!startIso) continue;
      const endIso = castrumUtcToZurichIso(D(s.endDate));
      const locObj = D(s.location);
      const locationName = locObj && typeof locObj === 'object' ? clean(D(locObj.name) || '') : '';
      const startDay = startIso.slice(0, 10);
      if (startDay < todayIso) continue;
      const endDay = (endIso || '').slice(0, 10);
      rows.push({
        title, slug, shortDescription, category, booking, bookingLink,
        locationName,
        startDate: startIso,
        // Keep endDate only for genuine multi-day items; same-day end times collapse to null.
        endDate: endDay && endDay !== startDay ? endIso : null
      });
    }
  }
  return rows;
}

function castrumEventFromRow(row) {
  const cat = row.category ? `${row.category}` : '';
  const catLc = cat.toLowerCase();
  const childCentricCat = /atelier|conte|jeune|famille|installation|exposition/.test(catLc);
  const priceText = row.booking ? 'Sur réservation (billetterie Castrum)' : 'Accès libre — festival majoritairement gratuit';
  const locationText = [row.locationName, 'Yverdon-les-Bains'].filter(Boolean).join(', ');
  const url = `${SOURCES.castrum.eventBase}${row.slug}#${row.startDate.slice(0, 10)}`;
  const officialSources = [SOURCES.castrum.eventBase + row.slug, SOURCES.castrum.baseUrl + '/grille-horaire'];
  if (row.bookingLink) officialSources.push(row.bookingLink);
  return normalizeEvent({
    source: 'castrum',
    title: cat ? `${row.title} (${cat}, Le Castrum)` : `${row.title} (Le Castrum)`,
    startDate: row.startDate,
    endDate: row.endDate,
    locationName: row.locationName || 'Le Castrum',
    locationText,
    city: 'Yverdon-les-Bains',
    url,
    description: clean([
      row.shortDescription,
      `Programmé au festival Le Castrum d'Yverdon-les-Bains (cœur historique / esplanade du Château)${row.locationName ? `, ${row.locationName}` : ''}.`,
      'Festival pluridisciplinaire estival, majoritairement gratuit, plein-air en centre-ville.'
    ].filter(Boolean).join(' ')),
    ageText: childCentricCat ? 'famille / tout public' : 'tout public',
    priceText,
    tags: inferTags(`festival ${cat} ${row.title} ${row.locationName} plein air Yverdon centre-ville gratuit famille spectacle`),
    sourceProvenance: `Le Castrum – programme: ${SOURCES.castrum.eventBase}${row.slug} (${cat || 'événement'})`,
    officialSources,
    evidence: clean(`${row.title} | ${cat} | ${row.startDate}${row.endDate ? ` → ${row.endDate}` : ''} | ${locationText} | ${priceText}`).slice(0, 1200)
  });
}

async function scrapeCastrum() {
  const json = JSON.parse(fetchCastrumData(SOURCES.castrum.url));
  const rows = extractCastrumListings(json);
  const today = new Date().toISOString().slice(0, 10);
  const events = rows.map(castrumEventFromRow)
    .filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today);
  return uniqBy(events, e => recommendationKey(e));
}

function fetchMaisonAilleursData(url, maxTime = 25) {
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
}

// Maison d'Ailleurs stores each activity's date in its slug, which is the only
// deterministic machine-readable date on the record (ACF date fields are not exposed
// via REST). Two shapes exist, both trailing the slug: single day `<title>-JJ-MM-AAAA`
// and same-month range `<title>-J1-J2-MM-AAAA` (e.g. `50-ans-musee-2-3-05-2026`). The
// range shape is tested first, but only accepted when its month segment is a valid month
// (<=12) so a title ending in a number can't be mis-read as a 4th date token.
function parseMaisonAilleursSlugDate(slug) {
  const s = String(slug || '');
  const range = s.match(/-(\d{1,2})-(\d{1,2})-(\d{1,2})-(20\d{2})$/);
  if (range) {
    const d1 = +range[1], d2 = +range[2], mm = +range[3], yyyy = +range[4];
    if (mm >= 1 && mm <= 12 && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
      const month = String(mm).padStart(2, '0');
      const start = `${yyyy}-${month}-${String(d1).padStart(2, '0')}`;
      const end = `${yyyy}-${month}-${String(d2).padStart(2, '0')}`;
      return { startDate: start, endDate: end !== start ? end : null };
    }
  }
  const single = s.match(/-(\d{1,2})-(\d{1,2})-(20\d{2})$/);
  if (single) {
    const dd = +single[1], mm = +single[2], yyyy = +single[3];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return { startDate: `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, endDate: null };
    }
  }
  return null;
}

// Reduce a REST content.rendered blob to the human lead, dropping the Gravity/booking
// form boilerplate that trails many activity pages ("Sur inscription", "« * » indique
// les champs nécessaires", the country <select>, etc.). The structured date/horaire/
// public/prix lines all sit in this lead.
function maisonAilleursLead(contentHtml) {
  let text = htmlToText(contentHtml || '');
  for (const cut of ['Sur inscription', '« * » indique', 'indique les champs', 'Inscription inscription', 'Nom de l’activité', "Nom de l'activité"]) {
    const i = text.indexOf(cut);
    if (i > 0) text = text.slice(0, i);
  }
  return clean(text);
}

function maisonAilleursTime(lead) {
  // "14h-16h" / "Départ à 19h30, 20h30 ou 21h30" / "dès 14h00" → first HHh(MM) token.
  return parseTime(lead) ? parseTime(lead).slice(0, 5) : '';
}

function maisonAilleursPrice(lead) {
  const chf = lead.match(/CHF\s*\d+[.\-\d]*\s*(?:\.-)?\s*(?:par\s+(?:enfant|personne|famille|adulte)|\/[^.]*)?/i);
  if (chf) return clean(chf[0]);
  if (/acc[èe]s\s+libre/i.test(lead)) return 'Accès libre (visiteurs du musée)';
  if (/gratuit|entr[ée]e\s+libre/i.test(lead)) return 'Gratuit';
  return '';
}

function maisonAilleursAgeText(lead) {
  const m = lead.match(/(?:enfants?\s+)?d[èe]s\s+\d{1,2}\s*ans(?:\s*(?:&|et)\s*familles?)?/i)
    || lead.match(/\d{1,2}\s*(?:-|à)\s*\d{1,2}\s*ans/i)
    || lead.match(/tout\s+public/i);
  return m ? clean(m[0]) : '';
}

function maisonAilleursEventFromRecord(rec) {
  const title = clean(htmlToText(rec.title && rec.title.rendered || ''));
  const slug = clean(rec.slug || '');
  const link = clean(rec.link || `${SOURCES.maisonAilleurs.baseUrl}/activites/${slug}/`);
  if (!title || !slug) return null;
  const slugDate = parseMaisonAilleursSlugDate(slug);
  const lead = maisonAilleursLead(rec.content && rec.content.rendered || '');
  // Slug is authoritative for the day; fall back to a French date in the lead only when
  // the slug carries none (e.g. evergreen slugs like `crea-lab-ete-2026`).
  let startDay = slugDate && slugDate.startDate;
  let endDay = slugDate && slugDate.endDate;
  if (!startDay) {
    const contentDate = parseFrenchDate(lead);
    if (!contentDate) return null; // no concrete date → skip (evergreen/recurring pass)
    startDay = contentDate;
    endDay = null;
  }
  const time = maisonAilleursTime(lead);
  const ageText = maisonAilleursAgeText(lead);
  const priceText = maisonAilleursPrice(lead);
  const isKids = /atelier\s+kids/i.test(lead) || /enfants?\s+d[èe]s/i.test(lead);
  const startDate = isoDateZurich(startDay, time);
  const endDate = endDay && endDay !== startDay ? endDay : null;
  const description = clean(`${lead.slice(0, 480)}${isKids ? '' : ''}`) ||
    'Activité à la Maison d’Ailleurs (musée de la science-fiction, Yverdon-les-Bains).';
  return normalizeEvent({
    source: 'maisonAilleurs',
    title: `${title} (Maison d’Ailleurs)`,
    startDate,
    endDate,
    locationName: 'Maison d’Ailleurs',
    locationText: 'Maison d’Ailleurs, Place Pestalozzi 14, Yverdon-les-Bains',
    city: 'Yverdon-les-Bains',
    url: link,
    description,
    ageText: ageText || (isKids ? 'enfants / famille' : ''),
    priceText,
    tags: inferTags(`${isKids ? 'atelier enfants famille ' : ''}science-fiction musée exposition découverte culture atelier ${title} ${lead}`),
    sourceProvenance: `Maison d’Ailleurs — activités: ${link}`,
    officialSources: [link, `${SOURCES.maisonAilleurs.baseUrl}/activites/`],
    evidence: clean(`${title} | slug:${slug} | ${startDay}${endDay ? ` → ${endDay}` : ''}${time ? ` ${time}` : ''} | ${ageText || (isKids ? 'ATELIER KIDS' : 'tout public')} | ${priceText || 'prix n/c'}`).slice(0, 1200)
  });
}

async function scrapeMaisonAilleurs() {
  let records = [];
  try {
    records = JSON.parse(fetchMaisonAilleursData(SOURCES.maisonAilleurs.url));
  } catch (e) {
    return [{ source: 'maisonAilleurs', title: 'Maison d’Ailleurs — activités', url: SOURCES.maisonAilleurs.baseUrl, error: e.message }];
  }
  if (!Array.isArray(records)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const events = records
    .map(maisonAilleursEventFromRecord)
    .filter(e => e && e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today);
  return uniqBy(events, e => recommendationKey(e));
}

// --- Jura & Trois-Lacs (J3L) — agenda régional géo-restreint -------------------
// MyCity Tourism agenda: the page embeds a GeoJSON FeatureCollection in a
// `<script id="list-data" type="application/json">` blob (~1600 events). Each
// feature carries a Point geometry ([lon, lat]) plus title/subtitle/text/href,
// categorytype/objectCategory, city/region/subregion and dateFrom/dateTo. There is
// no time or price at listing level, so extraction is intentionally date-level
// (like `avenches`). The canton is too broad, so events are geo-scoped to a radius
// around Yverdon (straight-line haversine on the feature coordinates).
const J3L_YVERDON = { lat: 46.7785, lon: 6.6410 };

function fetchJ3lHtml(url, timeoutMs = 30000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(v => Number.isFinite(v))) return null;
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Pull the embedded `#list-data` GeoJSON FeatureCollection out of the agenda page.
function extractJ3lFeatures(html) {
  const m = /id="list-data"[^>]*>/.exec(html || '');
  if (!m) return [];
  const start = m.index + m[0].length;
  const end = html.indexOf('</script>', start);
  if (end < 0) return [];
  let data;
  try { data = JSON.parse(html.slice(start, end).trim()); } catch { return []; }
  return Array.isArray(data && data.features) ? data.features : [];
}

// Keep features within `radiusKm` of Yverdon (straight-line) that have a valid
// upcoming date, carrying the computed distance for evidence/annotation.
function j3lScopedRows(features, radiusKm = SOURCES.j3l.radiusKm, todayIso = new Date().toISOString().slice(0, 10)) {
  const rows = [];
  for (const f of features || []) {
    const p = f && f.properties;
    const g = f && f.geometry;
    if (!p || !g || g.type !== 'Point' || !Array.isArray(g.coordinates)) continue;
    const [lon, lat] = g.coordinates;
    const km = haversineKm(J3L_YVERDON.lat, J3L_YVERDON.lon, lat, lon);
    if (km == null || km > radiusKm) continue;
    const startDate = j3lIsoDate(p.dateFrom);
    if (!startDate) continue;
    const endIso = j3lIsoDate(p.dateTo);
    const endDate = endIso && endIso !== startDate ? endIso : null;
    if ((endDate || startDate) < todayIso) continue;
    rows.push({ p, startDate, endDate, straightKm: Math.round(km * 10) / 10 });
  }
  return rows;
}

function j3lIsoDate(v) {
  const m = clean(v || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function j3lEventFromRow(row) {
  const p = row.p;
  const title = clean(decodeHtmlEntities(p.title || ''));
  const category = clean(decodeHtmlEntities(p.objectCategory || p.subtitle || ''));
  const city = clean(decodeHtmlEntities(p.city || p.label || p.subregion || ''));
  const desc = clean(decodeHtmlEntities(p.text || ''));
  const href = p.href || (p.id ? `/fr/P${p.id}` : '');
  const url = canonicalUrl(href, SOURCES.j3l.baseUrl);
  const subregion = clean(decodeHtmlEntities(p.subregion || ''));
  const locationText = [city, subregion && subregion !== city ? subregion : ''].filter(Boolean).join(', ') || city;
  const hay = `${title} ${desc} ${category}`.toLowerCase();
  const ageText = /famille|enfant|jeune public|tout public|kids|petits/.test(hay) ? 'famille / tout public (à confirmer)' : '';
  const priceText = /gratuit|entrée libre|entree libre|accès libre|acces libre|offert|chapeau/.test(hay) ? 'Gratuit / accès libre (à confirmer)' : '';
  return normalizeEvent({
    source: 'j3l',
    title,
    startDate: row.startDate,
    endDate: row.endDate,
    locationName: city,
    locationText,
    city,
    url,
    description: [desc, category ? `Catégorie: ${category}.` : ''].filter(Boolean).join(' '),
    ageText,
    priceText,
    tags: inferTags(`${title} ${desc} ${category} ${city} plein air festival terroir`),
    sourceProvenance: `Jura & Trois-Lacs (J3L) — agenda régional (${category || 'manifestation'}, ~${row.straightKm} km d'Yverdon): ${url}`,
    officialSources: [url].filter(Boolean),
    evidence: clean([
      title,
      `${row.startDate}${row.endDate ? ` → ${row.endDate}` : ''}`,
      city && `lieu ${city}`,
      category,
      `≈${row.straightKm} km d'Yverdon`,
      desc
    ].filter(Boolean).join(' | ')).slice(0, 1200)
  });
}

async function scrapeJ3l() {
  let html;
  try {
    html = fetchJ3lHtml(SOURCES.j3l.url);
  } catch (e) {
    return [{ source: 'j3l', title: 'J3L agenda', url: SOURCES.j3l.url, error: e.message }];
  }
  const features = extractJ3lFeatures(html);
  const rows = j3lScopedRows(features);
  const today = new Date().toISOString().slice(0, 10);
  const events = rows.map(j3lEventFromRow)
    .filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today);
  return uniqBy(events, e => recommendationKey(e));
}

// --- Château de Grandson — agenda du château médiéval -----------------------
function fetchGrandsonChateauHtml(url, timeoutMs = 25000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse the château's French date label into one or more {startDate,endDate} ISO
// occurrences. Handles:
//   "Dimanche 6 septembre 2026"          -> single day
//   "Samedi 8 et dimanche 9 août 2026"   -> contiguous days  -> one multi-day range
//   "12, 16, 19 et 23 août 2026"         -> discrete list    -> N single-day events
//   "Du 8 au 15 août 2026" / cross-month -> explicit range
// The card label carries no time; the time comes from the separate horaire field.
function parseGrandsonChateauDates(text, fallbackYear = new Date().getFullYear()) {
  const raw = clean(text).toLowerCase().replace(/1er/g, '1');
  const yearM = raw.match(/\b(20\d{2})\b/);
  const year = yearM ? yearM[1] : String(fallbackYear);
  const t = yearM ? raw.replace(yearM[0], ' ') : raw;
  const months = [...t.matchAll(new RegExp(`(${MONTH_RE})`, 'gi'))]
    .map(m => ({ i: m.index, month: MONTHS[m[1].toLowerCase().replace(/\.$/, '')] }))
    .filter(m => m.month);
  if (!months.length) return [];
  const monthFor = (pos) => (months.find(m => m.i >= pos) || months[months.length - 1]).month;
  const iso = (day, month) => `${year}-${month}-${String(day).padStart(2, '0')}`;
  // Explicit range: "X [mois] au Y", "du X au Y", "X–Y" (no comma list).
  const rangeM = t.match(new RegExp(`(\\d{1,2})\\s*(?:${MONTH_RE})?\\.?\\s*(?:au|–|—|-)\\s*(\\d{1,2})`, 'i'));
  if (rangeM && !/,/.test(t)) {
    const start = iso(rangeM[1], monthFor(rangeM.index));
    const d2Pos = t.indexOf(rangeM[2], rangeM.index + rangeM[0].length - rangeM[2].length);
    const end = iso(rangeM[2], monthFor(d2Pos < 0 ? rangeM.index : d2Pos));
    return [{ startDate: start, endDate: end === start ? null : end }];
  }
  // Discrete day numbers (the year has been stripped, no times in this field).
  const seen = new Set();
  const items = [];
  for (const m of t.matchAll(/\d{1,2}/g)) {
    const n = Number(m[0]);
    if (n < 1 || n > 31) continue;
    const month = monthFor(m.index);
    const key = `${month}-${m[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ day: n, month, startDate: iso(m[0], month) });
  }
  if (!items.length) return [];
  items.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const sameMonth = items.every(x => x.month === items[0].month);
  const contiguous = sameMonth && items.length > 1 && items[items.length - 1].day - items[0].day === items.length - 1;
  if (contiguous) return [{ startDate: items[0].startDate, endDate: items[items.length - 1].startDate }];
  return items.map(x => ({ startDate: x.startDate, endDate: null }));
}

// "13h30 - 17h00" / "14h00" / "17h00 – 22h00" -> { startTime, endTime } as HH:MM.
function parseGrandsonChateauTime(text) {
  const times = [...clean(text).matchAll(/(\d{1,2})\s*h\s*(\d{2})?/gi)]
    .map(m => `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`);
  return { startTime: times[0] || '', endTime: times[1] || '' };
}

// Extract event cards from the /agenda/ listing. Each `grid-cols-[1fr_2fr_1fr]` card
// carries a title anchor to `/agenda/<slug>/`, a French date label, a horaire and a
// mix of category/public/price tags.
function extractGrandsonChateauListings(html, baseUrl = SOURCES.grandsonChateau.baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('div[class*="grid-cols-[1fr_2fr_1fr]"]').each((_, el) => {
    const $c = $(el);
    const $title = $c.find('a[class*="text-xl"]').first();
    const title = clean($title.text());
    const href = $title.attr('href') || $c.find('a[href*="/agenda/"]').first().attr('href') || '';
    if (!title || !/\/agenda\/[a-z0-9]/i.test(href)) return;
    const info = $c.find('div[class*="row-span-2"]').first();
    const dateText = clean(info.find('div[class*="font-medium"]').first().text());
    const timeM = clean(info.text()).match(/\d{1,2}\s*h\s*\d{0,2}(?:\s*[-–—]\s*\d{1,2}\s*h\s*\d{0,2})?/i);
    const timeText = timeM ? timeM[0] : '';
    const tags = info.find('div[class*="bg-neutral-100"]').map((__, t) => clean($(t).text())).get().filter(Boolean);
    items.push({ url: canonicalUrl(href, baseUrl) || href, title, dateText, timeText, tags });
  });
  return uniqBy(items, x => x.url);
}

// Enrich a card from its /agenda/<slug>/ detail page: Yoast JSON-LD WebPage
// description, the "Informations pratiques" Tarifs value, and the first external
// billetterie/organisateur link (non-social).
function parseGrandsonChateauDetail(html) {
  let description = '';
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const graph = JSON.parse(ld[1])['@graph'] || [];
      const wp = graph.find(g => g['@type'] === 'WebPage');
      if (wp && wp.description) description = clean(wp.description);
    } catch { /* fall back to the listing title */ }
  }
  const tarifM = html.match(/Tarifs\s*<\/[^>]+>\s*<[^>]*>\s*([^<]+?)\s*</i);
  const tarifs = tarifM ? clean(decodeHtmlEntities(tarifM[1])) : '';
  const social = /facebook|instagram|tiktok|youtube|linkedin|twitter|x\.com|gmpg\.org|antistatique|whatsapp|maps\.google/i;
  const mainM = html.match(/<main[\s\S]*?<\/main>/i);
  const main = mainM ? mainM[0] : html;
  let externalLink = '';
  for (const m of main.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const u = m[1];
    if (!/chateau-grandson\.ch/.test(u) && !social.test(u)) { externalLink = u; break; }
  }
  return { description, tarifs, externalLink };
}

// Build one normalized event per date occurrence (multi-date labels expand to N).
function grandsonChateauEventsFromListing(l, detail = {}) {
  const occurrences = parseGrandsonChateauDates(l.dateText);
  if (!occurrences.length) return [];
  const { startTime, endTime } = parseGrandsonChateauTime(l.timeText);
  const tags = l.tags || [];
  const isAge = (t) => /d[èe]s\s*\d+\s*ans|tout public|alles publikum/i.test(t);
  const freeTag = tags.some(t => /^gratuit$/i.test(t));
  const ageTag = tags.find(isAge) || '';
  const categoryTags = tags.filter(t => !/^gratuit$/i.test(t) && !isAge(t));
  const free = freeTag || /gratuit|entr[ée]e libre/i.test(detail.tarifs || '');
  const priceText = free ? 'Gratuit' : clean(detail.tarifs || '');
  const officialSources = uniqBy([l.url, detail.externalLink].filter(Boolean), x => x);
  const venue = 'Château de Grandson';
  return occurrences.map((occ) => {
    const multiDay = !!occ.endDate;
    const startDate = multiDay ? occ.startDate : isoDateZurich(occ.startDate, startTime);
    const endDate = multiDay ? occ.endDate : (endTime ? isoDateZurich(occ.startDate, endTime) : null);
    const hay = `${l.title} ${detail.description || ''} ${categoryTags.join(' ')}`;
    const familyLike = !!ageTag || /famille|enfants?|atelier|initiation|conte|spectacle|m[ée]di[ée]val|chevalier|visite|d[ée]couverte|jeu/i.test(hay);
    return normalizeEvent({
      source: 'grandsonChateau', title: l.title, startDate, endDate,
      locationName: venue,
      locationText: `${venue}, Place du Château 1, 1422 Grandson`,
      city: 'Grandson',
      url: l.url,
      description: detail.description || l.title,
      ageText: ageTag || (familyLike ? 'tout public / famille' : ''),
      priceText,
      tags: inferTags(`${hay} château médiéval patrimoine famille Grandson ${categoryTags.join(' ')}`),
      sourceProvenance: `Château de Grandson — agenda: ${l.url}${categoryTags.length ? ` (${categoryTags.join(', ')})` : ''}`,
      officialSources,
      evidence: clean([l.dateText, l.timeText, categoryTags.join(', '), ageTag, priceText, detail.description].filter(Boolean).join(' | ')).slice(0, 1200)
    });
  });
}

async function scrapeGrandsonChateau() {
  const base = SOURCES.grandsonChateau.url;
  let listings = [];
  try {
    listings = extractGrandsonChateauListings(fetchGrandsonChateauHtml(base, 25000));
    // Defensive pagination (the site currently lists all upcoming events on page 1).
    for (let page = 2; page <= 4; page++) {
      let more = [];
      try { more = extractGrandsonChateauListings(fetchGrandsonChateauHtml(`${SOURCES.grandsonChateau.baseUrl}/agenda/page/${page}/`, 20000)); } catch { break; }
      const before = listings.length;
      listings = uniqBy([...listings, ...more], x => x.url);
      if (listings.length === before) break;
    }
  } catch (e) {
    return [{ source: 'grandsonChateau', title: 'Château de Grandson — agenda', url: base, error: e.message }];
  }
  const events = [];
  const batchSize = 6;
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const parsed = batch.map((l) => {
      let detail = { description: '', tarifs: '', externalLink: '' };
      try { detail = parseGrandsonChateauDetail(fetchGrandsonChateauHtml(l.url, 15000)); } catch { /* listing-level fallback */ }
      return grandsonChateauEventsFromListing(l, detail);
    });
    for (const arr of parsed) events.push(...arr);
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today);
  return uniqBy(upcoming, e => recommendationKey(e));
}

function fetchMuseeYverdonHtml(url, timeoutMs = 20000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse a Musée d'Yverdon agenda card-date label into a date-level occurrence + the
// wall-clock start/end times (applied DST-aware by the caller). Handles:
//   "Dimanche 4 octobre, 10h00-18h00"  -> single day, times 10:00/18:00
//   "Samedi 3 janvier"                 -> single day, no time (year inferred forward)
//   "Du 4 au 12 octobre 2026"          -> multi-day range
//   "Du 30 août au 2 septembre 2026"   -> cross-month range
// Single-day labels carry no year on this site, so the next upcoming year is inferred.
function parseMuseeYverdonDate(text, now = new Date()) {
  const raw = clean(text);
  const times = [...raw.matchAll(/(\d{1,2})\s*h\s*(\d{2})?/gi)].map(m => `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`);
  const startTime = times[0] || '';
  const endTime = times[1] || '';
  const t = raw.toLowerCase().replace(/1er/g, '1').replace(/\d{1,2}\s*h\s*\d{0,2}/g, ' ');
  const wd = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
  const yearM = t.match(/\b(20\d{2})\b/);
  const explicitYear = yearM ? yearM[1] : null;
  const today = now.toISOString().slice(0, 10);
  const yearFor = (month, day) => {
    if (explicitYear) return explicitYear;
    const y = now.getUTCFullYear();
    const cand = `${y}-${month}-${String(day).padStart(2, '0')}`;
    return cand < today ? String(y + 1) : String(y);
  };
  const monthNum = (name) => MONTHS[clean(name).toLowerCase().replace(/\.$/, '')];
  const range = t.match(new RegExp(`du\\s+${wd}?\\s*(\\d{1,2})\\s*(?:(${MONTH_RE})\\.?)?\\s+au\\s+${wd}?\\s*(\\d{1,2})\\s+(${MONTH_RE})`, 'i'));
  if (range) {
    const endMonth = monthNum(range[4]);
    const startMonth = monthNum(range[2] || range[4]);
    if (startMonth && endMonth) {
      const year = yearFor(startMonth, range[1]);
      const startDate = `${year}-${startMonth}-${range[1].padStart(2, '0')}`;
      const endYear = endMonth < startMonth ? String(Number(year) + 1) : year;
      const endDate = `${endYear}-${endMonth}-${range[3].padStart(2, '0')}`;
      return { occurrences: [{ startDate, endDate: endDate === startDate ? null : endDate }], startTime, endTime };
    }
  }
  const single = t.match(new RegExp(`${wd}?\\s*(\\d{1,2})\\s+(${MONTH_RE})`, 'i'));
  if (single) {
    const month = monthNum(single[2]);
    if (month) {
      const year = yearFor(month, single[1]);
      return { occurrences: [{ startDate: `${year}-${month}-${single[1].padStart(2, '0')}`, endDate: null }], startTime, endTime };
    }
  }
  return { occurrences: [], startTime, endTime };
}

// Extract event cards from the /agenda/ listing. Each `.event-card` carries a
// `a.card-link` to `/event/<slug>/`, a `.card-title`, a `.card-date` FR label and a
// `.card-excerpt`.
function extractMuseeYverdonListings(html, baseUrl = SOURCES.museeYverdon.baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('.event-card').each((_, el) => {
    const $c = $(el);
    const $link = $c.find('a.card-link').first();
    const href = $link.attr('href') || $c.find('a[href*="/event/"]').first().attr('href') || '';
    const title = clean($c.find('.card-title').first().text());
    const dateText = clean($c.find('.card-date').first().text());
    const excerpt = clean($c.find('.card-excerpt').first().text());
    if (!title || !/\/event\//i.test(href)) return;
    items.push({ url: canonicalUrl(href, baseUrl) || href, title, dateText, excerpt });
  });
  return uniqBy(items, x => x.url);
}

// Enrich a card from its /event/<slug>/ detail page: the `.event-infos` practical
// block carries `Lieu:` and `Prix:` `.event-meta` rows; `.entry-content-main` holds
// the description (share widget text trimmed off).
function parseMuseeYverdonDetail(html) {
  const $ = cheerio.load(html);
  let lieu = '';
  let prix = '';
  $('.event-infos .event-meta').each((_, el) => {
    const txt = clean($(el).text());
    if (/^Lieu\s*:/i.test(txt)) lieu = clean(txt.replace(/^Lieu\s*:/i, ''));
    else if (/^Prix\s*:/i.test(txt)) prix = clean(txt.replace(/^Prix\s*:/i, ''));
  });
  let description = clean($('.entry-content-main').first().text()).replace(/\s*Partage\s*:.*$/i, '').trim();
  return { lieu, prix, description };
}

function museeYverdonEventsFromListing(l, detail = {}) {
  const { occurrences, startTime, endTime } = parseMuseeYverdonDate(l.dateText);
  if (!occurrences.length) return [];
  const lieu = clean(detail.lieu || '');
  const venue = lieu || 'Château d’Yverdon-les-Bains';
  const priceRaw = clean(detail.prix || '');
  const free = /entr[ée]e libre|gratuit/i.test(priceRaw);
  const priceText = free ? (priceRaw || 'Entrée libre') : priceRaw;
  const desc = clean(detail.description || l.excerpt || l.title);
  return occurrences.map((occ) => {
    const multiDay = !!occ.endDate;
    const startDate = multiDay ? occ.startDate : isoDateZurich(occ.startDate, startTime);
    const endDate = multiDay ? occ.endDate : (endTime ? isoDateZurich(occ.startDate, endTime) : null);
    const hay = `${l.title} ${desc}`;
    const age = parseAge('', hay);
    return normalizeEvent({
      source: 'museeYverdon', title: l.title, startDate, endDate,
      locationName: venue,
      locationText: `${venue}, Place Pestalozzi 11, 1400 Yverdon-les-Bains`,
      city: 'Yverdon-les-Bains',
      url: l.url,
      description: desc,
      ageText: age.ageText,
      priceText,
      tags: inferTags(`${hay} musée château patrimoine histoire archéologie exposition atelier famille Yverdon`),
      sourceProvenance: `Musée d’Yverdon et région — agenda: ${l.url}`,
      officialSources: uniqBy([l.url, SOURCES.museeYverdon.url].filter(Boolean), x => x),
      evidence: clean([l.dateText, lieu, priceText, desc].filter(Boolean).join(' | ')).slice(0, 1200)
    });
  });
}

async function scrapeMuseeYverdon() {
  const base = SOURCES.museeYverdon.url;
  let listings = [];
  try {
    listings = extractMuseeYverdonListings(fetchMuseeYverdonHtml(base, 20000));
  } catch (e) {
    return [{ source: 'museeYverdon', title: 'Musée d’Yverdon et région — agenda', url: base, error: e.message }];
  }
  const events = [];
  const batchSize = 6;
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const parsed = batch.map((l) => {
      let detail = { lieu: '', prix: '', description: '' };
      try { detail = parseMuseeYverdonDetail(fetchMuseeYverdonHtml(l.url, 15000)); } catch { /* listing-level fallback */ }
      return museeYverdonEventsFromListing(l, detail);
    });
    for (const arr of parsed) events.push(...arr);
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today);
  return uniqBy(upcoming, e => recommendationKey(e));
}

// --- Bibliothèque publique et scolaire d'Yverdon-les-Bains (TYPO3 news) --------
function fetchBibliothequeYverdonHtml(url, timeoutMs = 20000) {
  const maxTime = Math.max(5, Math.ceil(timeoutMs / 1000));
  return execFileSync('curl', ['-L', '-A', 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)', '--compressed', '--connect-timeout', '8', '-m', String(maxTime), '-sS', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

// Parse the card `a[title]` label into date-level occurrence + the event title.
//   "15.08.2026 | Travelling : ..."           -> single day
//   "Du 13.06 au 20.08.2026 | Exposition ..." -> range (start year inferred from end)
//   "Le Coffre à histoires"                   -> no date (evergreen) -> null
// Range start years are inferred from the end year: a start month later than the end
// month means the range crosses the new year, so start year = end year - 1.
function parseBibliothequeYverdonTitleDate(titleAttr) {
  const raw = clean(titleAttr);
  const range = raw.match(/^Du\s+(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s+au\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s*\|\s*(.+)$/i);
  if (range) {
    const [, sd, sm, syRaw, ed, em, ey, title] = range;
    let startYear = syRaw || ey;
    if (!syRaw && Number(sm) > Number(em)) startYear = String(Number(ey) - 1);
    const startDate = `${startYear}-${sm.padStart(2, '0')}-${sd.padStart(2, '0')}`;
    const endDate = `${ey}-${em.padStart(2, '0')}-${ed.padStart(2, '0')}`;
    return { startDate, endDate: endDate === startDate ? null : endDate, title: clean(title) };
  }
  const single = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*\|\s*(.+)$/);
  if (single) {
    const [, d, m, y, title] = single;
    return { startDate: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, endDate: null, title: clean(title) };
  }
  return null;
}

// Extract event cards from /activites. Each `div.list-article` carries an `a[title]`
// to `/activites/detail/<slug>`, a `.news-list-category` rubric and a `[itemprop=description]`
// teaser. Evergreen items whose title attr carries no concrete date are dropped.
function extractBibliothequeYverdonListings(html, baseUrl = SOURCES.bibliothequeYverdon.baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('div.list-article').each((_, el) => {
    const $c = $(el);
    const $a = $c.find('a[href*="/activites/detail/"]').first();
    const href = $a.attr('href') || '';
    const titleAttr = clean($a.attr('title') || $a.text());
    const parsed = parseBibliothequeYverdonTitleDate(titleAttr);
    if (!href || !parsed) return; // evergreen / undated -> skip
    const category = clean($c.find('.news-list-category').first().text());
    const teaser = clean($c.find('[itemprop=description]').first().text());
    items.push({
      url: canonicalUrl(href, baseUrl) || href,
      title: parsed.title,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      category,
      teaser
    });
  });
  return uniqBy(items, x => x.url);
}

// Enrich a card from its detail page. `[itemprop=articleBody]` holds the description;
// the practical line (time / price / place) is free text at the end, e.g.
// "Dimanche 15 août / 19h00 / Gratuit" + "Aura lieu à La Dérivée (Quai de Nogent)".
function parseBibliothequeYverdonDetail(html) {
  const $ = cheerio.load(html);
  const description = clean($('[itemprop=articleBody]').first().text());
  const timeM = description.match(/(\d{1,2})\s*h\s*(\d{2})/i);
  const timeText = timeM ? `${timeM[1].padStart(2, '0')}h${timeM[2]}` : '';
  let priceText = '';
  if (/gratuit|entr[ée]e libre|accès libre/i.test(description)) priceText = 'Gratuit';
  else {
    const chf = description.match(/(?:CHF|Fr\.?)\s*\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s*(?:CHF|francs?)/i);
    if (chf) priceText = clean(chf[0]);
  }
  let placeText = '';
  const placeM = description.match(/(?:Aura lieu (?:à|au|à la)|Rendez-vous (?:à|au|à la)|Lieu\s*:)\s*([^.,\n]+)/i);
  if (placeM) placeText = clean(placeM[1]);
  return { description, timeText, priceText, placeText };
}

function bibliothequeYverdonEventFromListing(l, detail = {}) {
  const placeHay = `${l.title} ${l.teaser} ${detail.placeText || ''}`;
  const atChampPittet = /champ-?pittet/i.test(placeHay);
  const atDerivee = /d[ée]riv[ée]e/i.test(placeHay);
  const venue = clean(detail.placeText)
    || (atChampPittet ? 'Centre Pro Natura de Champ-Pittet' : 'Bibliothèque publique et scolaire d’Yverdon-les-Bains');
  const city = atChampPittet ? 'Cheseaux-Noréaz' : 'Yverdon-les-Bains';
  const locationText = atChampPittet
    ? `${venue}, Cheseaux-Noréaz`
    : (atDerivee ? `${venue}, Quai de Nogent, Yverdon-les-Bains` : `${venue}, Yverdon-les-Bains`);
  const multiDay = !!l.endDate;
  const startDate = multiDay ? l.startDate : isoDateZurich(l.startDate, detail.timeText || '');
  const endDate = multiDay ? l.endDate : null;
  const desc = clean(detail.description || l.teaser || l.title);
  const jeunePublic = /jeunes?|enfant/i.test(l.category || '');
  const hay = `${l.title} ${desc} ${l.category}`;
  const age = parseAge('', jeunePublic ? `${hay} jeune public enfants` : hay);
  const tagHint = jeunePublic ? `${hay} bibliothèque médiathèque lecture conte jeune public enfants famille culture` : `${hay} bibliothèque médiathèque culture famille`;
  return normalizeEvent({
    source: 'bibliothequeYverdon',
    title: l.title,
    startDate,
    endDate,
    locationName: venue,
    locationText,
    city,
    url: l.url,
    description: desc,
    ageText: age.ageText,
    priceText: detail.priceText || '',
    tags: inferTags(tagHint),
    sourceProvenance: `Bibliothèque publique et scolaire d’Yverdon-les-Bains — activités: ${l.url}`,
    officialSources: uniqBy([l.url, SOURCES.bibliothequeYverdon.url].filter(Boolean), x => x),
    evidence: clean([l.category, detail.placeText, detail.timeText, detail.priceText, desc].filter(Boolean).join(' | ')).slice(0, 1200)
  });
}

async function scrapeBibliothequeYverdon() {
  const base = SOURCES.bibliothequeYverdon.url;
  let listings = [];
  try {
    listings = extractBibliothequeYverdonListings(fetchBibliothequeYverdonHtml(base, 20000));
  } catch (e) {
    return [{ source: 'bibliothequeYverdon', title: 'Bibliothèque d’Yverdon — activités', url: base, error: e.message }];
  }
  const events = [];
  const batchSize = 6;
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const parsed = batch.map((l) => {
      let detail = { description: '', timeText: '', priceText: '', placeText: '' };
      try { detail = parseBibliothequeYverdonDetail(fetchBibliothequeYverdonHtml(l.url, 15000)); } catch { /* listing-level fallback */ }
      return bibliothequeYverdonEventFromListing(l, detail);
    });
    events.push(...parsed);
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.title && e.startDate && ((e.endDate || e.startDate) || '').slice(0, 10) >= today);
  return uniqBy(upcoming, e => recommendationKey(e));
}

function eventReviewQueueMarkdown(queue) {
  if (!queue.events.length) return '# Event review queue\n\nNo shortlisted recommendations.\n';
  return '# Event review queue — mandatory before final send\n\n'
    + 'Run one dedicated isolated session per event. The final Telegram summary must not be sent from `telegram-summary.txt`; it is only a draft until these reviews exist and are consolidated.\n\n'
    + queue.events.map((e, i) => `${i+1}. **${e.title}**\n`
      + `   - id: \`${e.id}\`\n`
      + `   - url: ${e.url}\n`
      + `   - date: ${e.startDate || 'à vérifier'}\n`
      + `   - place: ${e.location || 'à vérifier'}\n`
      + `   - scraper score: ${e.score}/100 — ${e.label}\n`
      + `   - caveats: ${(e.caveats || []).join('; ') || 'aucun'}\n`
      + `   - artifact required: \`event-reviews/${e.id}.md\`\n`).join('\n');
}

function sourceTrustPriority(e) {
  if (e.source !== 'manualJohan') return 0;
  if ((e.officialSources || []).length && ['confirmed', 'verified'].includes(e.confidenceStatus || e.status)) return 1;
  if (['confirmed', 'verified'].includes(e.confidenceStatus || e.status)) return 2;
  return 9;
}

function canonicalRecommendationPool(events) {
  return uniqBy([...events].sort((a, b) => sourceTrustPriority(a) - sourceTrustPriority(b)), recommendationKey);
}

// Per-source wall-clock guard. Individual fetches already abort at 15-30s, but a
// stalled DNS/body-read or a paginating source can still block collectAll
// indefinitely (root cause of the 2026-06-25 silent collection hang: no artifact
// produced). withTimeout rejects loudly so one bad source is logged as an error
// and the run continues with the remaining sources.
// Kept at 90s (TASK-228): with parallel collection a slow source no longer
// blocks the others, so the guard's only job is to cut a truly hung source. A
// few legitimate sources (yverdon ~45s after batch widening, emoi ~50s) need
// more than 60s under concurrent load, so 90s avoids cutting real coverage while
// still bounding the worst case.
const SOURCE_TIMEOUT_MS = 90000;
// How many sources fetch concurrently. Sources mostly hit distinct hosts, so
// bounded parallelism turns the full pass from sum-of-durations into roughly the
// slowest cluster. Kept at 4 (TASK-228): each scraper also fans out its own
// internal detail fetches (batches of ~8), so a higher source-level concurrency
// saturated the connection pool and made heavy sources like grandson/yverdon
// abort mid-fetch. 4 stays comfortably under the 5-min target while leaving each
// source enough network headroom to finish.
const SOURCE_CONCURRENCY = 4;
function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`source timed out after ${Math.round(ms / 1000)}s (wall-clock guard)`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function collectAll() {
  // Local Johan/manual sources are intentionally listed first: they are durable,
  // fast, and should remain visible even when a slow external source delays the
  // wider collection. Recommendation dedupe still prefers official web sources
  // over manual duplicates via canonicalRecommendationPool().
  const sources = Object.entries({ manualJohan: loadManualJohanEvents, prioritizedTheatreCandidates: loadPrioritizedSourceCandidates, grandson: scrapeGrandson, yverdon: scrapeYverdon, ovv: scrapeOvv, emoi: scrapeEmoi, yverdonVille: scrapeYverdonVille, infomaniakYverdon: scrapeInfomaniakYverdon, agendaCh: scrapeAgendaCh, laDerivee: scrapeLaDerivee, orbe: scrapeOrbe, vallorbe: scrapeVallorbe, sainteCroix: scrapeSainteCroix, champvent: scrapeChampvent, echallens: scrapeEchallens, echallensTourisme: scrapeEchallensTourisme, neuchatelVille: scrapeNeuchatelVille, avenches: scrapeAvenches, valleeDeJoux: scrapeValleeDeJoux, fribourgTerroir: scrapeFribourgTerroir, payerne: scrapePayerne, vullyLesLacs: scrapeVully, murtenMorat: scrapeMurtenMorat, chavornay: scrapeChavornay, laSauge: scrapeLaSauge, parcJuraVaudois: scrapeParcJuraVaudois, champPittet: scrapeChampPittet, buskers: scrapeBuskers, castrum: scrapeCastrum, j3l: scrapeJ3l, grandsonChateau: scrapeGrandsonChateau, maisonAilleurs: scrapeMaisonAilleurs, museeYverdon: scrapeMuseeYverdon, bibliothequeYverdon: scrapeBibliothequeYverdon, tempsLibre: scrapeTempsLibre, theatreDuPassage: scrapeTheatreDuPassage, lePommier: scrapeLePommier, theatreBennoBesson: scrapeTheatreBennoBesson, echandole: scrapeEchandole, leProgrammeVaudKids: scrapeLeProgrammeVaudKids, sunsetJazz: scrapeSunsetJazz, chateauLaSarraz: scrapeChateauLaSarraz, pomy: scrapePomy });

  // Run sources with bounded concurrency so one slow/hanging source no longer
  // blocks the rest (root fix for the run overrunning the daily window — TASK-228).
  // Results are written back by index so the flattened event order stays
  // deterministic and manual-first, keeping uniqBy() dedupe preference stable
  // regardless of completion order.
  const perSource = new Array(sources.length);
  const sourceLogs = new Array(sources.length);
  let cursor = 0;
  async function worker() {
    while (cursor < sources.length) {
      const idx = cursor++;
      const [source, fn] = sources[idx];
      const started = new Date().toISOString();
      try {
        const result = await withTimeout(fn(), SOURCE_TIMEOUT_MS, source);
        const items = Array.isArray(result) ? result : (result.events || []);
        perSource[idx] = items;
        sourceLogs[idx] = {
          source,
          status: 'ok',
          fetchedAt: started,
          count: items.length,
          ...(result && !Array.isArray(result) && result.note ? { note: result.note } : {}),
          ...(result && !Array.isArray(result) && result.diagnostics ? { diagnostics: result.diagnostics } : {})
        };
        console.log(`[OK] ${source}: ${items.length} events${result && !Array.isArray(result) && result.note ? ` — ${result.note}` : ''}`);
      } catch (e) {
        perSource[idx] = [];
        sourceLogs[idx] = { source, status: 'error', fetchedAt: started, error: e.message };
        console.log(`[ERR] ${source}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, sources.length) }, worker));

  const out = perSource.flat();
  return { events: uniqBy(out, e => e.id || `${e.url}|${e.title}`), sourceLogs };
}

async function runFixtureTests() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-corpus/events-fixtures.json'), 'utf8')).fixtures;
  const window = { start: '2026-05-23', endExclusive: '2026-05-25' };
  for (const f of fixtures) {
    const e = normalizeEvent(f.input);
    const reason = rejectionReason(e, window);
    const scored = scoreEvent(e, window);
    if (f.expected.recommendable) assert(!reason && scored.total >= 60, `${f.name} should be recommendable: ${reason} ${scored.total}`);
    else assert(reason || scored.total < 60, `${f.name} should be rejected/low score`);
    if (f.expected.reject_reason) assert(reason, `${f.name} expected a rejection reason`);
    if (f.expected.primary_tags) for (const tag of f.expected.primary_tags) assert(e.tags.includes(tag), `${f.name} missing tag ${tag}; got ${e.tags}`);
    assert(typeof scored.components.ageFitAndy === 'number', `${f.name} missing Andy age component`);
    assert(typeof scored.components.ageFitLennon === 'number', `${f.name} missing Lennon age component`);
    assert(scored.details && scored.reasons && scored.caveats, `${f.name} missing transparent scoring details`);
    if (f.name === 'daisy_cosy_secondary_option') assert.strictEqual(scored.label, 'option secondaire');
    if (f.name === 'age_mismatch_event') assert.strictEqual(reason, 'age_mismatch');
    if (f.name === 'navigation_false_positive') assert(/navigation|non_event|missing_date/.test(reason), `${f.name} wrong rejection reason ${reason}`);
  }
  assert.strictEqual(parseFrenchDate('SAMEDI 23 mai 2026'), '2026-05-23');
  assert.strictEqual(parseFrenchDate('MARDI 05 MAI 2026'), '2026-05-05');
  assert.strictEqual(parseFrenchDate('3 Oct 2026'), '2026-10-03');
  assert.deepStrictEqual(parseInfomaniakDateRange('Du vendredi 22 au samedi 23 mai', 2026), { startDate: '2026-05-22', endDate: '2026-05-23' });
  assert.strictEqual(parseInfomaniakDateRange('Dimanche 24 mai - 13h30', 2026).startDate, '2026-05-24T13:30:00+02:00');
  const agendaProbe = extractAgendaChProfiles('<html><head><title>Coach sportif à Yverdon-les-bains – Séances et disponibilités</title></head><body><a href="/fr/s/sport/yverdon/kalambay-training-sarl-Er757Rvn">Kalambay Training Sàrl</a><p>Prenez rendez-vous en ligne avec un thérapeute ou un coach. Disponibilités et séances.</p></body></html>');
  assert.strictEqual(agendaProbe.profileLinks.length, 1);
  assert(agendaProbe.appointmentSignals >= 2, 'agenda.ch probe should detect appointment-directory signals');
  assert.strictEqual(agendaProbe.eventSignals, false);
  assert.strictEqual(extractLaDeriveeApiToken('Authorization:"Bearer "+String("abc123")'), 'abc123');
  const laDerivee = parseLaDeriveeEvent({ id: 1, date_start: '2026-06-06', date_end: '2026-06-06', title: 'Marché des artisan.ne.s', subtitle: 'Animation', slug: 'marche-des-artisan-ne-s', time_start: '14:00:00.000', teaser: '<p>marché artisanal, stands de nourriture, henné, animations et performances</p>', tags: [{ name: 'Animation' }], partners: [{ title: 'CULMINA' }], buttons: [] });
  assert.strictEqual(laDerivee.source, 'la-derivee');
  assert.strictEqual(laDerivee.startDate, '2026-06-06T14:00:00+02:00');
  assert.strictEqual(laDerivee.city, 'Yverdon-les-Bains');
  assert(laDerivee.tags.includes('outdoor') && laDerivee.priceText.includes('Gratuit'), 'La Dérivée fixture should keep taste/price evidence');
  const yverdonRecurring = parseYverdonDetail('<h1>Marchés d’été ArtYsans Yverdon 2026</h1><div class="jet-listing-dynamic-field__content">9 Mai 2026</div><div class="jet-listing-dynamic-field__content">- 3 Oct 2026</div><div class="elementor-widget-text-editor">Marchés artisanaux</div><div class="elementor-widget-text-editor">De 8h à 13h30. Dates 2026 : – Samedi 9 mai – Samedi 6 juin – Samedi 3 octobre</div><div class="elementor-widget-text-editor">Association ArtYsans Yverdon</div><div class="elementor-widget-text-editor">Centre ville</div><div class="elementor-widget-text-editor">1400</div><div class="elementor-widget-text-editor">Yverdon-les-Bains</div>', 'https://yverdonlesbainsregion.ch/evenement/marches-dete-artysans-yverdon-2026/');
  assert.strictEqual(yverdonRecurring.length, 3);
  assert.strictEqual(yverdonRecurring[1].startDate, '2026-06-06T08:00:00+02:00');
  assert.strictEqual(yverdonRecurring[1].locationText, 'Association ArtYsans Yverdon, Centre ville, 1400, Yverdon-les-Bains');
  const grandsonOccurrences = extractGrandsonCalendarOccurrences('<table class="agenda"><tr><td>Lundi</td><td>Mardi</td></tr><tr><td>8</td><td>9</td></tr><tr class="cal-texte"><td><span class="cal"><a href="/agenda/fete/">&gt; Fête familiale</a></span></td><td class="gris"><a href="/agenda/passe/">&gt; Passé</a></td></tr></table>', 'https://www.grandson.ch/vie-locale/agenda-des-manifestations/?mois=6&annee=2026');
  assert.deepStrictEqual(grandsonOccurrences, [{ title: 'Fête familiale', url: 'https://www.grandson.ch/agenda/fete/', date: '2026-06-08' }]);
  const grandsonEvent = parseGrandsonDetail('<main><div class="container"><div class="content">Fête familiale DIMANCHE 14 JUIN 2026 Jeux et buvette pour enfants Organisation Association Grandson Lieu Salle des Quais Rue Basse Horaires 13h-17h Prix Gratuit Contact info@example.ch Retour</div></div></main>', { title: 'Fête familiale', url: 'https://www.grandson.ch/agenda/fete/', date: '2026-06-15' });
  assert.strictEqual(grandsonEvent.startDate, '2026-06-15T13:00:00+02:00');
  assert.strictEqual(grandsonEvent.priceText, 'Gratuit');
  assert.strictEqual(grandsonEvent.locationName, 'Association Grandson');
  const orbeEvent = parseOrbeEvent({ properties: { id: 32442, title: "T'as où les jeux", starts_at: '2026-06-10T18:30:00+02:00', ends_at: '2026-06-10T23:00:00+02:00', location_details: 'Hessel Espace Culturel, Rue Davall 3, 1350 Orbe', summary: 'Jeux de sociétés à disposition', pricing: '0.-', schedule: 'Dès 18h30', publics: 'Familles', genre_evenement: 'Culture', organizer_name: 'Association Hessel Espace Culturel' } });
  assert.strictEqual(orbeEvent.source, 'orbe');
  assert.strictEqual(orbeEvent.city, 'Orbe');
  assert.strictEqual(orbeEvent.startDate, '2026-06-10T18:30:00+02:00');
  assert.strictEqual(orbeEvent.priceText, '0.-');
  assert.strictEqual(orbeEvent.ageText, 'Familles');
  assert(orbeEvent.url.includes('#/event/32442'), 'Orbe event should keep stable agenda event URL');
  const vallorbeFixtureEntities = JSON.stringify({ data: [{ id: '7564447', name: '<a href="/_rte/anlass/7564447">Séance du Conseil communal</a>', _datumVon: '2026-08-31', _datumBis: '2026-08-31', _ort: 'Vallorbe', lokalitaet: 'Grande salle', organisator: 'Commune' }] }).replace(/"/g, '&quot;');
  const vallorbeRows = extractVallorbeListings(`<table id="anlassList" data-entities="${vallorbeFixtureEntities}"></table>`);
  assert.strictEqual(vallorbeRows.length, 1);
  const vallorbeEvent = parseVallorbeDetail('<main><h1 class="contentTitle">Séance du Conseil communal</h1>31 août 2026, 18h30 - 22h00 Lieu Grande salle, 1er étage du Casino Place du Pont 3 1337 Vallorbe Contact conseil@vallorbe.ch</main>', vallorbeRows[0]);
  assert.strictEqual(vallorbeEvent.source, 'vallorbe');
  assert.strictEqual(vallorbeEvent.startDate, '2026-08-31T18:30:00+02:00');
  assert.strictEqual(vallorbeEvent.city, 'Vallorbe');
  const sainteEntities = JSON.stringify({ data: [{ id: '6986620', name: '<a href="/_rte/anlass/6986620">Cinéma Royal - Journée des Réfugié.es</a>', lokalitaet: 'Cinéma Royal', datumVon: '1781906400000', datumBis: '1781906400000', organisator: 'Cinéma Royal', hauptkategorieId: '<svg class="cms-icon cms-icon-art"></svg>' }] }).replace(/"/g, '&quot;');
  const sainteRows = extractSainteCroixListings(`<table id="anlassList" data-entities="${sainteEntities}"></table>`);
  assert.strictEqual(sainteRows.length, 1);
  assert.strictEqual(sainteRows[0].startDate, '2026-06-20');
  const sainteEvent = parseSainteCroixDetail('<main><h1>Cinéma Royal - Journée des Réfugié.es</h1>Cinéma Royal Av. de la Gare 2 1450 Sainte-Croix 20 juin 2026, 16h00 animations en entrée libre, danses, chants, exposition et plats traditionnels.</main>', sainteRows[0]);
  assert.strictEqual(sainteEvent.source, 'sainteCroix');
  assert.strictEqual(sainteEvent.city, 'Sainte-Croix');
  assert.strictEqual(sainteEvent.startDate, '2026-06-20T16:00:00+02:00');
  assert(sainteEvent.priceText.match(/entrée libre/i), 'Sainte-Croix fixture should keep free-entry evidence');
  const emoiEvent = parseEmoiEvent({ properties: { id: 30501, title: 'Sur les traces du trésor du Duc, parcours libre et concours', starts_at: '2026-06-01T00:00:00+02:00', ends_at: '2026-06-30T23:59:00+02:00', location_details: 'Grandson, 1422', summary: 'Parcours libre en famille dans le bourg.', pricing: 'Offert par la Commune', publics: ['Tous publics'], genre_evenement: ['Evénement'], website: 'https://www.grandson.ch/agenda/grandson-morat-2026-parcours-libre-concours/' } });
  assert.strictEqual(emoiEvent.source, 'emoi');
  assert.strictEqual(emoiEvent.city, 'Grandson');
  assert(/tout public|famille/i.test(emoiEvent.ageText));

  const tempsLibreListings = extractTempsLibreListings('<a class="container-link" href="/vaud/manifestations/449853-dans-la-peau-des-mangakas" title="Dans la peau des mangakas"><article><div class="exergue date"><div class="dark"><span class="day">14</span><span class="month-year">juin 2026</span></div></div><p class="categories"><strong>Ateliers</strong></p><h3>Dans la peau des mangakas</h3><p class="teaser">Atelier créatif manga</p><p class="place"><strong>Musée romain de Lausanne-Vidy</strong>, Lausanne</p><ul class="tagInfos"><li class="free">Gratuit</li></ul></article></a>', SOURCES.tempsLibre.url);
  assert.strictEqual(tempsLibreListings.length, 1);
  const tempsLibreEvent = parseTempsLibreDetail('<head><link rel="canonical" href="https://www.tempslibre.ch/vaud/manifestations/449853-dans-la-peau-des-mangakas"><script>window.dataLayer = window.dataLayer || []; window.dataLayer.push({"pageSection":"manifestations","pageCategories":["Manifestations","Ateliers"],"city":"Lausanne","canton":"vaud","public":["6 à 12 ans","Adolescents"]});</script><script type="application/ld+json">{"@context":"http://schema.org","@type":"Event","name":"Dans la peau des mangakas","description":"Atelier manga pour enfants","startDate":"2026-06-14 15:00","endDate":"2026-06-14 16:00","url":"https://www.tempslibre.ch/vaud/manifestations/449853-dans-la-peau-des-mangakas","location":{"@type":"Place","name":"Musée romain de Lausanne-Vidy","address":"Ch. du Bois-de-Vaux 24, Lausanne, CH"}}</script></head><main><h1>Dans la peau des mangakas</h1><p>Gratuit, réservation conseillée.</p></main>', tempsLibreListings[0]);
  assert.strictEqual(tempsLibreEvent.source, 'tempsLibre');
  assert.strictEqual(tempsLibreEvent.startDate, '2026-06-14T15:00:00+02:00');
  assert.strictEqual(tempsLibreEvent.city, 'Lausanne');
  assert(tempsLibreEvent.priceText.includes('Gratuit'), 'TempsLibre fixture should keep free evidence');
  const theatreRows = extractTheatreDuPassageFamilyListings('<main><p><input aria-label="Tu comprendras quand tu seras grand" type="checkbox" name="evenements_dates_id[]" value="355"> Tu comprendras quand tu seras grand - 25 octobre 2026 - 11:00</p></main>');
  assert.strictEqual(theatreRows.length, 1);
  assert.strictEqual(theatreRows[0].startDate, '2026-10-25T11:00:00+01:00');
  const theatreEvent = parseTheatreDuPassageDetail('<body>Tarif plein35.-Tarif réduit25.-Tarif enfant10.- Théâtre d’ombres Tu comprendras quand tu seras grand Date DI 25 OCT 2026 11:00, 17:00 Durée 50 min Âge Dès 6 ans Lieu Grande salle Par le Théâtre des Marionnettes de Genève Une aventure drôle et tendre.</body>', { ...theatreRows[0], url: 'https://www.theatredupassage.ch/programme/detail/162-tu-comprendras-quand-tu-seras-grand' });
  assert.strictEqual(theatreEvent.source, 'theatreDuPassage');
  assert.strictEqual(theatreEvent.city, 'Neuchâtel');
  assert.strictEqual(theatreEvent.ageText, 'Dès 6 ans');
  assert(theatreEvent.priceText.includes('Tarif enfant'), 'Théâtre du Passage fixture should keep price evidence');
  const bennoEvents = extractTheatreBennoBessonListings('<main><div id="comp-mbunoa8k__item1"><p id="comp-mbunoa8p2__item1">ME 11 NOVEMBRE</p><h2 id="comp-mbunoa8s__item1"><a href="https://www.theatrebennobesson.ch/programme-25-26/pistache">Cosimo</a></h2><p id="comp-mbunp8b8__item1">Cie L’Oiseau à Ressort</p><p id="comp-mbunoa8t2__item1">THÉÂTRE / DÈS 7 ANS</p><p id="comp-mbunqfsw__item1">Les élèves de 9-10S d’Yverdon-les-Bains verront ce spectacle avec l’école</p><div id="comp-mbuo7ime1__item1"><a href="https://www.theatrebennobesson.ch/programme-26-27/cosimo">Read All</a></div></div><div id="comp-mbyu0lxn__item2"><p id="comp-mbyu0lyi__item2">THÉÂTRE</p><h2 id="comp-mbyu0lyy__item2">La Tente</h2><p id="comp-mbyu0lz3__item2">Les filles d’Artémis</p><p id="comp-mbyu0lz52__item2">Sa 31 octobre 2026 dès 5 ans</p></div></main>');
  assert.strictEqual(bennoEvents.length, 2);
  assert.strictEqual(bennoEvents[0].startDate, '2026-11-11');
  assert.strictEqual(bennoEvents[0].ageText, 'DÈS 7 ANS');
  assert(bennoEvents[1].url.includes('#tente'), 'Benno fixture should create stable fragment URLs for unlinked cards');
  const echandoleListings = extractEchandoleListings('<section class="event-item"><a href="https://echandole.ch/spectacles/lidole-des-petites-houles/"><div class="date"><span>dim 05.10.25</span></div><h2>L’idole des petites houles</h2><div class="infos category">Comme un poisson dans l\'eau</div><div class="infos">Dès 3 ans</div></a></section>', SOURCES.echandole.url);
  assert.strictEqual(echandoleListings.length, 1);
  const echandoleEvents = parseEchandoleDetail('<main class="single-event"><h1>L’idole des petites houles</h1><p>La toute petite compagnie</p><div class="date full-event">dim 05.10.25 11:00</div><div class="date">dim 05.10.25 14:00</div><div class="infos category">Comme un poisson dans l\'eau</div><div class="infos">Dès 3 ans</div><div class="infos time">40 min</div><div class="infos">Tarif unique 15.- | CarteCulture 10.- | Passculture 5.-</div><p class="wp-block-paragraph">Campés sur leur navire de théâtre, trois marins racontent la vie d’un petit poisson.</p></main>', echandoleListings[0]);
  assert.strictEqual(echandoleEvents.length, 2);
  assert.strictEqual(echandoleEvents[0].source, 'echandole');
  assert.strictEqual(echandoleEvents[0].startDate, '2025-10-05T11:00:00+02:00');
  assert.strictEqual(echandoleEvents[0].city, 'Yverdon-les-Bains');
  assert.strictEqual(echandoleEvents[0].ageMin, 3);
  assert(echandoleEvents[0].priceText.includes('15.-'), 'Échandole fixture should keep tariff evidence');
  const leProgrammeListings = extractLeProgrammeVaudListings('<a href="https://vd.leprogramme.ch/concerts/concerts-bebe-ensemble-les-variations-musicales-14/lausanne/cpo//spectacle-enfants/" class="card card-spectacle card-horizontal has-description theme-music"><div class="card-body"><h5 class="card-title">Concerts Bébé | Ensemble Les Variations Musicales</h5><p class="card-text">Le 22 Juin 2026 à 09:30 et 10:30<br>CPO, Lausanne</p><p class="card-description">Tout public. Les Concerts Bébé ont été pensés pour les tout petits et leurs parents.</p><ul class="card-tags"><li>Musique classique</li></ul></div></a>', SOURCES.leProgrammeVaudKids.url);
  assert.strictEqual(leProgrammeListings.length, 1);
  assert.strictEqual(leProgrammeListings[0].occurrences.length, 2);
  const leProgrammeEvents = parseLeProgrammeVaudDetail('<body><h1>Concerts Bébé | Ensemble Les Variations Musicales</h1>Enfant et famille Musique classique Infos pratiques CPO, Lausanne Durée : 30 minutes 10 CHF Dates & horaires Le 22 Juin 2026 à 09:30 et 10:30 Infos pratiques CPO, Lausanne Durée : 30 minutes 10 CHF Lieu de l’événement CPO Ch. de Beau-Rivage 2 1006 Lausanne Contact cpo.ch Les Concerts Bébé ont été pensés pour les tout petits et leurs parents.</body>', leProgrammeListings[0]);
  assert.strictEqual(leProgrammeEvents.length, 2);
  assert.strictEqual(leProgrammeEvents[0].source, 'leProgrammeVaudKids');
  assert.strictEqual(leProgrammeEvents[0].startDate, '2026-06-22T09:30:00+02:00');
  assert.strictEqual(leProgrammeEvents[1].startDate, '2026-06-22T10:30:00+02:00');
  assert.strictEqual(leProgrammeEvents[0].city, 'Lausanne');
  assert(leProgrammeEvents[0].priceText.includes('10 CHF'), 'leprogramme.ch fixture should keep tariff evidence');
  const etListings = extractEchallensTourismeListings('<article class="wpgb-card wpgb-card-3 wpgb-post-2510"><div class="wpgb-block-3 date_event">27 mai au 26 juin 2026</div><div class="wpgb-block-2 lieu_event"><span>Echallens</span></div><h3><a href="https://echallens-tourisme.ch/evenement/la-halte-estivale/">La Halte Estivale</a></h3></article>', SOURCES.echallensTourisme.url);
  assert.strictEqual(etListings.length, 1);
  assert.strictEqual(etListings[0].startDate, '2026-05-27');
  assert.strictEqual(etListings[0].endDate, '2026-06-26');
  const etEvent = parseEchallensTourismeDetail('<body class="public-cible-tout-public public-cible-famille type-devenement-fete-et-festival"><div class="event-details details"><h2>La Halte Estivale</h2><h4>27 mai au 26 juin 2026</h4><div class="description"><p>Concerts, animations et stands gourmands.</p></div><div class="contact-infos"><p>Place de la Gare, 1040 Echallens</p></div><div class="cta-evenements"><a href="https://www.echallens.ch/vivre-a-echallens/manifestations/halte-estivale.html">Site web</a></div></div></body>', etListings[0]);
  assert.strictEqual(etEvent.source, 'echallensTourisme');
  assert.strictEqual(etEvent.city, 'Echallens');
  assert(/famille/.test(etEvent.ageText), 'Echallens Tourisme fixture should preserve family/public evidence');
  assert(etEvent.officialSources.some(u => /echallens\.ch/.test(u)), 'Echallens Tourisme fixture should preserve official website link');

  const neuchatelListings = extractNeuchatelVilleListings('<div class="tx-culturoscope"><div class="event event-detailed"><div class="title"><a href="/sortir-et-decouvrir/agenda/detail/la-fonzie-family-52076/38760">La Fonzie Family</a></div><div class="description">Concert gratuit au bord du lac</div><input class="period-timestamp" value="1782403200"><input class="period-uid" value="38760"><input class="event-uid" value="9000"></div></div>', SOURCES.neuchatelVille.url);
  assert.strictEqual(neuchatelListings.length, 1);
  assert.strictEqual(parseNeuchatelVilleDetail('<div class="event-detail"><h1>La Fonzie Family</h1><header><div class="dates">25 juin 2026 18:00 | Kiosk Art</div><div class="description">Concert gratuit.</div></header><div class="complementary-information"><div class="info"><span>le:&nbsp;</span><span>25.06.2026 à 18:00</span></div><div class="info">Kiosk Art</div><div class="info">Quai Ph.Godet 5 2000 Neuchâtel</div></div></div>', neuchatelListings[0]).startDate, '2026-06-25T18:00:00+02:00');
  const lePommierListings = extractLePommierListings('<div class="eventv2-grid"><a href="https://lepommier.ch/event/981-puisque-cest-comme-ca-je-vais-faire-un-opera-toute-seule" class="grid-item" data-date="1800144000"><div class="content" title="Puisque c’est comme ça je vais faire un opéra toute seule"><div class="date">Le 17 Jan.</div><div class="type">Théâtre</div></div></a></div>', SOURCES.lePommier.url);
  assert.strictEqual(lePommierListings.length, 1);
  const lePommierEvents = parseLePommierDetail('<main><h1>Puisque c’est comme ça je vais faire un opéra toute seule</h1><p>Informations Auteur / Autrice Claire Diterzi Genre Théâtre Type d\'événement Jeune public Age conseillé Dès 5 ans Durée 45 minutes Made in France Lieu Le Pommier Rue du Pommier 9 2000 Neuchâtel Billetterie Opéra Mode d’emploi (pour toute la famille) Les horaires et tarifs Dimanche 17 janvier 2027 à 10 h 30 Dimanche 17 janvier 2027 à 16 h 00 Jeune public Tarif unique : 15 CHF Abonnement de saison, découverte et jeune public : gratuit Distribution</p></main>', lePommierListings[0]);
  assert.strictEqual(lePommierEvents.length, 2);
  assert.strictEqual(lePommierEvents[0].source, 'lePommier');
  assert.strictEqual(lePommierEvents[0].startDate, '2027-01-17T10:30:00+02:00');
  assert.strictEqual(lePommierEvents[0].ageMin, 5);
  assert(lePommierEvents[0].priceText.includes('15 CHF'), 'Le Pommier fixture should keep tariff evidence');
  assert.strictEqual(avenchesDateToIso('2026/07/02'), '2026-07-02');
  const avenchesEvent = parseAvenchesEvent({ id: 4537530, title: "Marché d'été au Camping Plage Avenches", description: "Le Camping-Plage d'Avenches accueille tout l'été les étals des maraîchers et artisans de la région", url: '/fr/P119111/marche-d-ete-au-camping-plage-avenches', location: 'Avenches', categories: [{ label: 'Marché', value: 'c-159' }], types: [{ label: 'Manifestations', value: 'pc-18' }], dates: { start: '2026/07/02', end: '2026/08/15' } });
  assert.strictEqual(avenchesEvent.source, 'avenches');
  assert.strictEqual(avenchesEvent.startDate, '2026-07-02');
  assert.strictEqual(avenchesEvent.endDate, '2026-08-15');
  assert.strictEqual(avenchesEvent.city, 'Avenches');
  assert.strictEqual(avenchesEvent.url, 'https://www.avenches.ch/fr/P119111/marche-d-ete-au-camping-plage-avenches');
  assert(avenchesEvent.tags.includes('food'), 'Avenches marché fixture should infer a food/terroir tag');
  assert(avenchesEvent.officialSources.some(u => /avenches\.ch\/fr\/P119111/.test(u)), 'Avenches fixture should keep the official detail URL');
  const avenchesSingleDay = parseAvenchesEvent({ title: 'SUP Suisse Flatwater Championship 2026', description: 'Compétition', url: '/fr/P187973/sup', location: 'Morat', categories: [{ label: 'Sport', value: 'c-342' }], types: [], dates: { start: '2026/06/27', end: '2026/06/27' } });
  assert.strictEqual(avenchesSingleDay.endDate, null, 'Avenches single-day event should not duplicate start as endDate');
  assert.strictEqual(avenchesSingleDay.city, 'Morat');
  // Vallée de Joux Tourisme (same MyCity JSON shape, Lac de Joux / Jura vaudois).
  const vdjEvent = parseValleeDeJouxEvent({ id: 9552965, title: "Repas à thème à l'alpage des Amburnex", description: 'Vente directe et petite restauration', url: '/fr/P225083/repas-a-theme-a-l-alpage-des-amburnex', location: 'Le Brassus', categories: [{ label: 'Gastronomie & vin', value: 'c-15' }], dates: { start: '2026/08/13' } });
  assert.strictEqual(vdjEvent.source, 'valleeDeJoux');
  assert.strictEqual(vdjEvent.startDate, '2026-08-13');
  assert.strictEqual(vdjEvent.endDate, null, 'Vallée de Joux single-day event should not duplicate start as endDate');
  assert.strictEqual(vdjEvent.city, 'Le Brassus');
  assert.strictEqual(vdjEvent.url, 'https://www.myvalleedejoux.ch/fr/P225083/repas-a-theme-a-l-alpage-des-amburnex');
  assert.strictEqual(estimateDistanceKm(vdjEvent), 48, 'Le Brassus should resolve to its Vallée de Joux distance');
  const vdjRange = parseValleeDeJouxEvent({ title: 'Hockeyades Vallée de Joux', description: 'Tournoi', url: '/fr/P14673/hockeyades', location: 'Le Sentier', categories: [{ label: 'Sport', value: 'c-167' }], dates: { start: '2026/08/12', end: '2026/08/14' } });
  assert.strictEqual(vdjRange.endDate, '2026-08-14', 'Vallée de Joux multi-day event should keep endDate');
  assert.strictEqual(estimateDistanceKm(parseValleeDeJouxEvent({ title: 'x', url: '/fr/P1/x', location: 'Le Lieu', dates: { start: '2026/09/01' } })), 40, 'Le Lieu distance should be registered');
  // FribourgRégion / Terroir Fribourg (Broye + Lac de Morat WP REST source).
  assert.deepStrictEqual(parseFribourgHoraire('Du 10 au 26 juil. 2026'), { startDate: '2026-07-10', endDate: '2026-07-26' });
  assert.deepStrictEqual(parseFribourgHoraire('Du 8 juin au 16 août 2026'), { startDate: '2026-06-08', endDate: '2026-08-16' });
  assert.deepStrictEqual(parseFribourgHoraire('29 août 2026'), { startDate: '2026-08-29', endDate: null });
  assert.strictEqual(fribourgCity('Rendez-vous au 1585 Salavaux pour la course.', 'Région Lac de Morat'), 'Salavaux');
  assert.strictEqual(fribourgCity('Aucune adresse ici.', 'Région Lac de Morat (Morat / Vully)'), 'Région Lac de Morat (Morat / Vully)');
  const fribourgHtml = '<h1>VullyRun</h1>'
    + '<div id="description">La VullyRun, course emblématique du Vully entre villages et vignes, à 1585 Salavaux.</div>'
    + '<div id="horaires"><figure class="horaires"><div><h5>29 août 2026</h5><div><p>Samedi</p><p>15:45 - 22:00</p></div></div></figure></div>'
    + '<div id="tarifs">Prix Entrée 30.- CHF</div>'
    + '<div id="liens"><a href="https://www.vullyrun.ch/">Website</a></div>';
  const fribourgEvents = parseFribourgDetail(fribourgHtml, { link: 'https://fribourg.ch/fr/regionlacdemorat/evenements/vullyrun/', title: { rendered: 'VullyRun' }, region: [194] }, { regionLabel: 'Région Lac de Morat (Morat / Vully)' });
  assert.strictEqual(fribourgEvents.length, 1);
  assert.strictEqual(fribourgEvents[0].source, 'fribourgTerroir');
  assert.strictEqual(fribourgEvents[0].startDate, '2026-08-29T15:45:00+02:00');
  assert.strictEqual(fribourgEvents[0].city, 'Salavaux');
  assert(fribourgEvents[0].priceText.includes('30'), 'Fribourg fixture should keep tariff evidence');
  assert.strictEqual(fribourgEvents[0].url, 'https://fribourg.ch/fr/regionlacdemorat/evenements/vullyrun/');
  assert(fribourgEvents[0].officialSources.some(u => /vullyrun\.ch/.test(u)), 'Fribourg fixture should keep the external official website');
  assert(fribourgEvents[0].tags.includes('sport'), 'Fribourg fixture should infer a sport tag from "course"');
  // Payerne (Broye) communal manifestations — positional French date parsing.
  assert.deepStrictEqual(parsePayerneDateSentence('a lieu le samedi 30 mai 2026.'), { startDate: '2026-05-30', endDate: null });
  assert.deepStrictEqual(parsePayerneDateSentence('ont lieu du vendredi 5 au dimanche 7 juin 2026.'), { startDate: '2026-06-05', endDate: '2026-06-07' });
  assert.deepStrictEqual(parsePayerneDateSentence('a lieu le vendredi 31 juillet et samedi 1 er août 2026.'), { startDate: '2026-07-31', endDate: '2026-08-01' });
  assert.deepStrictEqual(parsePayerneDateSentence('a lieu du vendredi 30 octobre 2026 au dimanche 21 février 2027.'), { startDate: '2026-10-30', endDate: '2027-02-21' });
  const payerneHtml = '<div class="card"><div class="card-header" id="heading-1-3">'
    + '<div class="row align-items-center"><div class="col">5 au 7 juin - Caves ouvertes</div></div></div>'
    + '<div id="collapse1-3" class="collapse"><div class="card-body the-content">'
    + '<p>Les caves ouvertes ont lieu du vendredi 5 au dimanche 7 juin 2026.</p>'
    + '<ul><li>Emplacement : Cave L&rsquo;Abbatiale, Payerne</li><li>Horaires : Vendredi 17 h 00 – 21 h 00</li></ul>'
    + '<p>Informations :<a href="https://www.cave-abbatiale.ch/" target="_blank" rel="external">Cave L\'Abbatiale</a></p>'
    + '</div></div></div>';
  const payerneCards = extractPayerneCards(payerneHtml, SOURCES.payerne.url);
  assert.strictEqual(payerneCards.length, 1);
  assert.strictEqual(payerneCards[0].title, 'Caves ouvertes');
  assert.strictEqual(payerneCards[0].startDate, '2026-06-05');
  assert.strictEqual(payerneCards[0].endDate, '2026-06-07');
  assert.strictEqual(payerneCards[0].url, 'https://www.payerne.ch/manifestations/#heading-1-3');
  assert(payerneCards[0].officialSources.some(u => /cave-abbatiale\.ch/.test(u)), 'Payerne fixture should keep the external official info link');
  const payerneEvent = normalizeEvent({ source: 'payerne', title: payerneCards[0].title, startDate: isoDate(payerneCards[0].startDate, payerneCards[0].horaire), endDate: payerneCards[0].endDate, locationName: payerneCards[0].emplacement, city: cityFromLocation(payerneCards[0].emplacement, 'Payerne'), url: payerneCards[0].url, description: payerneCards[0].description });
  assert.strictEqual(payerneEvent.startDate, '2026-06-05T17:00:00+02:00');
  assert.strictEqual(payerneEvent.city, 'Payerne');
  // --- Vully-les-Lacs listing parsing ---
  assert.deepStrictEqual(parseVullyListingDate('4', 'juil.'), { startDay: '04', startMonth: '07', endDay: null, endMonth: '07' });
  assert.deepStrictEqual(parseVullyListingDate('14-16', 'août'), { startDay: '14', startMonth: '08', endDay: '16', endMonth: '08' });
  assert.strictEqual(parseVullyListingDate('21.9.', '2024'), null, 'Vully past-format cell (year) should be skipped');
  const vullyHtml = '<div class="card"><div class="card-body no-padding-bottom">'
    + '<div class="media"><p class="media-date align-self-start mr-3"><span>1-31</span>janv.-déc.</p><div class="media-body mb-2"><h6 class="media-title">Annoncez votre manifestation !</h6><div>En cliquant sur le lien suivant...</div></div></div>'
    + '<div class="media"><p class="media-date align-self-start mr-3"><span>4</span>juil.</p><div class="media-body mb-2"><h6 class="media-title">Cinéma Open Air</h6><div>Cinéma Open Air à la place de jeux de Vallamand, Route de Cudrefin. Petite restauration sur place. 19h00 - 00h00</div><div class="d-flex align-items-baseline"><i class="icon"></i> <a href="https://www.vully-les-lacs.ch/uploads/flyer.pdf">Flyer openair</a></div></div></div>'
    + '<div class="media"><p class="media-date align-self-start mr-3"><span>14-16</span>août</p><div class="media-body mb-2"><h6 class="media-title">Tir annuel</h6><div>à Chabrey, Les Blaireaux</div></div></div>'
    + '<div class="media"><p class="media-date align-self-start mr-3"><span>27.6.</span>2026</p><div class="media-body mb-2"><h6 class="media-title">Route Gourmande du Vully</h6><div>événement passé</div></div></div>'
    + '</div></div>';
  const vullyExtract = extractVullyListings(vullyHtml, SOURCES.vullyLesLacs.url);
  assert.strictEqual(vullyExtract.items.length, 2, 'Vully should skip the placeholder and stop at the past-format card');
  assert.strictEqual(vullyExtract.reachedPast, true, 'Vully should flag when the past section is reached');
  assert.strictEqual(vullyExtract.items[0].title, 'Cinéma Open Air');
  assert(vullyExtract.items[0].links.some(u => /flyer\.pdf/.test(u)), 'Vully should keep the card flyer/info link');
  const vullyDated = assignVullyYears(vullyExtract.items, new Date('2026-07-01T07:00:00Z'));
  assert.strictEqual(vullyDated[0].startDate, '2026-07-04');
  assert.strictEqual(vullyDated[1].startDate, '2026-08-14');
  assert.strictEqual(vullyDated[1].endDate, '2026-08-16');
  const vullyWrap = assignVullyYears([
    { startDay: '13', startMonth: '12', endDay: null, endMonth: '12' },
    { startDay: '10', startMonth: '01', endDay: null, endMonth: '01' }
  ], new Date('2026-07-01T07:00:00Z'));
  assert.strictEqual(vullyWrap[0].startDate, '2026-12-13');
  assert.strictEqual(vullyWrap[1].startDate, '2027-01-10', 'Vully should roll the year forward when the month wraps backwards');
  const vullyEvent = normalizeEvent({ source: 'vullyLesLacs', title: vullyExtract.items[0].title, startDate: isoDate(vullyDated[0].startDate, vullyExtract.items[0].description), endDate: null, locationName: 'Vallamand', locationText: 'Vallamand, Vully-les-Lacs', city: 'Vully-les-Lacs', url: `${SOURCES.vullyLesLacs.url}#${sha('x')}`, description: vullyExtract.items[0].description });
  assert.strictEqual(vullyEvent.startDate, '2026-07-04T19:00:00+02:00', 'Vully should extract the start time from the description');
  assert.strictEqual(vullyEvent.city, 'Vully-les-Lacs');
  const murtenEntities = JSON.stringify({ data: [
    { id: '5464640', name: '<a href="/_rte/anlass/5464640">Spielfest</a>', ort: 'Murten', lokalitaet: 'Alte Turnhalle', datumVon: '1794697200000', datumBis: '1794697200000', organisator: 'Kulturkommission &amp; Ludothek' },
    { id: '6515389', name: '<a href="/_rte/anlass/6515389">Open Air Kino</a>', ort: 'Murten', lokalitaet: 'Stadtgraben', datumVon: '1783290000000', datumBis: '1786402800000', organisator: 'https://openair-kino.ch' }
  ] }).replace(/"/g, '&quot;');
  const murtenRows = extractMurtenListings(`<table id="anlassList" data-entities="${murtenEntities}"></table>`);
  assert.strictEqual(murtenRows.length, 2, 'Murten should parse both anlassList rows');
  assert.strictEqual(murtenRows[0].title, 'Spielfest');
  assert.strictEqual(murtenRows[0].startDate, '2026-11-15');
  assert.strictEqual(murtenRows[0].endDate, null, 'Murten single-day event should collapse end date to null');
  assert(murtenRows[0].url.endsWith('/_rte/anlass/5464640'), 'Murten should use the stable detail URL');
  assert.strictEqual(murtenRows[1].endDate, '2026-08-11', 'Murten multi-day range should keep the end date');
  assert.strictEqual(murtenRows[1].organizerUrl, 'https://openair-kino.ch', 'Murten should capture a URL organisateur as officialSource');
  const murtenTime = parseMurtenDetailTime('15. Nov. 2026, 13.00 Uhr - 17.00 Uhr');
  assert.strictEqual(murtenTime.startTime, '13:00');
  assert.strictEqual(murtenTime.endTime, '17:00');
  const murtenEvent = parseMurtenDetail('<main><h1>Spielfest</h1><p>Alte Turnhalle Prehlstrasse 1 3280 Murten 15. Nov. 2026, 13.00 Uhr - 17.00 Uhr Am Sonntag organisiert die Kulturkommission einen Spielnachmittag für alle Familien aus der Region. Eintritt frei.</p></main>', murtenRows[0]);
  assert.strictEqual(murtenEvent.source, 'murtenMorat');
  assert.strictEqual(murtenEvent.startDate, '2026-11-15T13:00:00+01:00', 'Murten should apply the detail start time to the listing date');
  assert.strictEqual(murtenEvent.city, 'Murten');
  assert(murtenEvent.priceText.match(/frei/i), 'Murten fixture should capture free-entry evidence');
  assert(murtenEvent.officialSources.some(u => /_rte\/anlass\/5464640/.test(u)), 'Murten should keep the official detail URL');
  // --- Chavornay (agenda communal I-Web, Nord vaudois) ----------------------
  const chavornayEntities = JSON.stringify({ data: [
    { id: '7478179', name: '<a href="/_rte/anlass/7478179">Programme activités été 2026 EJED</a>', ort: 'Chavornay', lokalitaet: '', datumVon: '1782856800000', datumBis: '1787522400000', organisator: 'EJED' },
    { id: '7575190', name: '<a href="/_rte/anlass/7575190">Course annuelle pour les retraités 2026</a>', ort: 'Essert-Pittet', lokalitaet: 'Salle Essert-Pittet', datumVon: '1788472800000', datumBis: '1788472800000', organisator: 'Commune' },
    { id: '7577533', name: '<a href="/_rte/anlass/7577533">Votation fédérale et cantonale</a>', ort: 'Chavornay', lokalitaet: 'Bureau de vote', datumVon: '1790460000000', datumBis: '1790460000000', organisator: 'Commune' }
  ] }).replace(/"/g, '&quot;');
  const chavornayRows = extractChavornayListings(`<table id="anlassList" data-entities="${chavornayEntities}"></table>`);
  assert.strictEqual(chavornayRows.length, 3, 'Chavornay should parse all anlassList rows');
  assert.strictEqual(chavornayRows[0].title, 'Programme activités été 2026 EJED');
  assert(chavornayRows[0].endDate && chavornayRows[0].endDate !== chavornayRows[0].startDate, 'Chavornay multi-day range should keep the end date');
  assert(chavornayRows[0].url.endsWith('/anlaesseaktuelles/7478179'), 'Chavornay should use the canonical detail URL, not /_rte');
  assert.strictEqual(chavornayRows[1].city, 'Essert-Pittet', 'Chavornay should read the per-event ort as city');
  assert.strictEqual(chavornayRows[1].endDate, null, 'Chavornay single-day event should collapse end date to null');
  // Detail time extractor: a cued event time is captured, incidental hours ignored.
  assert.strictEqual(parseChavornayDetailTime('Le marché ouvre dès 9h00 sur la Grand-Rue'), '09:00', 'Chavornay should read a cued start time');
  assert.strictEqual(parseChavornayDetailTime('Le bureau est ouvert de 10 h 00 le dimanche'), '', 'Chavornay should not treat "de 10 h" as an event start time');
  const chavornayCivic = parseChavornayDetail('<main>Accueil Actualités Événements Votation fédérale et cantonale Chavornay 1 mars 2026 Contact Commune Il est ouvert de 10 h 00 à 11 h 00 le dimanche. Objets associés Documents</main>', chavornayRows[2]);
  assert.strictEqual(chavornayCivic.source, 'chavornay');
  assert.strictEqual(chavornayCivic.startDate, chavornayRows[2].startDate, 'Chavornay civic event keeps a date-level start (polling hours are not an event time)');
  assert.strictEqual(chavornayCivic.city, 'Chavornay');
  assert.strictEqual(estimateDistanceKm(chavornayCivic), 13, 'Chavornay should resolve to 13 km from Yverdon');
  const chavornayFete = parseChavornayDetail('<main>Accueil Événements Fête au village Chavornay 12 sept. 2026 Contact Commune La fête démarre dès 17h30 avec animations pour les enfants et les familles. Entrée libre. Objets associés</main>', { id: '999', title: 'Fête au village', url: 'https://www.chavornay.ch/anlaesseaktuelles/999', startDate: '2026-09-12', endDate: null, locationText: 'Chavornay', city: 'Chavornay', organizer: 'Commune' });
  assert.strictEqual(chavornayFete.startDate, '2026-09-12T17:30:00+02:00', 'Chavornay single-day fête should apply the cued DST-aware start time');
  assert(/libre/i.test(chavornayFete.priceText), 'Chavornay should capture free-entry evidence');
  assert(chavornayFete.ageText, 'Chavornay family-flavoured event should carry an age/public hint');
  // --- La Sauge (Centre-Nature BirdLife, Cudrefin) --------------------------
  assert.deepStrictEqual(
    (({ startDay, startMonth, endDay, endMonth, startTime, endTime }) => ({ startDay, startMonth, endDay, endMonth, startTime, endTime }))(parseLaSaugeDateLine('Samedi 4 juillet, 13h – 15h')),
    { startDay: '04', startMonth: '07', endDay: null, endMonth: '07', startTime: '13:00', endTime: '15:00' },
    'La Sauge single-day date line'
  );
  assert.deepStrictEqual(
    (({ startDay, startMonth, endDay, endMonth, startTime, endTime }) => ({ startDay, startMonth, endDay, endMonth, startTime, endTime }))(parseLaSaugeDateLine('Lundi 13 juillet au vendredi 17 juillet, 8h30 – 17h')),
    { startDay: '13', startMonth: '07', endDay: '17', endMonth: '07', startTime: '08:30', endTime: '17:00' },
    'La Sauge multi-day range with half-hour start'
  );
  assert.strictEqual(parseLaSaugeDateLine('Samedi 1er août, 20h – 22h30').startDay, '01', 'La Sauge should normalise "1er" to day 01');
  const laSaugeListings = extractLaSaugeListings(
    '<div class="node__content"><p>Ci-dessous le programme annuel 2026 en téléchargement.</p>'
    + '<div class="collapse" id="juillet"><hr>'
    + '<h4>Samedi 4 juillet, 13h &ndash; 15h</h4>'
    + '<p><strong>&Ccedil;a grouille dans la mare !</strong></p>'
    + '<p>Observation de la petite faune aquatique &agrave; l&rsquo;aide de loupes.</p>'
    + '<p><i><a href="https://www.birdlife.ch/fr/content/la-sauge-rendez-vous-nature">Pour en savoir plus</a>. Sans inscription, arriv&eacute;e libre. <a href="https://www.birdlife.ch/fr/content/la-sauge-horaires-et-tarifs">Prix : Entr&eacute;e au centre</a></i></p>'
    + '<hr><h4>Lundi 13 juillet au vendredi 17 juillet, 8h30 &ndash; 17h</h4>'
    + '<p><strong>Camp non r&eacute;sidentiel pour enfants</strong></p>'
    + '<p>Une semaine d&rsquo;activit&eacute;s immersives.</p>'
    + '<p><i><a href="https://www.birdlife.ch/fr/content/la-sauge-camps">Pour en savoir plus</a>. Sur inscription</i></p>'
    + '</div></div>'
  );
  assert.strictEqual(laSaugeListings.length, 2, 'La Sauge should extract both events');
  assert.strictEqual(laSaugeListings[0].title, 'Ça grouille dans la mare !');
  assert.strictEqual(laSaugeListings[0].baseYear, 2026, 'La Sauge should read the annual base year from the page');
  const laSaugeDated = assignLaSaugeYears(laSaugeListings);
  assert.strictEqual(laSaugeDated[0].startDate, '2026-07-04');
  assert.strictEqual(laSaugeDated[1].startDate, '2026-07-13');
  assert.strictEqual(laSaugeDated[1].endDate, '2026-07-17', 'La Sauge camp should keep the multi-day end date');
  const laSaugeEvent = normalizeEvent({
    source: 'laSauge', title: laSaugeListings[0].title, startDate: isoDateZurich(laSaugeDated[0].startDate, laSaugeListings[0].startTime), endDate: null,
    locationName: 'Centre-Nature BirdLife de La Sauge', locationText: 'Centre-Nature BirdLife de La Sauge, La Sauge, Cudrefin', city: 'Cudrefin',
    url: `${SOURCES.laSauge.url}#${sha('x')}`, description: laSaugeListings[0].description, ageText: 'tout public / famille',
    priceText: 'Entrée au centre (voir horaires et tarifs)',
    officialSources: [SOURCES.laSauge.url, 'https://www.birdlife.ch/fr/content/la-sauge-rendez-vous-nature']
  });
  assert.strictEqual(laSaugeEvent.startDate, '2026-07-04T13:00:00+02:00', 'La Sauge should apply the DST-aware start time');
  assert.strictEqual(laSaugeEvent.city, 'Cudrefin');
  assert(laSaugeEvent.tags.includes('nature'), 'La Sauge event should be tagged nature');
  // --- Parc naturel régional Jura vaudois -----------------------------------
  assert.deepStrictEqual(parseParcJuraVaudoisDate('10.07'), { startDay: '10', startMonth: '07', endDay: null, endMonth: null }, 'Parc Jura single date');
  assert.deepStrictEqual(parseParcJuraVaudoisDate('18-19.07'), { startDay: '18', startMonth: '07', endDay: '19', endMonth: '07' }, 'Parc Jura same-month range');
  assert.deepStrictEqual(parseParcJuraVaudoisTime('09:15 ><br> 15:00'), { startTime: '09:15', endTime: '15:00' }, 'Parc Jura time range');
  const pjvListings = extractParcJuraVaudoisListings(
    '<div id="posts-list" class="row mozaic">'
    + '<div class="col-md-6 col-lg-4"><a href="https://parcjuravaudois.ch/fr/loisir/52168" title="Immersion nature" class="mozaic-link">'
    + '<div class="image-mozaic"></div><div class="text"><div class="mozaic-info">'
    + '<span class="date">18.07</span><span class="time">09:15 ><br>15:00</span><span class="location">Saint Cergue</span>'
    + '</div><h3>Immersion nature</h3></div></a></div>'
    + '<div class="col-md-6 col-lg-4"><a href="https://parcjuravaudois.ch/fr/loisir/52215" title="Traces et indices" class="mozaic-link">'
    + '<div class="image-mozaic"></div><div class="text"><div class="mozaic-info">'
    + '<span class="date">23.01</span><span class="time">09:00 ><br>12:00</span><span class="location">Saint Cergue</span>'
    + '</div><h3>NOUVEAU - Traces et indices</h3></div></a></div>'
    + '</div>'
  );
  assert.strictEqual(pjvListings.length, 2, 'Parc Jura should extract both cards');
  assert.strictEqual(pjvListings[0].id, '52168');
  assert.strictEqual(pjvListings[0].title, 'Immersion nature');
  assert.strictEqual(pjvListings[1].title, 'Traces et indices', 'Parc Jura should strip the NOUVEAU prefix');
  const pjvDated = assignParcJuraVaudoisYears(pjvListings, new Date('2026-07-04T07:00:00Z'));
  assert.strictEqual(pjvDated[0].startDate, '2026-07-18');
  assert.strictEqual(pjvDated[1].startDate, '2027-01-23', 'Parc Jura should roll the year forward on the Dec→Jan wrap');
  const pjvDetail = parseParcJuraVaudoisDetail(
    '<div class="activite_description activite_block">Vivez une aventure hors du temps: bivouac en nature et cueillette de plantes sauvages comestibles.</div>'
    + '<div class="activite_details activite_block"><h2>Lieu de rendez-vous</h2><p>Col de la Givrine<br>1264 Saint Cergue</p></div>'
    + '<div class="activite_prix activite_block"><h2>Prix</h2><p>Adulte : 120 CHF<br />Enfant : 60 CHF</p></div>',
    pjvListings[0]
  );
  assert.strictEqual(pjvDetail.city, 'Saint Cergue', 'Parc Jura should read the town from the NPA line');
  assert.strictEqual(pjvDetail.childPrice, 60, 'Parc Jura should read the child tariff');
  assert(pjvDetail.familyLike, 'Parc Jura event with a child tariff should be flagged family-like');
  const pjvEvent = normalizeEvent({
    source: 'parcJuraVaudois', title: pjvListings[0].title,
    startDate: isoDateZurich(pjvDated[0].startDate, pjvListings[0].startTime), endDate: null,
    locationName: 'Col de la Givrine', locationText: 'Col de la Givrine, 1264 Saint Cergue · Saint Cergue', city: pjvDetail.city,
    url: pjvListings[0].url, description: pjvDetail.description,
    ageText: `famille (tarif enfant ${pjvDetail.childPrice} CHF)`, priceText: pjvDetail.priceText,
    tags: inferTags(`${pjvListings[0].title} ${pjvDetail.description} nature plein air Jura`),
    officialSources: [pjvListings[0].url]
  });
  assert.strictEqual(pjvEvent.startDate, '2026-07-18T09:15:00+02:00', 'Parc Jura should apply the DST-aware start time');
  assert(pjvEvent.officialSources.some(u => /\/loisir\/52168/.test(u)), 'Parc Jura should keep the stable detail URL');
  assert.strictEqual(estimateDistanceKm(pjvEvent), 60, 'Parc Jura Saint-Cergue should resolve a distance from Yverdon');
  // --- OVV (Office des Vins Vaudois) agenda ---
  assert.deepStrictEqual(
    (({ startDate, endDate, timeLine }) => ({ startDate, endDate, timeLine }))(parseOvvListingDate('23 novembre 2026<br> 16h30 à 20h')),
    { startDate: '2026-11-23', endDate: null, timeLine: '16h30 à 20h' }, 'OVV single date + time line');
  assert.deepStrictEqual(
    (({ startDate, endDate }) => ({ startDate, endDate }))(parseOvvListingDate('20 août — 3 septembre 2026<br> 18h-22h')),
    { startDate: '2026-08-20', endDate: '2026-09-03' }, 'OVV cross-month range with year applied to both bounds');
  assert.deepStrictEqual(
    (({ startDate, endDate }) => ({ startDate, endDate }))(parseOvvListingDate('20 août — 22 août 2026<br>')),
    { startDate: '2026-08-20', endDate: '2026-08-22' }, 'OVV same-month range');
  assert.strictEqual(parseOvvTime('16h30 à 20h'), '16:30', 'OVV should read a start time');
  assert.strictEqual(parseOvvTime('De 9h00 à 12h30'), '09:00', 'OVV should read a "De 9h00" start time');
  assert.strictEqual(parseOvvTime('Tous les samedis de 10h à 13h'), '', 'OVV recurring line should stay date-level');
  assert.strictEqual(parseOvvTime('arrivée libre entre 17h et 20h.'), '17:00', 'OVV should read an "entre 17h" start time');
  assert.strictEqual(ovvCityFromAddress('Rue de Genève 97 B 1004 Lausanne'), 'Lausanne', 'OVV should read the town from the NPA line');
  const ovvListings = extractOvvListings(
    '<div class="list-teaser-event"><a href="/agenda/caves-ouvertes-bonvillars" class="teaser-event">'
    + '<div class="date">30 mai 2026<br> 10h à 18h</div>'
    + '<div class="infos"><h3>Caves ouvertes à Bonvillars</h3><p class="domain">Cave des Vignerons</p>'
    + '<p class="address mt-1 mb-0">Rue du Four 3 1427 Bonvillars</p></div></a></div>'
    + '<div class="list-teaser-event"><a href="/agenda/bar-vins-au-36-141" class="teaser-event">'
    + '<div class="date">26 novembre 2026<br> 16h30 à 20h</div>'
    + '<div class="infos"><h3>Bar à vins "Au 36"</h3><p class="domain">Domaine Bertholet</p>'
    + '<p class="address mt-1 mb-0">Grand Rue 36 1844 Villeneuve</p></div></a></div>',
    SOURCES.ovv.baseUrl);
  assert.strictEqual(ovvListings.length, 2, 'OVV should extract both teaser cards');
  assert.strictEqual(ovvListings[0].city, 'Bonvillars', 'OVV should extract the city');
  assert.strictEqual(ovvListings[0].startTime, '10:00', 'OVV should extract the listing start time');
  assert(ovvListings[0].url.endsWith('/agenda/caves-ouvertes-bonvillars'), 'OVV should keep the stable detail URL');
  const ovvDetail = parseOvvDetail('<div class="col-md-8"><p class="lead my-3">Portes ouvertes des caves, dégustation et ambiance familiale au cœur du vignoble.</p><div class="contact-infos"><p><span class="label">E-mail</span><a href="mailto:info@x.ch">info@x.ch</a></p><p><span class="label">Website</span><a href="https://cavesbonvillars.ch">cavesbonvillars.ch</a></p></div></div>');
  assert(/famille|dégustation/i.test(ovvDetail.description), 'OVV detail should read the lead description');
  assert.strictEqual(ovvDetail.website, 'https://cavesbonvillars.ch', 'OVV detail should read the official website link');
  const ovvEvent = normalizeEvent({
    source: 'ovv', title: ovvListings[0].title,
    startDate: isoDateZurich(ovvListings[0].startDate, ovvListings[0].startTime), endDate: ovvListings[0].endDate,
    locationName: ovvListings[0].domain, locationText: `${ovvListings[0].domain} · ${ovvListings[0].address}`, city: ovvListings[0].city,
    url: ovvListings[0].url, description: ovvDetail.description, ageText: 'tout public / famille (terroir)', priceText: '',
    tags: inferTags(`${ovvListings[0].title} vin vignoble terroir cave famille plein air`),
    officialSources: [ovvListings[0].url, ovvDetail.website]
  });
  assert.strictEqual(ovvEvent.startDate, '2026-05-30T10:00:00+02:00', 'OVV should apply the DST-aware start time');
  assert.strictEqual(estimateDistanceKm(ovvEvent), 8, 'OVV Bonvillars should resolve a short distance from Yverdon');
  assert(ovvEvent.officialSources.some(u => /cavesbonvillars\.ch/.test(u)), 'OVV should keep the official website in sources');
  // --- Centre Pro Natura de Champ-Pittet agenda ---
  assert.strictEqual(champPittetIsoDate('12.08.2026'), '2026-08-12', 'Champ-Pittet should convert a DD.MM.YYYY card date');
  assert.strictEqual(champPittetIsoDate('01.11.2026'), '2026-11-01', 'Champ-Pittet should zero-pad the card date');
  const cpListings = extractChampPittetListings(
    '<div class="cards__wrapper">'
    + '<div class="cards__content"><a href="/fr/atelier-bricolage-pour-enfants?startDate=12.08.2026&amp;endDate=12.08.2026" class="card card--small card--image">'
    + '<div class="card__date"><div class="start-date"><div class="day">12</div><div class="month">Aoû</div><div class="year">2026</div></div></div>'
    + '<div class="card__body"><h2 class="card__title">Atelier bricolage pour enfants</h2></div>'
    + '<div class="card__footer"><div class="card__tags"><i><svg></svg></i> Atelier</div></div></a></div>'
    + '<div class="cards__content"><a href="/fr/exposition-interactive-et-ludique?startDate=28.03.2026&amp;endDate=01.11.2026" class="card card--small card--image">'
    + '<div class="card__date"><div class="start-date"><div class="day">28</div><div class="month">Mar</div><div class="year">2026</div></div><div class="separator">-</div><div class="end-date"><div class="day">01</div><div class="month">Nov</div><div class="year">2026</div></div></div>'
    + '<div class="card__body"><h2 class="card__title">Expo­si­tion inter­active et ludique — Qui vit là ?</h2></div>'
    + '<div class="card__footer"><div class="card__tags"><i><svg></svg></i> Exposition</div></div></a></div>'
    + '</div>',
    SOURCES.champPittet.baseUrl);
  assert.strictEqual(cpListings.length, 2, 'Champ-Pittet should extract both cards');
  assert.strictEqual(cpListings[0].startDate, '2026-08-12');
  assert.strictEqual(cpListings[0].endDate, null, 'Champ-Pittet single-day card should collapse the end date');
  assert.strictEqual(cpListings[0].category, 'Atelier');
  assert.strictEqual(cpListings[1].startDate, '2026-03-28');
  assert.strictEqual(cpListings[1].endDate, '2026-11-01', 'Champ-Pittet multi-day expo should keep the end date');
  assert.strictEqual(cpListings[1].title, 'Exposition interactive et ludique — Qui vit là ?', 'Champ-Pittet should strip soft hyphens and nbsp from the title');
  assert(cpListings[1].url.endsWith('/fr/exposition-interactive-et-ludique'), 'Champ-Pittet should keep the stable slug URL');
  const cpDetail = parseChampPittetDetail(
    '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Event","name":"Atelier bricolage pour enfants","description":"Participe à notre atelier bricolage et construis un palace pour les abeilles sauvages !","startDate":"2026-08-12T12:00:00","endDate":"2026-08-12T14:00:00"}]}</script>'
    + '<div class="hero__cta__time"><div class="cta-label">Heure</div><div class="cta-value">14:00 - 16:00</div></div>'
    + '<div class="field field--name-field-price"><div class="field__label">Coûts</div><div class="field__item">A partir de CHF 10.00</div></div>'
    + '<div class="field field--name-field-location-name"><div class="field__label">Lieu</div><div class="field__item">Centre Pro Natura de Champ-Pittet</div></div>',
    cpListings[0]);
  assert.strictEqual(cpDetail.name, 'Atelier bricolage pour enfants', 'Champ-Pittet should read the JSON-LD Event name');
  assert.strictEqual(cpDetail.startTime, '14:00', 'Champ-Pittet should read the local start time (not the UTC JSON-LD)');
  assert.strictEqual(cpDetail.endTime, '16:00', 'Champ-Pittet should read the local end time');
  assert.strictEqual(cpDetail.priceText, 'A partir de CHF 10.00', 'Champ-Pittet should read the Coûts price');
  assert.strictEqual(cpDetail.locationName, 'Centre Pro Natura de Champ-Pittet', 'Champ-Pittet should read the location name');
  const cpEvent = normalizeEvent({
    source: 'champPittet', title: cpDetail.name || cpListings[0].title,
    startDate: isoDateZurich(cpListings[0].startDate, cpDetail.startTime),
    endDate: cpDetail.endTime ? isoDateZurich(cpListings[0].startDate, cpDetail.endTime) : null,
    locationName: cpDetail.locationName, locationText: `${cpDetail.locationName}, Cheseaux-Noréaz`, city: 'Cheseaux-Noréaz',
    url: cpListings[0].url, description: cpDetail.description,
    ageText: 'tout public / famille', priceText: cpDetail.priceText,
    tags: inferTags(`${cpDetail.name} ${cpDetail.description} nature Grande Cariçaie plein air famille`),
    officialSources: [cpListings[0].url]
  });
  assert.strictEqual(cpEvent.startDate, '2026-08-12T14:00:00+02:00', 'Champ-Pittet should apply the DST-aware local start time');
  assert.strictEqual(cpEvent.endDate, '2026-08-12T16:00:00+02:00', 'Champ-Pittet should apply the DST-aware local end time');
  assert.strictEqual(cpEvent.city, 'Cheseaux-Noréaz');
  assert.strictEqual(estimateDistanceKm(cpEvent), 5, 'Champ-Pittet (Cheseaux-Noréaz) should resolve a short distance from Yverdon');
  // Buskers Festival Neuchâtel: parse the dated current edition from the horaires text.
  const buskersEditions = parseBuskersEditions('Du mardi 11 au samedi 15 août 2026 les artistes se produisent à Neuchâtel dans la rue, dans la zone piétonne dès 17h00. du 11 au 13 août: de 17h00 à 23h00. Les 14 et 15 août: de 17h00 à 01h00 Puis retrouvez les Nuits du Buskers dès 23h00 : Dimanche 16 août à la Ramée à Marin de 11h00 à 18h00. Adresse: Chem. de la Ramée 4, 2074 Marin-Epagnier');
  assert.strictEqual(buskersEditions.length, 2, 'Buskers should parse the street festival + La Ramée day');
  const buskersStreet = buskersEditions.find(e => e.kind === 'street');
  assert.strictEqual(buskersStreet.startDate, '2026-08-11', 'Buskers street festival should start 11 août 2026 (year-anchored, not the daily-schedule line)');
  assert.strictEqual(buskersStreet.endDate, '2026-08-15', 'Buskers street festival should end 15 août 2026');
  assert.strictEqual(buskersStreet.startTime, '17h00', 'Buskers street festival should read the "dès 17h00" start');
  const buskersRamee = buskersEditions.find(e => e.kind === 'ramee');
  assert.strictEqual(buskersRamee.startDate, '2026-08-16', 'Buskers La Ramée day should be 16 août, inheriting the edition year');
  assert.strictEqual(buskersRamee.startTime, '11h00');
  assert.strictEqual(buskersRamee.endTime, '18h00');
  const buskersRameeEvent = normalizeEvent({
    source: 'buskers', title: 'Buskers Festival – La Ramée (journée famille au bord du lac)',
    startDate: isoDateZurich(buskersRamee.startDate, buskersRamee.startTime), endDate: null,
    locationName: 'La Ramée', locationText: 'La Ramée, Chem. de la Ramée 4, 2074 Marin-Epagnier', city: 'Marin-Epagnier',
    url: `${SOURCES.buskers.url}#${sha(`ramee|${buskersRamee.startDate}`)}`,
    ageText: 'tout public / famille', priceText: 'Gratuit / chapeau (soutien)',
    tags: inferTags('festival arts de la rue plein air lac famille gratuit'), officialSources: [SOURCES.buskers.url]
  });
  assert.strictEqual(buskersRameeEvent.startDate, '2026-08-16T11:00:00+02:00', 'Buskers La Ramée should apply the DST-aware local start time');
  assert.strictEqual(estimateDistanceKm(buskersRameeEvent), 44, 'La Ramée (Marin-Epagnier) should resolve a distance from Yverdon');
  // Le Castrum (SvelteKit devalue __data.json): UTC session instants must shift to
  // DST-aware Europe/Zurich, never be taken verbatim.
  assert.strictEqual(castrumUtcToZurichIso('2026-08-08T12:00:00.000Z'), '2026-08-08T14:00:00+02:00', 'Castrum should shift a summer UTC session to +02:00 local');
  assert.strictEqual(castrumUtcToZurichIso('2026-12-05T13:00:00.000Z'), '2026-12-05T14:00:00+01:00', 'Castrum should shift a winter UTC session to +01:00 local');
  const castrumPool = [
    { events: 1 },                                                    // 0
    [2],                                                              // 1
    { title: 3, slug: 4, shortDescription: 5, info: 6 },             // 2
    'OMÂ',                                                            // 3
    'oma',                                                           // 4
    'Un spectacle jeune public.',                                    // 5
    { category: 7, booking: 10, bookingLink: -1, sessions: 11 },     // 6
    { id: 8, name: 9 },                                              // 7
    42,                                                              // 8
    'Spectacle',                                                     // 9
    true,                                                            // 10
    [12],                                                            // 11
    { id: 13, location: 14, startDate: 17, endDate: 18 },            // 12
    'sess-1',                                                        // 13
    { id: 15, name: 16 },                                            // 14
    19,                                                              // 15
    "L'Échandole",                                                   // 16
    '2026-08-08T12:00:00.000Z',                                      // 17
    '2026-08-08T13:00:00.000Z'                                       // 18
  ];
  const castrumJson = { type: 'data', nodes: [{ type: 'data', data: castrumPool }] };
  const castrumRows = extractCastrumListings(castrumJson, new Date('2026-08-08T06:00:00Z'));
  assert.strictEqual(castrumRows.length, 1, 'Castrum should extract one future session from the devalue pool');
  assert.strictEqual(castrumRows[0].startDate, '2026-08-08T14:00:00+02:00', 'Castrum session start should be the DST-aware local time');
  assert.strictEqual(castrumRows[0].endDate, null, 'Castrum same-day end time should collapse to null');
  assert.strictEqual(castrumRows[0].category, 'Spectacle', 'Castrum should resolve the category name via the devalue pool');
  assert.strictEqual(castrumRows[0].locationName, "L'Échandole", 'Castrum should resolve the session location name');
  const castrumEvent = castrumEventFromRow(castrumRows[0]);
  assert.strictEqual(castrumEvent.startDate, '2026-08-08T14:00:00+02:00', 'Castrum event should keep the DST-aware start');
  assert.ok(/r[ée]servation/i.test(castrumEvent.priceText), 'Castrum booking session should note reservation');
  assert.ok(castrumEvent.url.includes('/programme/oma#2026-08-08'), 'Castrum should build a stable per-session detail URL');
  assert.strictEqual(castrumEvent.city, 'Yverdon-les-Bains');
  assert.strictEqual(estimateDistanceKm(castrumEvent), 0, 'Le Castrum (Yverdon centre) should resolve to 0 km');
  // J3L — geo-scoped GeoJSON agenda: in-radius near event kept, far event dropped.
  assert.strictEqual(Math.round(haversineKm(46.7785, 6.6410, 46.7785, 6.6410)), 0, 'haversine of a point with itself is 0');
  const j3lHtml = '<html><body><script id="list-data" type="application/json">'
    + JSON.stringify({ type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [6.845, 46.847] }, properties: { type: 'poi', id: 8765, title: 'Fête de la tomate', subtitle: 'Fête, festival', objectCategory: 'Fête, festival', text: 'Marché gourmand en plein air, entrée libre.', href: '/fr/P8765', city: 'Cheyres', region: ['9'], subregion: 'Broye', dateFrom: '2026-09-05', dateTo: '2026-09-06' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [7.344, 47.222] }, properties: { type: 'poi', id: 4321, title: 'Marché de Noël de Delémont', subtitle: 'Marché', objectCategory: 'Coutume, marché', text: 'Loin d’Yverdon.', href: '/fr/P4321', city: 'Delémont', region: ['6'], subregion: 'Jura', dateFrom: '2026-12-05', dateTo: '2026-12-05' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [6.641, 46.778] }, properties: { type: 'poi', id: 1111, title: 'Vieux concert', subtitle: 'Concert', objectCategory: 'Concert', text: 'Passé.', href: '/fr/P1111', city: 'Yverdon-les-Bains', region: ['10'], subregion: 'Nord vaudois', dateFrom: '2020-01-01', dateTo: '2020-01-01' } }
      ] })
    + '</script></body></html>';
  const j3lFeatures = extractJ3lFeatures(j3lHtml);
  assert.strictEqual(j3lFeatures.length, 3, 'J3L should extract all embedded #list-data features');
  const j3lRows = j3lScopedRows(j3lFeatures, 30, '2026-08-09');
  assert.strictEqual(j3lRows.length, 1, 'J3L should keep only the in-radius upcoming feature (Cheyres in, Delémont out, past out)');
  assert.strictEqual(j3lRows[0].p.city, 'Cheyres');
  assert.strictEqual(j3lRows[0].startDate, '2026-09-05');
  assert.strictEqual(j3lRows[0].endDate, '2026-09-06', 'J3L multi-day range keeps the end date');
  assert.ok(j3lRows[0].straightKm > 0 && j3lRows[0].straightKm < 30, 'J3L should carry a plausible straight-line distance');
  const j3lEvent = j3lEventFromRow(j3lRows[0]);
  assert.strictEqual(j3lEvent.source, 'j3l');
  assert.strictEqual(j3lEvent.title, 'Fête de la tomate', 'J3L should decode entities in the title');
  assert.strictEqual(j3lEvent.city, 'Cheyres');
  assert.ok(j3lEvent.url.endsWith('/fr/P8765'), 'J3L should build a stable /fr/P<id> detail URL');
  assert.ok(/libre|gratuit/i.test(j3lEvent.priceText), 'J3L should flag entrée libre evidence');
  assert.strictEqual(estimateDistanceKm(j3lEvent), 15, 'J3L Cheyres should resolve a short distance from Yverdon');
  assert.strictEqual(j3lIsoDate('2026-09-05'), '2026-09-05');
  assert.strictEqual(j3lIsoDate('bogus'), null);
  // --- Château de Grandson ---------------------------------------------------
  assert.deepStrictEqual(parseGrandsonChateauDates('Samedi 8 et dimanche 9 août 2026'), [{ startDate: '2026-08-08', endDate: '2026-08-09' }], 'Grandson château contiguous weekend -> multi-day range');
  assert.deepStrictEqual(parseGrandsonChateauDates('12, 16, 19 et 23 août 2026'), [
    { startDate: '2026-08-12', endDate: null }, { startDate: '2026-08-16', endDate: null },
    { startDate: '2026-08-19', endDate: null }, { startDate: '2026-08-23', endDate: null }
  ], 'Grandson château discrete list -> one event per date');
  assert.deepStrictEqual(parseGrandsonChateauDates('Dimanche 1er novembre 2026'), [{ startDate: '2026-11-01', endDate: null }], 'Grandson château single "1er" date');
  assert.deepStrictEqual(parseGrandsonChateauDates('Du 30 août au 2 septembre 2026'), [{ startDate: '2026-08-30', endDate: '2026-09-02' }], 'Grandson château cross-month range');
  assert.deepStrictEqual(parseGrandsonChateauTime('13h30 - 17h00'), { startTime: '13:30', endTime: '17:00' }, 'Grandson château time range');
  assert.deepStrictEqual(parseGrandsonChateauTime('14h00'), { startTime: '14:00', endTime: '' }, 'Grandson château single time');
  const gcListings = extractGrandsonChateauListings(
    '<div class="pb-4 border-b border-neutral-200 md:grid grid-cols-[1fr_2fr_1fr] gap-x-5">'
    + '<a href="https://chateau-grandson.ch/agenda/mon-armoirie-a-moi/" class="block overflow-hidden row-span-2 w-full aspect-3/2"><img></a>'
    + '<a href="https://chateau-grandson.ch/agenda/mon-armoirie-a-moi/" class="text-xl font-medium no-underline">Mon armoirie à moi</a>'
    + '<div class="row-span-2 text-base"><div class="flex flex-col gap-y-4"><div><div class="flex gap-x-2 items-center">'
    + '<div class="font-medium">12, 16, 19 et 23 août 2026</div>'
    + '<div class="relative group/tooltip"><div class="text-xs font-medium"><div>12, 16, 19 et 23 août 2026</div></div></div></div></div>'
    + '<div>13h30 - 17h00</div></div>'
    + '<div class="space-y-2 text-sm"><div class="flex flex-wrap gap-2">'
    + '<div class="px-2 py-1 bg-neutral-100">Initiation</div><div class="px-2 py-1 bg-neutral-100">Tout public</div></div></div></div></div>'
    + '<div class="pb-4 border-b border-neutral-200 md:grid grid-cols-[1fr_2fr_1fr] gap-x-5">'
    + '<a href="https://chateau-grandson.ch/agenda/visite-guidee-du-mois-4/" class="text-xl font-medium no-underline">Visite guidée du mois</a>'
    + '<div class="row-span-2 text-base"><div><div class="font-medium">Dimanche 6 septembre 2026</div></div><div>14h00</div>'
    + '<div class="space-y-2 text-sm"><div class="flex flex-wrap gap-2">'
    + '<div class="px-2 py-1 bg-neutral-100">Gratuit</div><div class="px-2 py-1 bg-neutral-100">Visite</div>'
    + '<div class="px-2 py-1 bg-neutral-100">Dès 10 ans</div></div></div></div></div>'
  );
  assert.strictEqual(gcListings.length, 2, 'Grandson château should extract both cards');
  assert.strictEqual(gcListings[0].title, 'Mon armoirie à moi');
  assert.strictEqual(gcListings[0].dateText, '12, 16, 19 et 23 août 2026', 'Grandson château should read the main date (not the tooltip)');
  assert.strictEqual(gcListings[0].timeText, '13h30 - 17h00');
  assert.deepStrictEqual(gcListings[0].tags, ['Initiation', 'Tout public']);
  assert.ok(gcListings[1].url.endsWith('/agenda/visite-guidee-du-mois-4/'), 'Grandson château should keep the stable detail URL');
  const gcDetail = parseGrandsonChateauDetail(
    '<html><head><script type="application/ld+json" class="yoast-schema-graph">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","description":"Un atelier héraldique pour créer son propre blason au château.","breadcrumb":{}}]}</script></head>'
    + '<main><div><h2>Informations pratiques</h2><div><div><div>Date</div><div>Dimanche 6 septembre 2026</div></div>'
    + '<div><div>Tarifs</div><div>Gratuit</div></div></div></div>'
    + '<a href="https://www.aacg.ch/atelier">Billetterie</a><a href="https://www.instagram.com/chateau_de_grandson/">insta</a></main></html>'
  );
  assert.strictEqual(gcDetail.description, 'Un atelier héraldique pour créer son propre blason au château.', 'Grandson château should read the Yoast description');
  assert.strictEqual(gcDetail.tarifs, 'Gratuit', 'Grandson château should read the Tarifs value');
  assert.strictEqual(gcDetail.externalLink, 'https://www.aacg.ch/atelier', 'Grandson château should keep the first non-social external link');
  const gcEvents = grandsonChateauEventsFromListing(gcListings[0], gcDetail);
  assert.strictEqual(gcEvents.length, 4, 'Grandson château multi-date workshop should expand to 4 occurrences');
  assert.strictEqual(gcEvents[0].source, 'grandsonChateau');
  assert.strictEqual(gcEvents[0].startDate, '2026-08-12T13:30:00+02:00', 'Grandson château should apply the DST-aware local start time');
  assert.strictEqual(gcEvents[0].endDate, '2026-08-12T17:00:00+02:00', 'Grandson château should apply the end time to the same day');
  assert.strictEqual(gcEvents[0].city, 'Grandson');
  assert.strictEqual(gcEvents[0].priceText, 'Gratuit', 'Grandson château should mark the free workshop');
  assert(gcEvents[0].officialSources.some(u => /aacg\.ch/.test(u)), 'Grandson château should keep the external billetterie link');
  assert.strictEqual(estimateDistanceKm(gcEvents[0]), 5, 'Grandson château should resolve the Grandson distance from Yverdon');
  const gcWeekend = grandsonChateauEventsFromListing({ url: 'https://chateau-grandson.ch/agenda/fete-medievale/', title: 'Fête Médiévale', dateText: 'Samedi 8 et dimanche 9 août 2026', timeText: '', tags: ['Initiation', 'Spectacle', 'Tout public'] }, {});
  assert.strictEqual(gcWeekend.length, 1, 'Grandson château weekend festival should stay a single multi-day event');
  assert.strictEqual(gcWeekend[0].startDate, '2026-08-08');
  assert.strictEqual(gcWeekend[0].endDate, '2026-08-09', 'Grandson château weekend keeps the multi-day end date');
  // Maison d'Ailleurs (WordPress REST `activites`): the date lives in the slug — single
  // day `<title>-JJ-MM-AAAA` and same-month range `<title>-J1-J2-MM-AAAA` — while the
  // body enriches horaire/public/prix. The range shape must win over the single shape
  // and a title-trailing number must not be misread as a date token.
  assert.deepStrictEqual(parseMaisonAilleursSlugDate('monstres-en-bd-21-10-2026'), { startDate: '2026-10-21', endDate: null }, 'Maison d’Ailleurs single-day slug');
  assert.deepStrictEqual(parseMaisonAilleursSlugDate('50-ans-musee-2-3-05-2026'), { startDate: '2026-05-02', endDate: '2026-05-03' }, 'Maison d’Ailleurs same-month range slug (range wins over single)');
  assert.strictEqual(parseMaisonAilleursSlugDate('crea-lab-ete-2026'), null, 'Maison d’Ailleurs evergreen slug has no parseable date');
  assert.strictEqual(parseMaisonAilleursSlugDate('atelier-13h-99-13-2026'), null, 'Maison d’Ailleurs slug with an out-of-range month is rejected');
  const mdaLead = maisonAilleursLead('<p>ATELIER KIDS Initie-toi aux bases de la BD. Mercredi 21 octobre 2026, 14h-16h Enfants dès 8 ans CHF 20.- par enfant</p><p>Sur inscription inscription « * » indique les champs nécessaires Nom * Prénom Afghanistan Albanie</p>');
  assert.ok(!/Afghanistan|champs nécessaires/.test(mdaLead), 'Maison d’Ailleurs lead should drop the booking-form boilerplate');
  assert.strictEqual(maisonAilleursTime(mdaLead), '14:00', 'Maison d’Ailleurs should read the first HHhMM start time');
  assert.strictEqual(maisonAilleursAgeText(mdaLead), 'Enfants dès 8 ans', 'Maison d’Ailleurs should capture the "Enfants dès 8 ans" public');
  assert.ok(/CHF\s*20/.test(maisonAilleursPrice(mdaLead)), 'Maison d’Ailleurs should capture the CHF price');
  const mdaEvent = maisonAilleursEventFromRecord({
    slug: 'monstres-en-bd-21-10-2026',
    link: 'https://ailleurs.ch/activites/monstres-en-bd-21-10-2026/',
    title: { rendered: 'Monstres en BD' },
    content: { rendered: '<p>ATELIER KIDS crée une BD d’Halloween. Mercredi 21 octobre 2026, 14h-16h Enfants dès 8 ans CHF 20.- par enfant</p><p>Sur inscription « * » indique les champs nécessaires</p>' }
  });
  assert.strictEqual(mdaEvent.source, 'maisonAilleurs');
  assert.strictEqual(mdaEvent.startDate, '2026-10-21T14:00:00+02:00', 'Maison d’Ailleurs should apply the DST-aware slug date + body time');
  assert.strictEqual(mdaEvent.ageMin, 8, 'Maison d’Ailleurs should parse the minimum age from the body');
  assert.strictEqual(mdaEvent.city, 'Yverdon-les-Bains');
  assert.strictEqual(estimateDistanceKm(mdaEvent), 0, 'Maison d’Ailleurs (Yverdon centre) should resolve to 0 km');
  assert.ok(mdaEvent.tags.includes('science') || mdaEvent.tags.includes('culture'), 'Maison d’Ailleurs should carry a science/culture tag');
  const mdaEvergreen = maisonAilleursEventFromRecord({ slug: 'crea-lab-ete-2026', link: 'https://ailleurs.ch/activites/crea-lab-ete-2026/', title: { rendered: 'Le Crea-lab' }, content: { rendered: '<p>ATELIER KIDS Tous les dimanches des vacances d’été Enfants dès 6 ans</p>' } });
  assert.strictEqual(mdaEvergreen, null, 'Maison d’Ailleurs evergreen/recurring activity without a concrete date is skipped');
  // Musée d'Yverdon et région (WordPress `.event-card` agenda): the card-date label
  // carries the FR date (no year on single days) + wall-clock times; the detail page
  // enriches Lieu/Prix. A fixed "now" pins the forward-year inference deterministically.
  const myNow = new Date('2026-08-12T07:00:00Z');
  const myDate = parseMuseeYverdonDate('Dimanche 4 octobre, 10h00-18h00', myNow);
  assert.deepStrictEqual(myDate.occurrences, [{ startDate: '2026-10-04', endDate: null }], 'Musée d’Yverdon single-day card date');
  assert.strictEqual(myDate.startTime, '10:00', 'Musée d’Yverdon should read the start time');
  assert.strictEqual(myDate.endTime, '18:00', 'Musée d’Yverdon should read the end time');
  assert.deepStrictEqual(parseMuseeYverdonDate('Samedi 3 janvier', myNow).occurrences, [{ startDate: '2027-01-03', endDate: null }], 'Musée d’Yverdon should roll a past-month single day to the next year');
  assert.deepStrictEqual(parseMuseeYverdonDate('Du 4 au 12 octobre 2026', myNow).occurrences, [{ startDate: '2026-10-04', endDate: '2026-10-12' }], 'Musée d’Yverdon same-month range');
  assert.deepStrictEqual(parseMuseeYverdonDate('Du 30 août au 2 septembre 2026', myNow).occurrences, [{ startDate: '2026-08-30', endDate: '2026-09-02' }], 'Musée d’Yverdon cross-month range');
  const myListings = extractMuseeYverdonListings(
    '<div class="events-block-container"><div class="c-grid-item event-card">'
    + '<a href="https://musee-yverdon-region.ch/event/11%e1%b5%89-journee-des-chateaux-suisses/" class="card-link">'
    + '<h3 class="card-title">11ᵉ Journée des châteaux suisses</h3>'
    + '<p class="card-date">Dimanche 4 octobre, 10h00-18h00</p>'
    + '<div class="card-excerpt"><p>Plongez dans l’univers fascinant des savoir-faire d’antan au château.</p></div>'
    + '<span class="card-more"> </span></a></div></div>'
  );
  assert.strictEqual(myListings.length, 1, 'Musée d’Yverdon should extract the agenda card');
  assert.strictEqual(myListings[0].title, '11ᵉ Journée des châteaux suisses');
  assert.strictEqual(myListings[0].dateText, 'Dimanche 4 octobre, 10h00-18h00');
  assert.ok(myListings[0].url.endsWith('/event/11%e1%b5%89-journee-des-chateaux-suisses/'), 'Musée d’Yverdon should keep the stable /event/ URL');
  const myDetail = parseMuseeYverdonDetail(
    '<div class="event-infos"><div class="event-meta">Dimanche 4 octobre, 10h00-18h00</div>'
    + '<div class="event-meta">Lieu: Château d\'Yverdon-les-Bains</div>'
    + '<div class="event-meta">Prix: Entrée libre</div></div>'
    + '<div class="entry-content-main"><p>Voyage, voyage ! Laissez-vous guider par le thème du voyage avec des visites et ateliers pour toute la famille.</p><div>Partage: Facebook</div></div>'
  );
  assert.strictEqual(myDetail.lieu, 'Château d\'Yverdon-les-Bains', 'Musée d’Yverdon should read the Lieu meta');
  assert.strictEqual(myDetail.prix, 'Entrée libre', 'Musée d’Yverdon should read the Prix meta');
  assert.ok(/Voyage, voyage/.test(myDetail.description) && !/Partage/.test(myDetail.description), 'Musée d’Yverdon should read the body and drop the share widget text');
  const myEvents = museeYverdonEventsFromListing(myListings[0], myDetail);
  assert.strictEqual(myEvents.length, 1, 'Musée d’Yverdon single card -> single event');
  assert.strictEqual(myEvents[0].source, 'museeYverdon');
  assert.strictEqual(myEvents[0].startDate, '2026-10-04T10:00:00+02:00', 'Musée d’Yverdon should apply the DST-aware start time');
  assert.strictEqual(myEvents[0].endDate, '2026-10-04T18:00:00+02:00', 'Musée d’Yverdon should apply the end time to the same day');
  assert.strictEqual(myEvents[0].city, 'Yverdon-les-Bains');
  assert.strictEqual(myEvents[0].priceText, 'Entrée libre', 'Musée d’Yverdon should keep the free-entry evidence');
  assert.strictEqual(estimateDistanceKm(myEvents[0]), 0, 'Musée d’Yverdon (Château, centre-ville) should resolve to 0 km');
  // Bibliothèque publique et scolaire d'Yverdon (TYPO3 `news`): the card `a[title]`
  // carries the FR date; the detail `[itemprop=articleBody]` enriches time/price/place.
  assert.deepStrictEqual(
    parseBibliothequeYverdonTitleDate('15.08.2026 | Travelling : performance, lecture & musique'),
    { startDate: '2026-08-15', endDate: null, title: 'Travelling : performance, lecture & musique' },
    'Bibliothèque single-day title date');
  assert.deepStrictEqual(
    parseBibliothequeYverdonTitleDate('Du 13.06 au 20.08.2026 | Exposition Égypte : traces et trouvailles'),
    { startDate: '2026-06-13', endDate: '2026-08-20', title: 'Exposition Égypte : traces et trouvailles' },
    'Bibliothèque range with start year inferred from the end year');
  assert.deepStrictEqual(
    parseBibliothequeYverdonTitleDate('Du 15.12 au 10.01.2027 | Contes d’hiver'),
    { startDate: '2026-12-15', endDate: '2027-01-10', title: 'Contes d’hiver' },
    'Bibliothèque cross-new-year range rolls the start year back');
  assert.strictEqual(parseBibliothequeYverdonTitleDate('Le Coffre à histoires'), null, 'Bibliothèque evergreen title has no parseable date');
  const bplListings = extractBibliothequeYverdonListings(
    '<div class="row news list-article"><div class="col-sm-12"><a title="Le Coffre à histoires" href="/activites/detail/le-coffre-a-histoires">Le Coffre à histoires</a><span class="news-list-category"><span>Activités jeunes</span></span><div itemprop="description"><p>Une lecture d\'albums pour les enfants</p></div></div></div>'
    + '<div class="row news list-article"><div class="col-sm-12"><a title="15.08.2026 | Travelling : performance, lecture &amp; musique" href="/activites/detail/15082026-travelling">15.08.2026 | Travelling</a><span class="news-list-category"><span>Activités adultes</span></span><div itemprop="description"><p>Rendez-vous à La Dérivée</p></div></div></div>'
  );
  assert.strictEqual(bplListings.length, 1, 'Bibliothèque should extract only the dated card (evergreen coffre skipped)');
  assert.strictEqual(bplListings[0].startDate, '2026-08-15');
  assert.strictEqual(bplListings[0].category, 'Activités adultes');
  assert.ok(bplListings[0].url.endsWith('/activites/detail/15082026-travelling'), 'Bibliothèque should keep the stable detail URL');
  const bplDetail = parseBibliothequeYverdonDetail(
    '<div class="news-text-wrap"><div itemprop="articleBody"><p>Ed Wige s’associe à Valérie Niederoest pour une performance à la croisée de la musique et de la littérature.</p><p>Dimanche 15 août / 19h00 / Gratuit</p><p>Aura lieu à La Dérivée (Quai de Nogent), sinon à la bibliothèque en cas de mauvais temps.</p></div></div>'
  );
  assert.strictEqual(bplDetail.timeText, '19h00', 'Bibliothèque should read the first HHhMM time from the body');
  assert.strictEqual(bplDetail.priceText, 'Gratuit', 'Bibliothèque should flag the free entry');
  assert.ok(/La Dérivée/.test(bplDetail.placeText), 'Bibliothèque should capture the "Aura lieu à" place');
  const bplEvent = bibliothequeYverdonEventFromListing(bplListings[0], bplDetail);
  assert.strictEqual(bplEvent.source, 'bibliothequeYverdon');
  assert.strictEqual(bplEvent.startDate, '2026-08-15T19:00:00+02:00', 'Bibliothèque should apply the DST-aware body time to the card date');
  assert.strictEqual(bplEvent.endDate, null, 'Bibliothèque single-day event has no end date');
  assert.strictEqual(bplEvent.city, 'Yverdon-les-Bains');
  assert.strictEqual(bplEvent.priceText, 'Gratuit');
  assert.strictEqual(estimateDistanceKm(bplEvent), 0, 'Bibliothèque d’Yverdon should resolve to 0 km');
  const bplChampPittet = bibliothequeYverdonEventFromListing(
    { url: 'https://bibliotheque.yverdon.ch/activites/detail/champ-pittet', title: 'Bibliothèque et activités au Centre Pro Natura de Champ-Pittet', startDate: '2026-08-27', endDate: '2026-08-30', category: 'Activités jeunes', teaser: 'Activités hors les murs' },
    { description: 'Retrouvez la bibliothèque au Centre Pro Natura de Champ-Pittet.', timeText: '', priceText: '', placeText: '' });
  assert.strictEqual(bplChampPittet.city, 'Cheseaux-Noréaz', 'Bibliothèque hors-les-murs at Champ-Pittet resolves to Cheseaux-Noréaz');
  assert.strictEqual(bplChampPittet.startDate, '2026-08-27', 'Bibliothèque multi-day range stays date-level');
  assert.strictEqual(bplChampPittet.endDate, '2026-08-30');
  assert.strictEqual(estimateDistanceKm(bplChampPittet), 5, 'Bibliothèque Champ-Pittet event resolves to 5 km');
  const sunsetJazzHtml = '<div class="c-1"><header><h1>Programmation</h1></header><div class="row">'
    + '<div class="col-md-4"><div class="c-2"><header><h3>Vendredi 10 juillet 2026</h3></header><div class="row"><div class="col-md-12"><div id="accordion2" class="accordion">'
    + '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button">Rue de l\'Hôtel de Ville</button></h2><div class="accordion-collapse"><div class="accordion-body"><p><strong>20:00 - 22:30: Julien Lemoine\'s - Lost in Swing</strong></p></div></div></div>'
    + '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button">Dans les rues d\'Estavayer-le-Lac</button></h2><div class="accordion-collapse"><div class="accordion-body"><p><strong>18:30 - 21:10: Mobile Dixieland Band</strong></p></div></div></div>'
    + '</div></div></div></div></div>'
    + '<div class="col-md-4"><div class="c-3"><header><h3>Dimanche 12 juillet 2026</h3></header><div class="row"><div class="col-md-12"><div id="accordion3" class="accordion">'
    + '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button">Grand-Rue</button></h2><div class="accordion-collapse"><div class="accordion-body"><p><strong>10:30 - 12:30: Larry Franco &amp; Dee Dee Joy</strong></p></div></div></div>'
    + '</div></div></div></div></div>'
    + '<div class="col-md-4"><div class="c-4"><header><h3>Le Comité de cafetiers-restaurateurs</h3></header></div></div>'
    + '</div></div>';
  const sunsetJazzDays = extractSunsetJazzDays(sunsetJazzHtml);
  assert.strictEqual(sunsetJazzDays.length, 2, 'Sunset Jazz should keep only dated day columns (non-date header skipped)');
  assert.strictEqual(sunsetJazzDays[0].startDate, '2026-07-10');
  assert.strictEqual(sunsetJazzDays[0].acts.length, 2, 'Sunset Jazz day should collect every venue accordion in its column');
  const sunsetJazzEvent = sunsetJazzEventFromDay(sunsetJazzDays[0]);
  assert.strictEqual(sunsetJazzEvent.source, 'sunsetJazz');
  assert.strictEqual(sunsetJazzEvent.startDate, '2026-07-10T18:30:00+02:00', 'Sunset Jazz should apply the earliest DST-aware start time of the day');
  assert.strictEqual(sunsetJazzEvent.endDate, null);
  assert.strictEqual(sunsetJazzEvent.city, 'Estavayer-le-Lac');
  assert(/Accès libre/i.test(sunsetJazzEvent.priceText), 'Sunset Jazz should keep the free-access evidence');
  assert(/Mobile Dixieland Band/.test(sunsetJazzEvent.description), 'Sunset Jazz description should list the day programme');
  assert.strictEqual(estimateDistanceKm(sunsetJazzEvent), 22, 'Sunset Jazz Estavayer-le-Lac should resolve to 22 km from Yverdon');
  const sunsetJazzMatinee = sunsetJazzEventFromDay(sunsetJazzDays[1]);
  assert.strictEqual(sunsetJazzMatinee.startDate, '2026-07-12T10:30:00+02:00', 'Sunset Jazz Sunday matinée keeps its morning start time');

  // Château de La Sarraz — The Events Calendar (Tribe) REST JSON events.
  const laSarrazTimed = parseLaSarrazEvent({
    all_day: false,
    title: 'SCHUMANNIADE AU CH&#194;TEAU &#8211; 16 Ao&#251;t',
    start_date: '2026-08-16 17:00:00',
    start_date_details: { year: '2026', month: '08', day: '16', hour: '17', minutes: '00', seconds: '00' },
    end_date_details: { year: '2026', month: '08', day: '16', hour: '22', minutes: '00', seconds: '00' },
    url: 'https://chateau-lasarraz.ch/event/schumanniade-au-chateau-16-aout/',
    venue: { venue: 'Château de La Sarraz', city: 'La Sarraz' },
    cost: 'CHF30',
    cost_details: { currency_symbol: 'CHF', currency_code: 'CHF', values: ['30'] },
    categories: [{ name: 'Concert' }],
    description: '<div class="tribe-events-content"><p>Concert au château.</p></div>'
  });
  assert.strictEqual(laSarrazTimed.source, 'chateauLaSarraz');
  assert.strictEqual(laSarrazTimed.title, 'SCHUMANNIADE AU CHÂTEAU – 16 Août', 'La Sarraz title should be HTML-entity decoded');
  assert.strictEqual(laSarrazTimed.startDate, '2026-08-16T17:00:00+02:00', 'La Sarraz timed event should apply the DST-aware start time');
  assert.strictEqual(laSarrazTimed.endDate, null, 'La Sarraz single-day timed event keeps no end date');
  assert.strictEqual(laSarrazTimed.city, 'La Sarraz');
  assert.strictEqual(laSarrazTimed.priceText, 'CHF 30', 'La Sarraz price should come from cost_details');
  assert.strictEqual(estimateDistanceKm(laSarrazTimed), 15, 'La Sarraz should resolve to 15 km from Yverdon');
  // All-day multi-day salon: Tribe stores the end just past midnight of the day
  // after the last real day → the parser must roll it back one day (4 au 6 sept).
  const laSarrazAllDay = parseLaSarrazEvent({
    all_day: true,
    title: '2&#232;me Salon du terroir &#8211; 4 au 6 septembre',
    start_date: '2026-09-04 02:00:00',
    start_date_details: { year: '2026', month: '09', day: '04', hour: '02', minutes: '00', seconds: '00' },
    end_date_details: { year: '2026', month: '09', day: '07', hour: '01', minutes: '59', seconds: '59' },
    url: 'https://chateau-lasarraz.ch/event/2eme-salon-du-terroir/',
    venue: { venue: 'Château de La Sarraz', city: 'La Sarraz' },
    cost: '',
    cost_details: { values: [] },
    categories: [{ name: 'Balthazar Festival' }],
    description: '<p>Salon du terroir au château.</p>'
  });
  assert.strictEqual(laSarrazAllDay.startDate, '2026-09-04', 'La Sarraz all-day event keeps a date-level start');
  assert.strictEqual(laSarrazAllDay.endDate, '2026-09-06', 'La Sarraz all-day multi-day end should roll back to the last real day');
  assert.strictEqual(laSarrazAllDay.priceText, '', 'La Sarraz salon with no cost_details keeps price empty');

  // Commune de Pomy — same Tribe REST shape, scoped to « autres-evenements ».
  // All-day village events bounded at 23:59:59 same day → single-day, no endDate.
  const pomyAllDay = parsePomyEvent({
    all_day: true,
    title: 'Fanfare &#8211; f&#234;te de la pomme',
    start_date: '2026-10-30 00:00:00',
    start_date_details: { year: '2026', month: '10', day: '30', hour: '00', minutes: '00', seconds: '00' },
    end_date_details: { year: '2026', month: '10', day: '30', hour: '23', minutes: '59', seconds: '59' },
    url: 'https://pomy.ch/event/fanfare-fete-de-la-pomme/',
    venue: [],
    cost: '',
    cost_details: { values: [] },
    categories: [{ name: 'Autres événements' }],
    description: ''
  });
  assert.strictEqual(pomyAllDay.source, 'pomy');
  assert.strictEqual(pomyAllDay.title, 'Fanfare – fête de la pomme', 'Pomy title should be HTML-entity decoded');
  assert.strictEqual(pomyAllDay.startDate, '2026-10-30', 'Pomy all-day event keeps a date-level start');
  assert.strictEqual(pomyAllDay.endDate, null, 'Pomy same-day all-day event keeps no end date');
  assert.strictEqual(pomyAllDay.city, 'Pomy', 'Pomy defaults city to Pomy when venue is empty');
  assert.strictEqual(estimateDistanceKm(pomyAllDay), 4, 'Pomy should resolve to 4 km from Yverdon');
  assert.strictEqual(pomyAllDay.url, 'https://pomy.ch/event/fanfare-fete-de-la-pomme/', 'Pomy keeps the stable /event/ URL');
  // Intergenerational meal → family cue picked up from the title.
  const pomyFamily = parsePomyEvent({
    all_day: true,
    title: 'Repas intergénérationnel',
    start_date: '2026-09-30 00:00:00',
    start_date_details: { year: '2026', month: '09', day: '30', hour: '00', minutes: '00', seconds: '00' },
    end_date_details: { year: '2026', month: '09', day: '30', hour: '23', minutes: '59', seconds: '59' },
    url: 'https://pomy.ch/event/repas-intergenerationnel-2/',
    venue: [],
    cost_details: { values: [] },
    categories: [{ name: 'Autres événements' }],
    description: ''
  });
  assert(/famille|tout public/i.test(pomyFamily.ageText), 'Pomy intergénérationnel should flag a family / tout public cue');

  const champventRows = extractChampventManifestationRows('<ul class="koCheckList"><li>1-3 mai 2026 | Rencontre des vieux tracteurs | Amicale des vieux tracteurs</li><li>31 décembre 2026 | Nouvel-An | Société de jeunesse</li></ul>', SOURCES.champvent.manifestationsUrl);
  assert.strictEqual(champventRows.length, 2);
  assert.strictEqual(champventRows[0].startDate, '2026-05-01');
  assert.strictEqual(champventRows[0].endDate, '2026-05-03');
  const champventListing = extractChampventNewsListings('<div class="itemList"><a href="actualite/chasse-aux-oeufs-a-champvent"><div class="itemTitle">Chasse aux oeufs à Champvent</div><div class="itemStatus">Mercredi, 25 Mars 2026</div><div class="itemDescription">Une activité pour les enfants. Gratuit.</div></a></div>', SOURCES.champvent.url);
  assert.strictEqual(champventListing.length, 1);
  const champventEvents = parseChampventNewsDetail('<main><h1 class="editorjsH1">Chasse aux oeufs à Champvent</h1><div class="itemStatus">Mercredi, 25 Mars 2026</div><div class="ce-block__content">La Chasse se déroulera le dimanche de Pâques, le 5 avril 2026, à la Ferme Olivier Chautems, chemin des Dumières, à Champvent. Les jeux sont totalement gratuits, sans inscription nécessaire et un petit cadeau sera offert à chaque enfant participant.</div></main>', champventListing[0]);
  assert.strictEqual(champventEvents.length, 1);
  assert.strictEqual(champventEvents[0].source, 'champvent');
  assert.strictEqual(champventEvents[0].startDate, '2026-04-05');
  assert.strictEqual(champventEvents[0].city, 'Champvent');
  assert(champventEvents[0].priceText.match(/gratuit/i), 'Champvent fixture should keep free evidence');
  const echallensListings = extractEchallensListings('<div id="jcl_layout_body"><div class="item-event" itemscope itemtype="https://schema.org/Event"><meta itemprop="url" content="https://www.echallens.ch/vivre-a-echallens/manifestations/calendrier-des-manifestations/169-non-categorise/470982-rando-des-blés-2026.html"/><meta itemprop="name" content="Rando des Blés 2026"/><meta itemprop="startDate" content="2026-06-21T09:00:00+02:00"/><h3><a class="eventtitle" href="/vivre-a-echallens/manifestations/calendrier-des-manifestations/169-non-categorise/470982-rando-des-blés-2026.html">Rando des Blés 2026</a></h3><h5 class="date-event">21-06-2026 9:00</h5></div></div>', SOURCES.echallens.url);
  assert.strictEqual(echallensListings.length, 1);
  const echallensEvent = parseEchallensDetail('<main><div class="jcal_event details_event" itemscope itemtype="https://schema.org/Event"><meta itemprop="url" content="https://www.echallens.ch/vivre-a-echallens/manifestations/calendrier-des-manifestations/169-non-categorise/470982-rando-des-blés-2026.html"/><h1 itemprop="name">Rando des Blés 2026</h1><div class="date-event jcl_event_detail"><meta itemprop="startDate" content="2026-06-21T09:00:00+0200" />Dim. 21 Jui, 2026 9:00 - 16:00</div><div class="eventdesclarge"><p>Randonnée populaire familiale. Plus d\'informations sur le site du <a href="https://vcechallens.ch/larandodesbles/">Vélo Club</a>.</p></div></div></main>', echallensListings[0]);
  assert.strictEqual(echallensEvent.source, 'echallens');
  assert.strictEqual(echallensEvent.startDate, '2026-06-21T09:00:00+02:00');
  assert.strictEqual(echallensEvent.endDate, '2026-06-21T16:00:00+02:00');
  assert.strictEqual(echallensEvent.city, 'Echallens');
  assert(echallensEvent.officialSources.some(u => /vcechallens/.test(u)), 'Échallens fixture should preserve external organizer evidence');
  const manual = loadManualJohanEvents();
  assert(manual.events.length >= 8, 'manualJohan source should load Johan-provided events');
  assert(manual.events.some(e => e.title === 'Tu comprendras quand tu seras grand' && e.startDate.startsWith('2026-10-25T11:00:00')), 'manualJohan should include theatre programme OCR/official entries');
  assert(manual.events.every(e => e.source === 'manualJohan' && e.url.startsWith('manual://johan/')), 'manualJohan events should have stable manual URLs');
  assert(manual.events.some(e => e.confidenceStatus === 'confirmed' && e.officialSources.length), 'manualJohan confirmed entries should carry official-source provenance');
  assert(manual.events.some(e => e.confidenceStatus === 'needs_review'), 'manualJohan uncertain OCR entries should remain needs_review');
  const manualNeedsReview = manual.events.find(e => e.confidenceStatus === 'needs_review' && e.startDate);
  assert.strictEqual(rejectionReason(manualNeedsReview, { start: manualNeedsReview.startDate.slice(0, 10), endExclusive: '2099-01-01' }), 'manual_needs_review');
  const officialWebDuplicate = normalizeEvent({ source: 'theatreOfficialFixture', title: 'Tu comprendras quand tu seras grand', startDate: '2026-10-25T11:00:00+01:00', city: 'Neuchâtel', locationText: 'Théâtre du Passage, Neuchâtel', url: 'https://www.theatredupassage.ch/abonnements/passdecouverte/passfamille', ageText: 'Dès 6 ans', description: 'Fixture officielle' });
  const duplicateManual = manual.events.find(e => e.title === officialWebDuplicate.title && e.startDate === officialWebDuplicate.startDate);
  assert.strictEqual(canonicalRecommendationPool([duplicateManual, officialWebDuplicate])[0].source, 'theatreOfficialFixture', 'official web sources should win recommendation dedupe over manual OCR/DB entries');
  const candidates = loadPrioritizedSourceCandidates();
  assert(candidates.diagnostics.topCandidates.some(s => /passage/i.test(s.name)), 'source candidates should include Théâtre du Passage');
  assert(candidates.diagnostics.topCandidates.some(s => /pommier/i.test(s.name)), 'source candidates should include Le Pommier');
  assert(candidates.diagnostics.topCandidates.some(s => /Benno Besson/i.test(s.name)), 'source candidates should include Théâtre Benno Besson');
  assert(candidates.diagnostics.topCandidates.some(s => /Échandole|Echandole/i.test(s.name)), 'source candidates should include L’Échandole');
  // --- Two-stage scoring tests (TASK-229) -----------------------------------
  // A data-poor aggregator candidate (j3l-style: strong listing signals, but no
  // description/age/price) should be selected as promising, get its detail page
  // fetched, and rise after enrichment. A non-promising far/dull event must never
  // be fetched.
  {
    const twoWindow = { start: '2026-05-23', endExclusive: '2026-05-25' };
    const poor = normalizeEvent({
      source: 'j3l',
      title: 'Atelier nature et découverte des animaux pour enfants',
      startDate: '2026-05-23T10:00:00+02:00',
      locationText: 'Yverdon-les-Bains',
      url: 'https://agenda.example.invalid/atelier-nature-enfants'
      // deliberately no description / ageText / priceText → data-poor
    });
    const dull = normalizeEvent({
      source: 'j3l',
      title: 'Assemblée générale ordinaire du comité',
      startDate: '2026-05-23T20:00:00+02:00',
      locationText: 'Genève',
      description: 'Ordre du jour statutaire, rapports annuels et votations internes du comité pour les membres.',
      ageText: 'adultes / membres',
      priceText: 'Réservé aux membres',
      url: 'https://agenda.example.invalid/assemblee-generale'
    });
    assert(isDataPoor(poor), 'poor candidate should be data-poor');
    assert(!isDataPoor(dull), 'dull candidate is data-rich, not a fetch target');

    const scoredTwo = [poor, dull].map(event => ({ event, score: scoreEventStage1(event, twoWindow) }));
    const stage1Poor = scoredTwo[0].score.total;

    // Detail page the enrichment layer will fetch for the poor candidate only.
    const detailHtml = '<html><body><main><h1>Atelier nature et découverte des animaux pour enfants</h1>' +
      '<p>Organisation Pro Natura. Lieu Yverdon-les-Bains. Horaires 10h-12h. Prix Gratuit. ' +
      'Atelier famille dès 4 ans: observation des insectes, des oiseaux et petite balade nature au bord du lac ' +
      'avec un animateur. Sur inscription, goûter offert aux enfants.</p></main></body></html>';
    const fetched = [];
    const fetchDetail = async (url) => {
      fetched.push(url);
      if (/atelier-nature-enfants/.test(url)) return detailHtml;
      throw new Error(`unexpected fetch: ${url}`);
    };

    // Threshold chosen so only the strong listing candidate is promising; topN=0 so
    // selection is threshold-only (the dull event must not sneak in via top-N).
    const cfg = { stage1Threshold: stage1Poor, topNPerSource: 0, maxDetailFetches: 25, fetchDetail };
    const stats = await enrichPromisingCandidates(scoredTwo, twoWindow, cfg);

    assert.deepStrictEqual(fetched, [poor.url], `only the promising data-poor candidate should be fetched, got ${JSON.stringify(fetched)}`);
    assert.strictEqual(stats.fetchAttempts, 1, `exactly one detail fetch expected, got ${stats.fetchAttempts}`);
    assert.strictEqual(stats.enrichedRescored, 1, 'enriched candidate should be re-scored');
    const poorItem = scoredTwo.find(s => s.event.url === poor.url);
    assert(poorItem.enriched, 'poor candidate should be marked enriched');
    assert(poorItem.score.total > stage1Poor, `enriched score ${poorItem.score.total} should exceed stage-1 ${stage1Poor}`);
    assert(poorItem.event.ageMin === 4, `enrichment should extract "dès 4 ans" (got ${poorItem.event.ageMin})`);
    assert(/gratuit/i.test(poorItem.event.priceText), 'enrichment should extract the free-entry price');

    // Robust fallback: a fetch that throws must leave the stage-1 score intact.
    const scoredFail = [normalizeEvent({ ...poor })].map(event => ({ event, score: scoreEventStage1(event, twoWindow) }));
    const s1 = scoredFail[0].score.total;
    const failStats = await enrichPromisingCandidates(scoredFail, twoWindow, {
      stage1Threshold: s1, topNPerSource: 0, fetchDetail: async () => { throw new Error('network down'); }
    });
    assert.strictEqual(failStats.fetchFailures, 1, 'one failed fetch expected');
    assert.strictEqual(scoredFail[0].score.total, s1, 'failed enrichment must fall back to stage-1 score');
    assert(!scoredFail[0].enriched, 'failed candidate should not be marked enriched');
    console.log(`[TEST] two-stage scoring: poor ${stage1Poor} -> ${poorItem.score.total} (enriched), dull never fetched, fetch-failure falls back cleanly`);
  }

  // --- Digest selection tests (TASK-230) ------------------------------------
  // Reproduces the reported bug: high-scoring permanent Champ-Pittet / Grandson
  // exhibits (in-window every weekend) used to take all 5 slices and evict the
  // dated one-off gems. Asserts diversity-by-source, the evergreen cap, and a
  // deterministic score-desc order.
  {
    const win = { start: '2026-08-22', endExclusive: '2026-08-24' };
    const evergreen = (source, id, total) => ({
      event: { source, id, title: id, url: `https://x.invalid/${id}`, startDate: '2026-03-28', endDate: '2026-12-31' },
      score: { total, label: 'recommandé', reasons: [], caveats: [] }
    });
    const dated = (source, id, total) => ({
      event: { source, id, title: id, url: `https://x.invalid/${id}`, startDate: '2026-08-23', endDate: null },
      score: { total, label: 'recommandé', reasons: [], caveats: [] }
    });

    // evergreen-vs-dated helper
    assert(isEvergreenEvent(evergreen('champPittet', 'cp', 96).event, win), 'permanent exhibit (long span, starts before, runs past) is evergreen');
    assert(!isEvergreenEvent(dated('grandsonChateau', 'gc', 94).event, win), 'dated one-off on the target weekend is not evergreen');
    assert(!isEvergreenEvent({ source: 's', startDate: '2026-08-23', endDate: '2026-08-25' }, win), 'a 2-day weekend event is not evergreen even if it spills one day past');

    const pool = [
      evergreen('champPittet', 'cp-abeilles', 96),
      evergreen('champPittet', 'cp-sentier', 95),
      evergreen('champPittet', 'cp-quivitla', 94),
      evergreen('grandson', 'gr-expo1', 93),
      evergreen('grandson', 'gr-expo2', 92),
      dated('grandsonChateau', 'gc-armoirie', 94),
      dated('echallensTourisme', 'et-mondes', 92),
      dated('fribourgTerroir', 'ft-prehistoire', 90),
      dated('avenches', 'av-aventicum', 88)
    ];
    // Shuffle to prove the selection sorts deterministically regardless of input order.
    const shuffled = [pool[5], pool[0], pool[8], pool[3], pool[6], pool[1], pool[7], pool[4], pool[2]];
    const top = shortlistedRecommendations(shuffled, win);

    assert.strictEqual(top.length, 5, `shortlist should fill to 5, got ${top.length}`);
    const sources = top.map(t => t.event.source);
    assert.strictEqual(new Set(sources).size, 5, `each shortlist entry should come from a distinct source, got ${sources.join(', ')}`);
    const evergreenPicked = top.filter(t => isEvergreenEvent(t.event, win)).length;
    assert(evergreenPicked <= SHORTLIST_MAX_EVERGREEN, `at most ${SHORTLIST_MAX_EVERGREEN} evergreen entry expected, got ${evergreenPicked}`);
    for (const gem of ['gc-armoirie', 'et-mondes', 'ft-prehistoire']) {
      assert(top.some(t => t.event.id === gem), `dated gem ${gem} should surface in the shortlist`);
    }
    const cpCount = sources.filter(s => s === 'champPittet').length;
    assert(cpCount <= 1, `Champ-Pittet must not monopolise the shortlist, got ${cpCount} entries`);
    // Determinism: same pool → identical ids in identical order.
    const again = shortlistedRecommendations(pool, win).map(t => t.event.id);
    assert.deepStrictEqual(top.map(t => t.event.id), again, 'selection must be deterministic across input orderings');

    // Thin pool: only same-source evergreen exhibits still return all of them
    // (escalation) rather than dropping below the old slice() count.
    const thin = [evergreen('champPittet', 'a', 96), evergreen('champPittet', 'b', 95), evergreen('champPittet', 'c', 94)];
    assert.strictEqual(shortlistedRecommendations(thin, win).length, 3, 'thin same-source pool should still fill from what exists');
    console.log(`[TEST] digest selection (TASK-230): 5 distinct sources, ${evergreenPicked} evergreen, dated gems surfaced, deterministic`);
  }
  console.log(`[TEST] fixture/date/source-probe tests passed (${fixtures.length} fixtures)`);
}

async function main() {
  if (process.argv.includes('--fixture-test')) { await runFixtureTests(); return; }
  const windowArg = process.argv.find(a => a.startsWith('--window='));
  const window = windowArg ? (() => { const [start, endExclusive] = windowArg.split('=')[1].split(':'); return { start, endExclusive }; })() : nextWeekendWindow(new Date());
  const { events, sourceLogs } = await collectAll();
  const normalized = events.filter(e => e && e.id);
  const recommendationPool = canonicalRecommendationPool(normalized);
  const rejected = [];
  const accepted = [];
  for (const e of recommendationPool) {
    const reason = rejectionReason(e, window);
    if (reason) rejected.push({ reason, event: e }); else accepted.push(e);
  }
  // Stage 1: cheap score for every accepted event on listing-only fields.
  const scored = accepted.map(event => ({ event, score: scoreEventStage1(event, window) }));
  // Stage 2: conditionally fetch detail pages for promising + data-poor candidates
  // and re-score. Falls back to the stage-1 score on any fetch/parse failure.
  const twoStage = await enrichPromisingCandidates(scored, window);
  scored.sort((a, b) => b.score.total - a.score.total);
  console.log(`Two-stage scoring: accepted=${twoStage.accepted} promising=${twoStage.promising} detailFetches=${twoStage.fetchAttempts}/${twoStage.enrichableAccepted} (systematic baseline) success=${twoStage.fetchSuccess} failures=${twoStage.fetchFailures} rescored=${twoStage.enrichedRescored} improved=${twoStage.improved} in ${twoStage.elapsedMs}ms`);
  const quality = inspectQuality(normalized, accepted, rejected, sourceLogs);
  const summary = telegramSummary(scored, window);
  const reviewQueue = eventReviewQueue(scored, window);

  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'automation', 'out', `v02-${now}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'event-reviews'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fetch-log.json'), JSON.stringify(sourceLogs, null, 2));
  fs.writeFileSync(path.join(outDir, 'normalized-events.json'), JSON.stringify({ generatedAt: new Date().toISOString(), window, count: normalized.length, events: normalized }, null, 2));
  fs.writeFileSync(path.join(outDir, 'quality-inspection.json'), JSON.stringify(quality, null, 2));
  fs.writeFileSync(path.join(outDir, 'scored-events.json'), JSON.stringify({ window, count: scored.length, scored }, null, 2));
  fs.writeFileSync(path.join(outDir, 'two-stage-scoring.json'), JSON.stringify(twoStage, null, 2));
  fs.writeFileSync(path.join(outDir, 'event-review-queue.json'), JSON.stringify(reviewQueue, null, 2));
  fs.writeFileSync(path.join(outDir, 'event-reviews', 'TODO.md'), eventReviewQueueMarkdown(reviewQueue));
  fs.writeFileSync(path.join(outDir, 'telegram-summary.txt'), summary + '\n');
  fs.writeFileSync(path.join(outDir, 'errors.log'), sourceLogs.filter(s => s.status === 'error').map(s => `${s.source}: ${s.error}`).join('\n'));

  console.log(`Saved artifacts: ${outDir}`);
  console.log(`Raw=${quality.counts.raw} Accepted=${quality.counts.accepted} Rejected=${quality.counts.rejected} Duplicates=${quality.counts.duplicates}`);
  console.log(`Quality: dates=${quality.acceptedQuality.withDatePct}% locations=${quality.acceptedQuality.withLocationPct}% urls=${quality.acceptedQuality.withUrlPct}%`);
  console.log(`Dedicated reviews required before send: ${reviewQueue.count} event(s). See ${path.join(outDir, 'event-reviews', 'TODO.md')}`);
  console.log('\n--- Telegram summary preview (draft, not send-ready) ---\n' + summary);
  if (!sourceLogs.some(s => s.status === 'ok' && s.count > 0)) process.exitCode = 2;
  if (!accepted.length) process.exitCode = 3;
}

if (require.main === module) {
  // Overall wall-clock watchdog: even with per-source timeouts, guarantee the
  // process never hangs forever. A loud non-zero exit (124) lets the cron's
  // failureAlert fire instead of a silent stall. Skipped for the fast fixture run.
  if (!process.argv.includes('--fixture-test')) {
    // Sized from a measured run (2026-08-05): 29 sources at ~18s each when healthy,
    // plus 4 that hang until the 90s per-source guard => ~895s for a full pass.
    // The original 600s dated from a much smaller source list; the ~20 sources added
    // in June 2026 pushed a full run past it, so every run since ~2026-07-18 aborted
    // here before writing an artifact (17 consecutive failures, silent because the
    // cron's alert was separately suppressed). Keep well under the cron's own 2700s
    // timeout so this loud exit 124 stays ours and carries a useful message.
    const MAX_RUNTIME_MS = 1800000; // 30 min
    const watchdog = setTimeout(() => {
      console.error(`Watchdog: run exceeded ${MAX_RUNTIME_MS / 1000}s, aborting (no artifact produced).`);
      process.exit(124);
    }, MAX_RUNTIME_MS);
    watchdog.unref();
  }
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { parseFrenchDate, parseInfomaniakDateRange, normalizeEvent, rejectionReason, scoreEvent, scoreEventStage1, listingView, isDataPoor, isEnrichableUrl, extractDetailFields, mergeEnrichment, selectPromising, enrichPromisingCandidates, TWO_STAGE_CONFIG, telegramSummary, eventReviewQueue, shortlistedRecommendations, isEvergreenEvent, canonicalRecommendationPool, loadManualJohanEvents, loadPrioritizedSourceCandidates, extractGrandsonCalendarOccurrences, parseGrandsonDetail, scrapeGrandson, scrapeYverdon, buildGeocityEvent, parseEmoiEvent, scrapeEmoi, yverdonVilleEventUrl, scrapeYverdonVille, scrapeInfomaniakYverdon, extractAgendaChProfiles, scrapeAgendaCh, extractLaDeriveeApiToken, parseLaDeriveeEvent, scrapeLaDerivee, parseOrbeEvent, scrapeOrbe, extractVallorbeListings, parseVallorbeDetail, scrapeVallorbe, extractSainteCroixListings, parseSainteCroixDetail, scrapeSainteCroix, parseChampventDateRanges, extractChampventNewsListings, extractChampventManifestationRows, parseChampventNewsDetail, scrapeChampvent, extractEchallensListings, parseEchallensDetail, scrapeEchallens, extractEchallensTourismeListings, parseEchallensTourismeDetail, scrapeEchallensTourisme, extractTempsLibreListings, parseTempsLibreDetail, scrapeTempsLibre, extractTheatreDuPassageFamilyListings, parseTheatreDuPassageDetail, scrapeTheatreDuPassage, extractTheatreBennoBessonListings, scrapeTheatreBennoBesson, parseEchandoleDateText, extractEchandoleListings, parseEchandoleDetail, scrapeEchandole, extractLeProgrammeVaudListings, parseLeProgrammeVaudDetail, scrapeLeProgrammeVaudKids, extractNeuchatelVilleListings, parseNeuchatelVilleDetail, scrapeNeuchatelVille, extractLePommierListings, parseLePommierDetail, scrapeLePommier, avenchesDateToIso, parseAvenchesEvent, scrapeAvenches, parseValleeDeJouxEvent, scrapeValleeDeJoux, parseFribourgHoraire, fribourgCity, parseFribourgDetail, scrapeFribourgTerroir, parsePayerneDateSentence, extractPayerneCards, scrapePayerne, parseVullyListingDate, extractVullyListings, assignVullyYears, scrapeVully, murtenMoratEventUrl, parseMurtenDetailTime, extractMurtenListings, parseMurtenDetail, scrapeMurtenMorat, chavornayEventUrl, parseChavornayDetailTime, extractChavornayListings, parseChavornayDetail, scrapeChavornay, parseLaSaugeDateLine, extractLaSaugeListings, assignLaSaugeYears, scrapeLaSauge, parseParcJuraVaudoisDate, parseParcJuraVaudoisTime, extractParcJuraVaudoisListings, assignParcJuraVaudoisYears, parseParcJuraVaudoisDetail, scrapeParcJuraVaudois, champPittetIsoDate, extractChampPittetListings, parseChampPittetDetail, scrapeChampPittet, parseOvvListingDate, parseOvvTime, ovvCityFromAddress, extractOvvListings, parseOvvDetail, scrapeOvv, parseBuskersEditions, scrapeBuskers, castrumUtcToZurichIso, extractCastrumListings, castrumEventFromRow, scrapeCastrum, parseMaisonAilleursSlugDate, maisonAilleursLead, maisonAilleursTime, maisonAilleursAgeText, maisonAilleursPrice, maisonAilleursEventFromRecord, scrapeMaisonAilleurs, haversineKm, extractJ3lFeatures, j3lScopedRows, j3lIsoDate, j3lEventFromRow, scrapeJ3l, parseGrandsonChateauDates, parseGrandsonChateauTime, extractGrandsonChateauListings, parseGrandsonChateauDetail, grandsonChateauEventsFromListing, scrapeGrandsonChateau, parseMuseeYverdonDate, extractMuseeYverdonListings, parseMuseeYverdonDetail, museeYverdonEventsFromListing, scrapeMuseeYverdon, parseBibliothequeYverdonTitleDate, extractBibliothequeYverdonListings, parseBibliothequeYverdonDetail, bibliothequeYverdonEventFromListing, scrapeBibliothequeYverdon, extractSunsetJazzDays, sunsetJazzEventFromDay, scrapeSunsetJazz, laSarrazDayFromDetails, laSarrazPrice, parseLaSarrazEvent, scrapeChateauLaSarraz, parsePomyEvent, scrapePomy };
