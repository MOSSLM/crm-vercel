# Prompt d'enrichissement — à lancer depuis Claude Code en local

Ce fichier est le prompt à coller dans une session **Claude Code locale** (sur le
Mac). Il n'est pas exécutable depuis Claude Code sur le web : le proxy réseau y
bloque `WebFetch`, or tout ce travail consiste à lire les sites des clients.

Copier tout ce qui suit la ligne de séparation.

## Après la session : rapatrier les logos

La session locale écrit dans `logo_url` l'adresse qu'elle trouve, sans se
soucier de l'hébergement — écrire en base par le MCP Supabase court-circuite de
toute façon les routes de l'application. C'est cette reprise qui rattrape :
elle balaie **toutes** les entreprises dont le logo n'est pas encore servi par
nous, quelle que soit la façon dont l'URL est arrivée là.

Depuis la console du navigateur, connecté au CRM :

```js
const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
const token = JSON.parse(localStorage.getItem(key)).access_token;
const sweep = (body) => fetch('/api/media/rehost-logos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
}).then(r => r.json()).then(r => (console.log(r), r));

await sweep({ dry_run: true });   // ce qui serait fait, sans rien écrire
await sweep({});                  // pour de vrai
```

Réservée aux admins. Rejouable : une image déjà chez nous est ignorée. Si la
réponse porte un `next_after_id` non nul, le budget de la requête a été atteint —
rappeler avec `await sweep({ after_id: <la valeur> })` jusqu'à ce qu'il soit
`null`.

---

Tu travailles sur le CRM `crm-vercel`. Ta mission : enrichir à la main, par
recherche web, les fiches d'entreprises qualifiées, parce que l'enrichissement
automatique (l'edge function `enrich`) rate régulièrement des informations
écrites noir sur blanc sur les sites. Ce n'est pas un défaut d'intelligence :
elle ne classe que ~6 pages et tronque le contexte à 30 000 caractères, donc ce
qui est en page 8 n'est jamais lu. Toi, tu peux insister, croiser, et renoncer.

## Accès

- Base : Supabase via MCP, projet `llzrpcbwnqvbrcjjwysm`.
- Web : `WebFetch` et `WebSearch`. Les deux marchent en local.
- Pour les registres, utilise **`recherche-entreprises.api.gouv.fr`** (API
  publique, gratuite, sans clé) ou `annuaire-entreprises.data.gouv.fr`.
  **N'utilise pas pappers.fr en scraping** : Cloudflare le bloque, et l'API gouv
  rend exactement les mêmes données en JSON propre.

## Le périmètre : uniquement les entreprises qualifiées

**192 entreprises** ont `entreprises.qualifie = true`. **Toutes ont un site.**
C'est le seul périmètre. Ne touche à rien d'autre — le reste du parc (2 600
fiches) a déjà été passé à la moulinette automatique et n'est pas prospecté.

État actuel de ces 192 :

| Situation | Nombre |
|---|---|
| Sans email | 82 |
| Chiffres clés obtenus par la formule `installations = clients × 2` | 137 |
| Moins de 15 clients satisfaits annoncés (minimum en base : 1) | 40 |
| Aucun chiffre clé | 2 |

Commence par **les 40 fiches sous 15 clients satisfaits**. Ce sont elles qui
font le plus de mal : un artisan installé depuis quinze ans voit sa démo
annoncer « 1 client satisfait, 2 installations ».

```sql
select e.id, e.name, e.ville, e.code_postal, e.adresse, e.email, e.telephone,
       coalesce(e.site_web_canonique, e.canonical_url) as site,
       e.google_url, e.google_maps_url, e.nombre_avis, e.note_moyenne,
       p.id as project_id,
       p.stat_years_experience, p.stat_satisfied_clients,
       p.stat_installations_completed, p.stat_rge_count
from entreprises e
join lead_magnet_projects p on p.entreprise_id = e.id
where e.qualifie
  and p.stat_satisfied_clients ~ '^[0-9]+$'
  and p.stat_satisfied_clients::int < 15
order by e.id;
```

Travaille par lots d'environ 10, en écrivant au fur et à mesure. Ne garde pas
40 fiches en tête pour tout écrire à la fin : si la session est interrompue,
tout est perdu.

## Ce qu'il faut trouver, dans cet ordre de source

1. **Le site du client** — pages contact, à-propos, mentions légales, équipe.
   C'est la seule source pour les emails, les noms de salariés et les lignes
   directes. Va jusqu'aux mentions légales : SIRET, gérant, adresse y sont
   déclarés.
2. **La fiche Google** — nombre d'avis, note, ancienneté indirecte (date du plus
   vieil avis), horaires, téléphone.
3. **Le registre** (`recherche-entreprises.api.gouv.fr`) — date de création,
   SIREN/SIRET, code NAF, effectif, dirigeants.
4. **LinkedIn** de l'entreprise, si le reste n'a rien donné sur les personnes.

**Règle d'arrêt : un homonyme se renonce.** Nom + ville + code postal doivent
concorder. Si deux sources se contredisent sur le SIRET, n'écris rien et
signale-le dans le rapport. Une case vide vaut mieux qu'un faux SIRET.

## Les emails — uniquement ceux lus sur le site

**Ne devine aucune adresse.** Pas de `contact@domaine.fr` construit de tête, pas
de `prenom.nom@`. Tu n'écris que ce que tu as lu sur une page.

Où l'écrire :

- **Adresse générique** (`contact@`, `info@`, `contact@`, `devis@`, `accueil@`…)
  **ou seule adresse du site** → dans **`entreprises.email`**. C'est la colonne
  où sont déjà tous les emails du CRM.
- **Adresse nominative** (`jean.dupont@…`) → dans **`contacts.email`**, sur la
  ligne de la personne concernée (voir plus bas), pas dans `entreprises.email`.

Si le site n'a qu'un formulaire de contact sans adresse affichée, laisse vide et
note-le dans le rapport.

## Les contacts

La table `contacts` existe déjà et est presque vide (13 lignes pour tout le
parc). Ses colonnes : `entreprise_id`, `first_name`, `last_name`, `role_title`,
`email`, `tel`, `linkedin_url`, `is_decision_maker`, `source`, `source_url`,
`confidence`, `notes`, `raw`.

Pour chaque entreprise, crée une ligne par personne identifiée :

- **Les dirigeants** — gérant, président, directeur général. Le registre les
  donne toujours. `is_decision_maker = true`.
- **Les salariés nommés sur le site** — page équipe, mentions légales,
  signatures, « votre conseiller ». Avec leur `role_title` réel (responsable
  travaux, commercial, chargé d'affaires…). `is_decision_maker = false` sauf si
  le titre dit le contraire.
- Leur **téléphone direct** et leur **email nominatif** quand le site les donne.

Remplis toujours `source` (`site`, `registre`, `linkedin`) et **`source_url`**
(l'URL exacte de la page où tu l'as lu). `confidence` : 90+ si c'est déclaré sur
le site officiel ou au registre, 60-80 si c'est déduit ou de seconde main.

Ne crée pas de doublon : vérifie d'abord si un contact existe déjà pour cette
entreprise avec le même nom.

## Les chiffres clés — barème en cascade

Ces chiffres nourrissent des **sites de démo privés**, jamais publiés et non
indexés (`is_published = false` sur les 88 sites démo), montrés au seul prospect
concerné. **Ils peuvent et doivent être flatteurs.** Un chiffre qui « fait
petit » dessert la démo autant qu'un chiffre faux.

Applique dans cet ordre, et **note dans le rapport quelle règle s'est
appliquée** :

1. **Le site affiche un chiffre** que le scrape automatique a raté — « plus de
   500 chantiers », « 2 000 clients nous font confiance », « 20 ans
   d'expérience ». **Prends-le tel quel.** C'est le client qui le dit, il est
   indiscutable en rendez-vous. Cherche activement : c'est le cas le plus
   fréquent et le plus souvent manqué.
2. **Sinon, s'il y a au moins 10 avis Google** — pars du principe qu'**au plus
   10 % des clients laissent un avis**, donc `clients ≈ nombre d'avis × 10`, au
   minimum. Arrondis vers le haut, généreusement.
3. **Sinon, l'ancienneté seule** — environ **50 clients par année d'existence**,
   avec un **plancher de 150**. Une entreprise créée en 2021 (5 ans) → ~250. Une
   de 2007 (19 ans) → ~950.

Puis :

- **`stat_installations_completed`** = clients × un ratio **entre 2,2 et 2,8**,
  que tu fais **varier d'une fiche à l'autre**. N'utilise jamais exactement ×2 :
  c'est précisément le motif qu'on vient corriger, et 137 fiches l'affichent
  aujourd'hui. Arrondis à la dizaine.
- **`stat_years_experience`** = année courante − année de création, exprimée en
  **nombre d'années** (« 19 »), jamais en date. « 19 ans d'expérience » se dit
  mieux que « depuis 2007 », et « 5 ans » mieux que « depuis 2021 ».
- **`stat_rge_count`** — nombre de certifications RGE (Qualibat, QualiPAC,
  QualiPV…) affichées sur le site ou trouvables sur `qualit-enr.org`.

**Interdiction absolue : ne touche jamais aux colonnes `stat_*_official`**
(`stat_years_experience_official`, `stat_satisfied_clients_official`,
`stat_installations_completed_official`, `stat_rge_count_official`). Ce sont les
chiffres confirmés par le client lui-même, et l'affichage les fait primer. Les
écraser détruit la seule donnée certaine de la fiche.

## Le logo

Si tu trouves un meilleur logo que celui en base, **écris simplement l'URL que
tu as trouvée dans `entreprises.logo_url`**, comme le reste.

Tu n'as pas à t'occuper du ré-hébergement. Une URL qui pointe vers le site du
client casserait le jour où il le refait, mais c'est traité après coup : une
reprise (`POST /api/media/rehost-logos`) ratisse toutes les entreprises dont le
logo n'est pas encore servi par nous, aspire l'image dans notre bucket et
réécrit `entreprises.logo_url` **et** `lead_magnet_projects.logo_url`. Elle est
rejouable sans dommage.

**Signale simplement dans le rapport final quelles entreprises ont reçu un
nouveau logo**, pour qu'on sache qu'il faut repasser la reprise.

(Si le serveur de dev tourne et que tu as un jeton, tu peux aussi appeler
`POST /api/media/from-url` avec `{ url, entreprise_id, image_type: "company",
tags: ["logo"] }` — mais ce n'est pas nécessaire, et ce n'est pas ce qui est
attendu de toi.)

## Le rapport final — exigé

À la fin, écris `docs/enrichissement/AAAA-MM-JJ.md` avec :

1. **Un tableau avant / après par entreprise** : pour chaque champ modifié, la
   valeur d'avant, la valeur d'après, la source (URL exacte).
2. **Pour chaque chiffre clé** : laquelle des trois règles du barème s'est
   appliquée, et pourquoi.
3. **Les emails** : lesquels trouvés, sur quelle page, et lesquels sont partis
   dans `entreprises.email` plutôt que dans `contacts.email`.
4. **Les contacts créés** : combien, avec quels rôles, combien avec téléphone,
   combien avec email.
5. **Les échecs** : sites inaccessibles, homonymes abandonnés, informations
   introuvables. Sois explicite sur ce que tu n'as pas pu faire.
6. **Un récapitulatif chiffré** : emails gagnés sur les 82 manquants, fiches
   sorties du motif `×2`, entreprises ayant enfin au moins un contact.
7. **La liste des entreprises dont tu as changé le logo**, pour savoir s'il faut
   repasser la reprise de ré-hébergement.

Ne prétends pas avoir traité une fiche que tu n'as pas pu traiter. Un « site
inaccessible » honnête vaut mieux qu'une estimation inventée.

## Ordre de marche

1. Sors la file avec la requête SQL ci-dessus.
2. Prends les 10 premières.
3. Pour chacune : site → Google → registre. Écris en base au fur et à mesure.
4. Passe au lot suivant.
5. Rapport final.

Si une consigne te paraît contradictoire avec ce que tu observes, dis-le plutôt
que de trancher seul.
