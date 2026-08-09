# Support de vente : audit mesuré + preview sociale

> Plan de travail. Révision du plan initial après relecture du code et **du kit
> d'identité `Sama_Visual_identity2` (dossier `07 Audit/`)**, qui change la nature
> du lot 3.
>
> **Les quatre lots sont implémentés.** Voir « État de l'implémentation » ci-dessous
> pour les migrations à appliquer et les écarts constatés en chemin.

---

## État de l'implémentation

Les quatre lots sont livrés. `npm run typecheck`, `npm test` (1854 tests) et
`next lint` passent.

### Migrations à appliquer, dans cet ordre

| Fichier | Effet si non appliquée |
|---|---|
| `sql/20260810_sites_og.sql` | La carte OG est fabriquée à chaque unfurl au lieu d'être servie par le CDN (plus lent, jamais blanc). Publication **non affectée** — voir l'écart n°1. |
| `sql/20260810_audit_site.sql` | Badge CRM caché, rapport « analyse indisponible », cron en 503 explicite. |
| `sql/20260810_audit_site_cron.sql` | Pas de passage automatique. ⚠️ Remplacer `<PG_CRON_SECRET>` avant exécution. |
| `sql/20260810_rapport_public.sql` | Pas de lien rapport ; `{{lien_audit}}` retombe sur le PDF. |

`sql/RATTRAPAGE_colonnes_sites.sql` a été mis à jour (constat + `alter`).

### Écarts par rapport au plan, constatés en implémentant

1. **`publishSite` aurait rendu tout site impubliable.** Le plan demandait
   d'invalider `og_image_url` à la publication. Un `update` nommant une colonne
   absente échoue **entièrement** — c'est exactement la panne déjà vécue avec
   `paywall_enabled`. Ajout de `updateDroppingMissingColumns`, pendant en écriture
   de `selectDroppingMissingColumns`.

2. **`attachAudit` attachait le rapport web sous le nom `audit.pdf`.** Faire
   pointer `{{lien_audit}}` vers le rapport web suffisait à casser la pièce jointe
   des séquences e-mail. `auditUrl` (le lien) et `auditPdfUrl` (le fichier) sont
   désormais deux champs distincts dans `engine.ts`.

3. **Labels réservés : corrigé dans `uniqueSubdomain`, pas dans les appelants.**
   Le plan proposait d'injecter `RESERVED_SUBDOMAINS` dans le `taken` de chaque
   route de déploiement. Le faire dans la fonction ferme le trou pour tous les
   appelants, présents et futurs — y compris ceux qu'on oublierait.

4. **Unité cohérente sur une ligne de preuve.** Un test a révélé « 900 ms » affiché
   face à un seuil « 2,5 s » : on demandait au prospect de convertir de tête au
   moment de lui faire accepter le verdict. Le formateur reçoit désormais
   l'échelle de la ligne, pas chaque nombre isolément.

5. **Le rapport ne dépend pas d'un document rédigé.** Le plan supposait un
   `audits` existant. La page rend les mesures, le démo et l'appel à l'action dans
   tous les cas, et n'ajoute le deck que si un `audits` existe — sans quoi on ne
   pourrait envoyer un rapport qu'aux prospects pour lesquels quelqu'un a déjà
   rédigé six pages, donc jamais en démarchage froid.

6. **`AuditWorkspace` lit l'analyse via l'API**, pas en direct : c'est l'API qui
   applique la règle de publication et la cohabitation PSI. Les dupliquer côté
   client aurait garanti qu'elles divergent.

### Ce qui reste à faire à la main

- **Verser les deux TTF** dans `src/lib/og/fonts/` (Cormorant Garamond Light,
  DM Sans Regular/Medium) pour la fidélité de marque des cartes. Sans eux, la
  chaîne fonctionne avec le Noto Sans embarqué par `next/og`.
- **Tourner le secret pg_cron** (voir Risques) — il est dans l'historique git.
- **Le test qui compte** : passer une URL démo dans une vraie conversation
  WhatsApp. Aucun test automatisé ne le remplace.

---

## Ce qui change par rapport au plan initial

Sept modifications, par ordre d'impact. Le reste du plan initial est conservé.

| # | Point | Plan initial | Ici |
|---|---|---|---|
| 1 | **Page rapport** | À concevoir | Elle **existe déjà** dans le kit (`07 Audit/audit-mobile.{js,css}`) : rendu vertical 390×844, mêmes variables `page1…page6` que l'éditeur. Lot 3 = **portage**, pas conception. |
| 2 | **Modèle de contenu** | Un contenu « rapport » distinct du deck | **Un seul document, deux rendus.** Le web et le PDF lisent le même `audits.content`. Les notes sont des écrans **injectés** dans la séquence. |
| 3 | **Cache WhatsApp** | Chemin de storage fixe + `immutable` | Défaut bloquant : WhatsApp met en cache par URL. Chemin **haché par contenu**, sinon la republication n'a aucun effet visible. |
| 4 | **La preuve** | « champ `confiance` » | Chaque note porte sa **preuve mesurée** dans le modèle de données, pas en texte libre. Une note sans preuve ne s'affiche pas. |
| 5 | **L'argument** | 4 notes sur le site du prospect | **5ᵉ signal : la comparaison.** Le même analyseur tourne sur le site actuel **et** sur le démo qu'on lui a fait. C'est l'argument de vente le plus fort et il coûte un run. |
| 6 | **Capture mobile** | Lot 3 (illustration) | **Lot 2 (mesure).** Une capture 390 px du site actuel est à la fois le signal « mobile » le plus défendable et l'image « avant ». |
| 7 | **Catalogue** | 6 clés | **7ᵉ clé `no_site_or_unreachable`** — le cas le plus fréquent et le plus vendable du parc n'est pas représentable aujourd'hui. |

Deux corrections de justesse sur des affirmations du plan initial :

- `next/og` n'est pas « présent dans `node_modules` » — il est **livré avec Next 15.4**, donc pas de dépendance nouvelle. (`node_modules` n'est pas installé dans le conteneur de rédaction, l'affirmation n'a pas pu être revérifiée ; la conclusion pratique est la même.)
- Le logo SAMA **n'a pas besoin d'un dérivé PNG** : `LOGO_PATH` (`AuditShared.tsx:14`) est une chaîne de `path` que satori rend en `<svg>` **inline** sans difficulté. La limitation satori porte sur les SVG **distants** (`<img src="…svg">`). Seul le logo **du client** doit être normalisé en PNG.

---

## Contexte

Le site démo est au niveau. Ce qui manque, c'est l'emballage commercial autour du
lien qu'on envoie. Deux manques, tous les deux vérifiés dans le code :

**1. Le lien démo n'a aucune preview sociale exploitable.**
`src/lib/site-builder/build-page-metadata.ts:31` retombe sur `site.logoUrl` en le
déclarant `width: 1200, height: 630` (`:34`) — un logo carré annoncé en 1200×630.
Sur WhatsApp : vignette étirée, ou rien. Pire,
`src/app/(public)/preview/[siteId]/[[...path]]/page.tsx:55` exporte un `metadata`
**statique** réduit à `robots: noindex` — ni titre, ni image. Or `demoShareUrl()`
(`SiteKanban.tsx:43`) renvoie précisément l'URL de preview `{siteId}.{SITE_DOMAIN}`
tant que le site n'est pas publié : une bonne partie des liens envoyés s'affichent
en URL nue.

**2. L'« audit » ne mesure rien.**
`sql/20260424_audits.sql` + `src/components/audit/AuditPage1..6.tsx` produisent une
proposition commerciale de 6 pages A4, entièrement rédactionnelle.
`src/data/auditIssues.ts:13-17` annonce que les clés sont pré-cochées par
« `edge function enrich/audit.ts` (AUDIT_ISSUE_KEYS) » — **ce fichier n'existe pas**
(`edge function enrich/` contient `address, communes, db, geo, google, index, llm,
metrics, page-discovery, scraper, types, url-variants`). Le côté lecture est pourtant
câblé : `AuditWorkspace.tsx:89` lit `lead_magnet_projects.variables.audit_detected_issues`
et `AuditEditorPage.tsx:146 applyDetectedIssues()` l'applique. **Personne n'écrit
jamais cette clé.** Aucun code `lighthouse` / `pagespeed` / `web-vitals` dans le dépôt.
Et l'audit se partage en **PDF** (`audits.pdf_url` → `{{lien_audit}}`,
`WhatsAppTab.tsx:76`) : sur WhatsApp, un téléchargement, pas une preview.

**Résultat visé** : un lien WhatsApp qui s'affiche avec une carte soignée, et un
**rapport d'audit web public** affichant des notes réellement mesurées sur le site
actuel du prospect — gratuitement, en masse, sur les ~2 800 entreprises du parc.

**Arbitrages :**
- Les notes vivent sur une **page web publique partageable**, mobile-first. Le deck 6 pages lit les mêmes chiffres.
- Mesure = **analyseur maison** (gratuit, illimité, en masse) + **PageSpeed Insights à la demande**, mis en cache, pour les entreprises réellement démarchées.
- Preview sociale = **carte OG pré-générée**, capture du démo intégrée, repli automatique sans capture.

---

## Découpage en 4 lots

| Lot | Livrable | Utile seul ? |
|---|---|---|
| 1 | Preview sociale des liens démo (publiés **et** brouillons) + dialogue « Partager » | Oui — chaque lien envoyé devient présentable |
| 2 | Analyseur maison + captures + table + passage en masse | Oui — notes visibles dans le CRM, priorisation du démarchage |
| 3 | Rapport public `rapport.{SITE_DOMAIN}/{token}` (portage du rendu mobile du kit) | Oui — le support de vente demandé |
| 4 | PSI à la demande + report des chiffres dans le deck + messagerie | Finition |

---

# Lot 1 — Preview sociale du lien démo

## 1.1 Le piège à éviter d'abord

**Ne pas utiliser la convention de fichier `opengraph-image.tsx`.** Next génère
alors `/site/{subdomain}/opengraph-image`. Sur l'hôte `{subdomain}.{SITE_DOMAIN}`,
`src/middleware.ts:26-34` réécrit tout chemin sans point en `/site/{subdomain}` +
chemin → `/site/foo/site/foo/opengraph-image` → 404. S'ajoute l'absence de
`metadataBase` sur les routes `(public)`, qui empêche Next de produire une URL
absolue.

→ **Route API** (`src/middleware.ts:14` saute déjà `/api`), URL absolue écrite
nous-mêmes.

## 1.2 Chaîne de production de l'image

Trois étages, idempotents et tolérants à la panne.

**a) La capture** — étendre `src/lib/site-builder/render-provider.ts` d'un mode vignette :

```ts
export async function renderViewportShot(
  url: string,
  opts?: { width?: number; height?: number; signal?: AbortSignal },
): Promise<RenderedVisual>   // image/jpeg
```

ScreenshotOne accepte `format=jpg&full_page=false&viewport_width=…&viewport_height=…&image_quality=82`
— même clé `RENDER_API_KEY`, même garde `renderProviderConfigured()` (`:45`).
Ajouter un **second provider gratuit sans clé** pour que la fonctionnalité marche
sans abonnement : `thum.io`, déjà utilisé dans le dépôt
(`src/components/audit/AuditPage1.tsx:22`, `src/utils/audit/htmlPage1.ts:14`).
Sélection : `RENDER_API_KEY` présent → ScreenshotOne, sinon thum.io.

> **Deux corrections à faire au passage sur l'usage actuel de thum.io.** Aujourd'hui
> il est appelé depuis un `<img>` **côté navigateur**, avec l'URL du prospect en clair
> dans le HTML : un tiers non authentifié, sans SLA, voit passer chaque URL de
> prospect, et rien n'est mis en cache. Sur 2 800 entreprises il limitera. La capture
> passe donc **côté serveur** et le résultat atterrit dans notre bucket ; le deck et
> le rapport lisent notre URL, plus celle de thum.io.

**b) Le stockage** — `src/lib/site-builder/ensure-demo-screenshot.ts` :
- capture l'URL publique du démo (`demoShareUrl()`),
- passe l'image par `sharp` (déjà en dépendance, `package.json:75`) : largeur 1200, JPEG q80, cap ~250 Ko,
- dépose dans le bucket **`site-builder-assets`** sous `og/{siteId}/shot-{hash}.jpg` (bucket et helpers en place : `sql/20260514_site_builder_assets.sql`),
- écrit `sites.og_shot_url` + `sites.og_shot_at`,
- **n'échoue jamais** : toute erreur est journalisée et renvoyée en `null`, même discipline que `ensure-hosted-logo.ts` qui ne bloque jamais la publication.

**c) La normalisation du logo client** — piège satori : `optimizeImageUpload`
(`src/lib/images/optimize-image.ts:146-157`) produit du **WebP** sauf pour les PNG
réellement transparents, et laisse les **SVG** intacts. Satori ne sait afficher ni
l'un ni l'autre en `<img>` distant. D'où un dérivé dédié :
`src/lib/site-builder/ensure-og-logo.ts` → sharp → PNG ≤ 320 px →
`og/{siteId}/logo.png` → `sites.og_logo_url`.
(Le logo **SAMA**, lui, est un `path` inline — aucun traitement.)

## 1.3 La carte OG

`src/lib/og/render-card.tsx` — **socle commun** : chargement des polices, rendu
`ImageResponse` (`next/og`, livré avec Next 15.4), dépôt dans le bucket, calcul du
hash, écriture de la colonne. Deux gabarits par-dessus : `demo-card.tsx` (lot 1) et
`rapport-card.tsx` (lot 3). Le plan initial les traitait séparément et aurait
dupliqué toute la plomberie.

**Polices.** Le kit fixe la typographie : **Cormorant Garamond** (display) + **DM
Sans** (texte) — `07 Audit/Audit Mobile WhatsApp.html:10`, `AuditShared.tsx`.
Satori exige des `ArrayBuffer` TTF/OTF et `src/lib/site-builder/google-fonts.ts` ne
produit que des `href` CSS. Verser donc les deux TTF dans `src/lib/og/fonts/`, lus
par `fs.readFile` en runtime Node. Noto Sans suffit pour valider la chaîne au
premier jet ; la fidélité de marque vient juste après.

Contenu, dans l'ordre de lisibilité sur une vignette WhatsApp de ~250 px de large :
- fond dans la couleur primaire du site (`ResolvedSite.publishedStyleGuide ?? styleGuide`), dégradé sombre ;
- **logo client** (PNG normalisé) + **nom de l'entreprise** en gros ;
- ligne secondaire : ville + jusqu'à 3 `service_tags` ;
- note Google (`note_moyenne` / `nombre_avis`) si présente ;
- à droite, la **capture dans un cadre navigateur** — reprise du mockup déjà dessiné dans `AuditPage1.tsx:82-116` et `audit-mobile.css` (`.mockup-chrome`, `.mockup-url`, `.mockup-screen`), donc cohérent avec le deck ;
- pastille SAMA discrète (`LOGO_PATH` inline).

**Repli** : si `og_shot_url` est absent, variante sans mockup — logo + nom centrés,
services en pastilles, couleur du site en fond. Une seule fonction, un `if`, jamais
d'image blanche.

## 1.4 Servir l'image — et le piège du cache

`src/app/api/og/demo/[siteId]/route.tsx` :
1. `sites.og_image_url` existe → `buildPageMetadata` pointe **directement** l'URL publique du storage ; la route n'est appelée qu'à la première fabrication ;
2. sinon → génère, dépose, écrit la colonne, renvoie l'image en `Cache-Control: public, max-age=31536000, immutable`.

Persister plutôt que générer à la volée, parce que le crawler WhatsApp n'exécute pas
de JS et abandonne vite : une URL de storage est servie par le CDN Supabase, sans
invocation de fonction. C'est ce qui garantit « jamais blanc ».

> **Défaut du plan initial, à corriger ici.** Un chemin de storage **fixe**
> (`og/{siteId}/card.png`) servi en `immutable` est définitivement périmé dès la
> première régénération : WhatsApp met en cache **par URL** et ne redemandera
> jamais. L'opérateur republie, la carte ne change pas, et le symptôme ressemble à
> « le correctif n'a pas marché ».
> → **Le nom du fichier porte un hash du contenu** : `og/{siteId}/card-{hash}.png`.
> `og_image_url` change à chaque régénération, donc l'unfurl aussi. Les anciennes
> cartes restent servies pour les messages déjà envoyés (c'est souhaitable) ;
> un nettoyage périodique les retire au-delà de 90 jours.

**Contraintes WhatsApp à respecter, faute de quoi rien ne s'affiche** : image en
`image/png` ou `image/jpeg` (pas de WebP), **≤ ~600 Ko** (viser 300 Ko), servie sur
**HTTPS sans redirection**, `og:image` en **URL absolue**, `og:title` et
`og:description` présents. La cible est donc ~1200×630 en PNG optimisé.

**Quand générer — le point délicat.** Surtout **pas** de capture synchrone dans
`publishSite()` : une capture prend plusieurs secondes, et `publishSite` est appelé
en boucle par `src/app/api/site-builder/sites/[siteId]/deploy-batch/route.ts` — un
déploiement de 50 sites partirait en timeout. `publishSite` **invalide** seulement
(`og_image_url = null, og_shot_url = null`), comme le font déjà
`rebuild-site-from-template.ts` et `republish-after-enrichment.ts`.

La génération est déclenchée par **l'action humaine qui précède l'envoi** : à
l'ouverture du dialogue « Partager » (§1.6), `POST /api/og/demo/{siteId}/prepare`.
Le dialogue affiche la vraie carte pendant qu'elle se fabrique, et l'image est sur
le CDN avant que WhatsApp ne soit ouvert. C'est le bon moment : c'est exactement
l'information dont l'opérateur a besoin à cet instant.
Filet pour les envois automatiques (séquences), qui ne passent pas par le dialogue :
un petit lot dans le cron du lot 2 traite les sites publiés dont `og_image_url is null`.
Et si la carte manque au moment de l'unfurl, la route la génère à la volée — plus
lent, jamais blanc.

## 1.5 Brancher les métadonnées

- `build-page-metadata.ts` : remplacer le repli `site.logoUrl` (`:31`) par `site.ogImageUrl ?? <URL de la route API>`, **n'annoncer `width/height` que quand l'image est connue** (`:34`), ajouter `metadataBase`.
- `src/app/(public)/preview/[siteId]/[[...path]]/page.tsx:55` : remplacer le `metadata` statique par un `generateMetadata()` qui **garde** `robots: noindex` et **ajoute** titre + description + og:image. `noindex` n'empêche pas l'unfurl WhatsApp — c'est exactement le cas d'usage : lien privé, joliment déplié.
- `src/lib/site-resolver.ts` : exposer `ogImageUrl` / `ogShotUrl` sur `ResolvedSite`, **avec `?? null`** — règle `src/lib/schema-drift.ts`, toute colonne de `sites` peut manquer en base.

## 1.6 Le dialogue « Partager »

Il appartient au lot 1 parce qu'il en est le déclencheur (§1.4) et la vérification :
sans lui, personne ne voit jamais la carte avant de l'envoyer.

- **Dédupliquer `demoShareUrl()` d'abord** : un seul `src/lib/site-builder/demo-share-url.ts`, importé par `SiteKanban.tsx:43` et `espace-agent/entreprises/[id]/page.tsx:44` (copies verbatim aujourd'hui).
- `src/components/site-builder/PartagerDemoDialog.tsx` — ouvert depuis la carte du kanban (à côté du bouton « Lien »), la cellule « site » de `PipelineMatrix` (`case "site"`, ~:571) et la carte « Site démo » de la fiche agent. Il montre **la vraie image OG** (pas une maquette), le lien avec « Copier », et « Ouvrir WhatsApp » via `buildWhatsAppUrl()` + `POST /api/messages/log`.

Le reste du travail de messagerie attend le lot 4, qui dépend du rapport.

## 1.7 Migration

`sql/20260810_sites_og.sql` — `alter table public.sites add column if not exists
og_image_url text, og_shot_url text, og_logo_url text, og_generated_at timestamptz,
og_shot_at timestamptz`. **Ajouter ces colonnes à `sql/RATTRAPAGE_colonnes_sites.sql`**
(la liste du constat *et* les `alter`) : c'est le fichier qui évite de refaire la
panne décrite dans `docs/site-builder-v2.md:155-172`.

---

# Lot 2 — L'analyseur

## 2.1 Le module

`src/lib/audit-site/` — même séparation que `donnees-publiques` :

| Fichier | Rôle |
|---|---|
| `collect.ts` | Va chercher la page et mesure. Chronomètre TTFB, temps de corps complet, octets — mêmes grandeurs que `scripts/perf/preview-budget.mjs`. Récupère `robots.txt` et l'existence de `sitemap.xml`. |
| `analyze.ts` | Parse avec `node-html-parser` (déjà en dépendance, `package.json:65`) et produit des **signaux bruts** — booléens et nombres, sans jugement. |
| `score.ts` | **Fonction pure** signaux → `{ notes, preuves, alertes, issueKeys, confiance }`, dans la forme de `src/lib/donnees-publiques/score.ts` (« un score nu ne se conteste pas, un score décomposé se relit »). Aucun réseau, testable en Jest. |
| `shot.ts` | Capture 390 px du site actuel (§2.4), via la chaîne du lot 1. |

**Pré-requis : extraire le fetch durci.** `src/lib/site-builder/fetch-page-html.ts`
contient exactement la garde qu'on veut — `assertPublicHost` (`:114`) avec
résolution DNS et revalidation après redirection (`:220`), `BROWSER_HEADERS` (`:53`),
`BLOCK_MARKERS` Cloudflare/DataDome/PerimeterX (`:69`), variantes www/apex via
`buildUrlCandidates` (importé de `@/lib/http/url-variants`, `:19`) — mais tout est
**privé au module**, et sa fonction publique `fetchPageHtml()` (`:212`) ne convient
pas : elle **jette** sur 403/429/503 (un blocage anti-robot est une **donnée**
d'audit, pas une erreur) et renvoie du HTML **normalisé et allégé** pour l'import IA
(`normalizeImportedHtml` + `slimImportHtml`), ce qui détruit précisément les balises
qu'on veut analyser.

→ Déplacer `assertPublicHost`, `BROWSER_HEADERS`, `BLOCK_MARKERS` et `reachPage`
dans **`src/lib/http/reach-page.ts`** (le dossier existe déjà : `url-variants.ts`),
faire importer `fetch-page-html.ts` depuis là — **aucun changement de comportement
pour l'import**, c'est la condition de sûreté du refactor. L'analyseur consomme la
réponse brute et chronomètre lui-même.

## 2.2 Les cinq axes

Les quatre premiers sont calculables depuis HTML + en-têtes + chronométrage : gratuits
et illimités.

**Vitesse /100** — TTFB, temps de corps complet, poids du document, nombre de
scripts/CSS bloquants dans le `<head>`, images sans `loading="lazy"`, présence de
`content-encoding` et de `cache-control`.

**SEO /100** — `<title>` présent et de longueur raisonnable, `meta description`,
`h1` unique, `canonical`, `lang`, absence de `noindex`, `robots.txt`, `sitemap.xml`,
JSON-LD `LocalBusiness`/`Organization`, NAP (nom + adresse + téléphone) présents dans
la page, `alt` sur les images, HTTPS.

**Mobile /100** — `meta viewport`, `@media` dans le CSS inline, attributs de largeur
fixe, tailles de police en dur trop petites, éléments à largeur fixe > 480 px —
**et la capture 390 px** (§2.4), qui est le seul signal de rendu réel.

**Confiance & conversion /100** — lien `tel:` cliquable, formulaire ou `mailto:`,
avis/témoignages détectés (§2.3), mentions légales, bandeau cookies/RGPD, réseaux
sociaux, nombre et libellé des appels à l'action.

**Global /100** = moyenne pondérée — vitesse 30 / SEO 30 / mobile 20 / conversion 20
— plus un libellé qualitatif à 5 niveaux pour l'affichage court.

### Le 5ᵉ signal : la comparaison (nouveau)

C'est l'ajout le plus rentable du lot, et il ne coûte qu'un run supplémentaire sur un
site **qu'on héberge** : faire tourner **le même analyseur, avec les mêmes seuils,
sur le site démo** qu'on a construit pour ce prospect.

Le résultat est l'argument de vente en une image — « votre site : 41/100 · votre
nouveau site : 96/100 » — et il est **défendable sans discussion**, puisque c'est la
même mesure des deux côtés. Aucun paragraphe de vente ne fait ce travail-là.

Stockage : `note_globale_demo`, `notes_demo jsonb`, `demo_analyse_le`, `demo_site_id`.
Le run démo est déclenché avec celui du prospect quand un démo publié existe, et
rafraîchi à la republication du démo.

## 2.3 Honnêteté des signaux — contrainte de conception, pas intention

Ce qu'on mesure vraiment et qu'on peut défendre devant un prospect : TTFB, poids,
HTTPS, viewport, balises SEO, JSON-LD, `tel:`, formulaire, mentions légales,
`robots.txt` / `sitemap.xml`, et la capture mobile.

Ce qu'on **ne prétendra pas** mesurer sans PSI : Core Web Vitals (LCP/CLS/INP),
accessibilité réelle, vitesse ressentie après exécution du JS.

**Trois garde-fous, dans le modèle de données :**

1. **Toute note porte ses preuves.** `detail` n'est pas du texte libre mais une liste
   d'entrées `{ cle, libelle, valeur, seuil, poids, verdict }`. La page rapport rend
   la preuve à côté de la note (« 4,2 s pour afficher la page — seuil 2,5 s »).
   **Une entrée sans `valeur` mesurée ne s'affiche pas.** C'est ce qui rend le
   rapport tenable en rendez-vous.

2. **Le SPA baisse la confiance, il ne baisse pas la note.** Un site en SPA renvoie
   un HTML quasi vide : peu de texte + gros bundle JS → `confiance.seo = "faible"`.
   L'axe passe alors sous le seuil de publication et **n'apparaît pas** sur la page
   plutôt que d'affirmer « pas de contenu SEO ». Le CRM, lui, affiche « analyse
   partielle » — sinon l'opérateur envoie un rapport accablant à un prospect dont le
   site va très bien.

3. **Les avis ne sont pas déclarés absents à la légère.** Ils vivent le plus souvent
   dans un widget JS (Trustindex, Elfsight, SociableKit, embed Google). Avant de
   conclure `no_reviews_on_site`, **détecter ces scripts par domaine** ; s'ils sont
   là, la clé n'est pas émise. Dire à un artisan que ses avis manquent alors qu'ils
   sont sur sa page suffit à discréditer tout le rapport.

## 2.4 La capture mobile — remontée du lot 3

Une capture 390 px du **site actuel** du prospect, via `renderViewportShot()` du lot 1,
déposée en `audit/{entrepriseId}/actuel-{hash}.jpg`.

Elle rend deux services pour un coût :
- **signal** — c'est la seule mesure de rendu mobile réelle qu'on ait sans PSI ;
- **preuve** — c'est l'image « avant » de l'écran comparatif du rapport (§3.3).

Elle n'est prise que pour les entreprises **réellement démarchées**, pas sur le parc
entier : déclenchée par le dialogue « Partager », par l'ouverture du rapport, ou par
le bouton « Analyser » — jamais par le cron de masse.

## 2.5 Remplir enfin `audit_detected_issues`

Le scoreur émet les clés de `src/data/auditIssues.ts` depuis les mesures :

| Clé | Émise quand |
|---|---|
| `slow_site` | TTFB / poids au-delà du budget |
| `outdated_or_not_mobile` | viewport absent, largeurs fixes, capture 390 px débordante |
| `phone_not_clickable` | téléphone en texte, pas de `tel:` |
| `form_not_accessible` | aucun `<form>` ni `mailto:` |
| `weak_cta` | moins de N liens d'action |
| `no_reviews_on_site` | `entreprises.nombre_avis > 0`, rien dans la page **et** aucun widget d'avis détecté |
| **`no_site_or_unreachable`** *(nouveau)* | pas de `site_web_canonique`, ou site injoignable / 4xx-5xx persistant |

**La 7ᵉ clé manque au catalogue et c'est le cas le plus vendable du parc** : « vous
n'avez pas de site » ou « votre site ne répond plus » n'est aujourd'hui représentable
par aucune carte. Ajouter l'entrée à `AUDIT_ISSUE_CATALOG` avec sa solution pairée —
l'ajout est purement additif : `normalizeIssueKeys` filtre sur le catalogue,
`DEFAULT_SELECTED_ISSUE_KEYS` n'est pas touché, `backfillProblemKeys` continue de
rapprocher par titre.

**Écriture — une seule fois, au bon endroit.** Le plan initial écrivait dans
`lead_magnet_projects.variables.audit_detected_issues` au lot 2 puis basculait la
lecture vers la table au lot 4. Faire les deux d'un coup :
- source de vérité = `entreprises_audit_site.issue_keys` ;
- `AuditWorkspace.tsx:89` lit la table **d'abord**, `lmp.variables` en **repli** (les audits déjà enrichis continuent de fonctionner) ;
- écriture miroir dans `lmp.variables` conservée pour compatibilité, sans être lue en premier.

## 2.6 Schéma

`sql/20260810_audit_site.sql` — table **1:1 possédée par l'API**, même discipline que
`entreprises_donnees_publiques` (`sql/20260808_donnees_publiques_siret.sql`) : rien
d'humain n'y écrit.

`entreprises_audit_site` :
`entreprise_id bigint pk references entreprises(id) on delete cascade`,
`url_analysee text`, `url_finale text`, `http_status int`, `bloque boolean`,
`note_globale int`, `note_vitesse int`, `note_seo int`, `note_mobile int`,
`note_conversion int`, `detail jsonb`, `confiance jsonb`, `alertes jsonb`,
`issue_keys text[]`, `signaux jsonb`, `ttfb_ms int`, `chargement_ms int`,
`poids_octets bigint`, `capture_url text`, `capture_le timestamptz`,
`note_globale_demo int`, `notes_demo jsonb`, `demo_site_id uuid`, `demo_analyse_le timestamptz`,
`analyse_le timestamptz`, `expire_le timestamptz`, `tentatives int default 0`,
`derniere_erreur text`.

Colonnes PSI (lot 4) : `psi_performance int`, `psi_seo int`, `psi_accessibilite int`,
`psi_bonnes_pratiques int`, `psi_lcp_ms int`, `psi_cls numeric`, `psi_tbt_ms int`,
`psi_strategie text`, `psi_recupere_le timestamptz`.

Plus :
- une vue `v_audit_site_a_rafraichir` qui porte **en SQL** la règle de péremption (jamais analysé d'abord, puis périmé, puis `site_web_canonique` modifié depuis l'analyse) — comme `v_donnees_publiques_a_rafraichir`, pour ne pas dupliquer le `where` en TS ;
- une ligne de réglages `audit_site_settings {id:'global', lot_max int default 30, actif boolean default true}` ;
- RLS `for all using (auth.role() = 'authenticated')`, comme les tables voisines.

**Dégradation** : table nouvelle, lue à part. Migration non appliquée → tout ce qui en
dépend s'éteint proprement : le badge CRM se cache (motif `EmailVerdictBadge` avec
`available=false`), la page rapport renvoie « analyse indisponible ». **Aucune colonne
ajoutée à `entreprises`**, donc aucun risque sur `site-resolver` ni sur les `select`
explicites de `resolve-variables.ts:85`.

## 2.7 Passage en masse

`src/lib/audit-site/service.ts` — `chargerCibles(sb, lotMax)` /
`analyserLot(sb, cibles, {declencheur, budgetMs})`, calqué sur
`src/lib/donnees-publiques/service.ts` (mêmes propriétés : idempotence, aucune
écriture hors périmètre, cadences séparées).

`src/app/api/cron/audit-site/route.ts` — `runtime nodejs`, `maxDuration = 60`,
`BUDGET_MS = 45_000`, vérification `x-pg-cron-secret` / `CRON_SECRET` (copier
`verifyCron` de `src/app/api/cron/donnees-publiques/route.ts:39`), réponse qui
**rapporte toujours** `candidats_a_rafraichir` pour distinguer « file vide » de
« file cassée ».

`sql/20260810_audit_site_cron.sql` — pg_cron à la **minute 23**
(`donnees-publiques-tick` occupe `7 * * * *`, les autres jobs `*` et `*/5`).

> ⚠️ **Ne pas recopier le secret en clair** comme le fait
> `sql/20260808_donnees_publiques_cron.sql:35`. Utiliser `<PG_CRON_SECRET>` et
> documenter le remplacement. Voir §Risques : le secret existant est dans
> l'historique git et doit être tourné.

**Déclenchement manuel depuis la sélection** : ajouter `onAnalyserSites` à
`BulkHandlers` (`src/components/marketing-pipeline/types.ts:120`) et un bouton
**« Analyser les sites »** dans `BulkBar` (`PipelineMatrix.tsx:787-935`), sur le
modèle de `regenerateSites` (`MarketingWebPipeline.tsx:528-600`) : traitement par
paquets, toast de progression, échecs **nommés**.

## 2.8 Restitution dans le CRM

`src/components/audit-site/NoteSiteBadge.tsx` — pastille `pill ok/warn/danger`
(`mp-skin.css`) affichant `72/100`, infobulle avec la décomposition
`vitesse 64 · SEO 81 · mobile 55 · conversion 88`, mention **« analyse partielle »**
quand un axe est sous le seuil de confiance, bouton « ré-analyser ». Se cache si la
table n'existe pas. À poser dans `RowHead` du pipeline marketing et dans la fiche
entreprise de l'espace agent.

---

# Lot 3 — Le rapport public

## 3.1 Ce lot est un portage, pas une conception

Le kit d'identité contient déjà le rendu :

| Fichier du kit (`07 Audit/`) | Ce que c'est |
|---|---|
| `audit-mobile.js` | `buildScreens(content)` → une suite d'écrans 390×844, **un message par écran** : couverture, site démo (avec chrome navigateur), contexte, citation, solutions, livrables, investissement, étapes, contact. Découpage automatique des listes (`chunk`), donc ajouter une carte dans l'éditeur ajoute un écran. |
| `audit-mobile.css` | Le style complet, dans la palette du deck (`--nuit #0B1D3A`, `--azur #3A7BD5`, `--brume #B5D0F0`, `--creme #F4F1EB`), Cormorant Garamond + DM Sans. |
| `audit-lib.js` | En-tête du fichier : *« miroir de `src/utils/audit/htmlShared.ts` … Portable tel quel dans `src/utils/audit/` »* — `esc`, `logoSvg`, `getServices`, `calcTotal`, `fmtEur`, grain, `browserChrome`. |
| `audit-content.js` | En-tête : *« miroir exact de `AuditContent` (`src/lib/audit/default-content.ts`). Toutes les variables de l'éditeur sont ici : page1…page6 + global_style »*. |

Autrement dit **le rendu mobile consomme déjà exactement `audits.content`**. Le
travail est :

1. `src/utils/audit/htmlMobile.ts` — portage de `audit-mobile.js`, à côté de `htmlPage1..6.ts`, typé sur `AuditContent`, réutilisant `htmlShared.ts` (`esc`, `logoSvg`, `getServices`, `calcTotal`, `fmtEur`, `makeGrainSvgUrl`) au lieu de redéfinir ces fonctions ;
2. `src/app/(public)/rapport/[token]/` — `page.tsx` + `layout.tsx` **propres au groupe `(public)`**, qui ne charge ni `globals.css` ni polices : le CSS mobile est embarqué comme pour les sites clients ;
3. l'injection des écrans de notes (§3.3).

Bénéfice secondaire : le PDF A4 et le rapport web restent cohérents par
construction, puisqu'ils lisent le même document et partagent les mêmes helpers.

## 3.2 Hôte, URL, jeton

**`https://rapport.{SITE_DOMAIN}/{token}`.**

Pourquoi : le wildcard `*.samadigitalstudio.fr` est déjà branché sur Vercel
(`docs/site-builder-v2.md:138-150`) → **zéro travail DNS**. Domaine parlant pour un
prospect, contrairement à `app.…`. Et ça ne touche pas au routage des sites clients.

- `src/lib/site-domain.ts` : ajouter `PUBLIC_SUBDOMAINS = new Map([["rapport", "/rapport"]])` à côté de `CRM_SUBDOMAINS` (`:24`).
- `src/middleware.ts` : avant le test « sous-domaine client » (`:26`), si le sous-domaine est dans cette table → `rewrite` vers `/rapport{pathname}`.
- **Réserver le label.** `src/lib/site-builder/derive-subdomain.ts` n'a **aucune liste de labels réservés**, et le `taken` de `deploy/route.ts:52` ne contient que les sous-domaines déjà pris. Un client dont le site est `rapport.fr` — ou `app.fr` — s'approprierait l'hôte. Ajouter `RESERVED_SUBDOMAINS = CRM_SUBDOMAINS ∪ PUBLIC_SUBDOMAINS` et l'injecter dans `taken` dans `deploy/route.ts` **et** `deploy-batch/route.ts`. C'est la correction d'un défaut latent qui existe déjà pour `app`.

**Ancrage — révisé.** Le plan initial créait une table `rapports_publics` avec
`entreprise_id`, `site_id`, `offre_id`, `cree_par`. C'est un troisième ancrage pour
le même objet, alors que le deck est ancré sur `audits.opportunite_id` (`TEXT UNIQUE`,
donc il exige une opportunité) et la mesure sur `entreprises`.

Simplification : **une table 1:1 sur l'entreprise, comme ses sœurs.**

`entreprises_rapport_public` : `entreprise_id bigint pk references entreprises(id)
on delete cascade`, `token text unique not null`, `actif boolean default true`,
`site_id uuid` (le démo à mettre en avant, nullable), `vues int default 0`,
`vu_le timestamptz`, `cree_le timestamptz default now()`.

- Un jeton par entreprise, régénérable, révocable (`actif=false`). Précédent maison : `entreprises.client_portal_token`, généré par trigger (`sql/20260505_site_builder_v2.sql`).
- **Aucune colonne ajoutée à `entreprises`** : le compteur de vues est une écriture à chaque affichage, elle n'a rien à faire sur la table la plus centrale du CRM.
- Le rapport s'envoie **avant qu'une opportunité existe** — c'était l'objection contre l'ancrage sur `audits`, elle est levée.
- S'il existe un `audits` `ready` pour une opportunité de cette entreprise, la page rend **en plus** le deck complet ; sinon elle rend les notes + le démo + le CTA. La page ne dépend donc pas du document.

Le compteur de vues est un signal commercial gratuit : « il a ouvert le rapport
3 fois » vaut une relance.

## 3.3 La séquence d'écrans

On garde celle de `buildScreens()` et on **insère** :

| Position | Écran | Contenu |
|---|---|---|
| après la couverture | **Note globale** | l'anneau `/100` en grand, le libellé qualitatif, la date d'analyse, l'URL analysée. Sombre, dans le style de l'écran « Citation ». |
| ×1 | **Les quatre axes** | vitesse / SEO / mobile / conversion, chacun avec **sa preuve mesurée** en dessous. Les axes sous le seuil de confiance sont **absents**, pas grisés. |
| avant « Contexte » | **Avant / après** | capture 390 px du site actuel (§2.4) vs capture du démo, côte à côte, dans le `mockup-chrome` existant, avec les deux notes globales. **C'est l'écran qui vend.** |
| — | **Contexte** *(existant, enrichi)* | chaque `mProblemCard` gagne sa mesure justificative (« 4,2 s pour afficher la page »), tirée de `detail`. Les cartes viennent de `AUDIT_ISSUE_CATALOG`, source unique déjà en place. |
| avant le contact | **Méthode** | comment on mesure, quand, et le fait que c'est une analyse automatisée. Court, factuel, en pied. |

Le reste de la séquence (démo, citation, solutions, livrables, investissement, étapes,
contact) est celle du kit, inchangée. `getServices` / `calcTotal` / `fmtEur` sont déjà
partagés (`AuditShared.tsx:93-111`, `htmlShared.ts`).

## 3.4 Sa propre preview sociale

Deuxième gabarit sur le socle du §1.3 : `src/lib/og/rapport-card.tsx` — la note
globale en très grand, le nom de l'entreprise, les 4 sous-notes, palette nuit/azur.
C'est **la** vignette qui fait ouvrir le lien : un chiffre dans une conversation
WhatsApp se clique.

`generateMetadata` sur la route rapport, `robots: noindex` (rapport privé), `og:image`
absolu servi depuis le storage, même règle de hash qu'au §1.4.

---

# Lot 4 — PSI, deck, messagerie

## 4.1 PageSpeed Insights à la demande

`src/lib/audit-site/pagespeed.ts` —
`GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=…&strategy=mobile&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES`.

Sans clé : quota très bas, 429 fréquents. Avec `PAGESPEED_API_KEY` : largement
suffisant pour du démarchage. **La clé doit être `.optional()` dans `src/env.ts`** —
ce fichier est un `z.object(...)` qui **jette à l'import** si une variable requise
manque, ce qui casserait tout le déploiement (motif déjà appliqué à
`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `:24-28`).

Cadencement : reprendre le motif de
`src/lib/donnees-publiques/recherche-entreprises.ts:240-300` — pacer module-level,
`MAX_TENTATIVES`, respect de `Retry-After`, repli exponentiel,
`__resetCadenceurPourTests`. Stockage dans les colonnes `psi_*`, TTL 30 jours.

**Cohabitation des deux vitesses — règle à écrire dans le code** : quand
`psi_performance` est frais, **il remplace** la note vitesse maison et la page
l'affiche avec la mention « mesuré par Google » ; sinon on affiche la note maison
sans cette mention. Jamais les deux chiffres côte à côte : la page ne doit pas se
contredire.

Déclenchement : bouton « Mesurer avec Google » sur le badge CRM et sur la page
d'édition d'audit. **Jamais en masse** — ce n'est pas un outil de parc, c'est un
finisseur par prospect.

## 4.2 Report des chiffres dans le deck 6 pages

Le lot 2 a déjà branché `detectedIssueKeys` sur `entreprises_audit_site.issue_keys`
(§2.5). Il reste :
- un bandeau de notes en haut de `AuditPage2` (« Situation »), dans le style existant ;
- l'écran « avant/après » du §3.3, décliné en A4 sur `AuditPage1` à la place du seul mockup démo.

**Aucun changement de format de `audits.content`** : les notes viennent de l'analyse,
pas du document. C'est ce qui permet de les rafraîchir sans toucher au rédactionnel.

## 4.3 Messagerie

Le dialogue « Partager » existe depuis le lot 1 ; on lui ajoute le **lien rapport** à
côté du lien démo.

- **Nouveau template WhatsApp par défaut** dans `DEFAULT_TEMPLATES` (`WhatsAppTab.tsx:82`), id `envoi_site`, utilisant `{{lien_site}}` — la variable existe mais **aucun template ne s'en sert** aujourd'hui.
- **`{{lien_audit}}`** (`WhatsAppTab.tsx:76`, `:121`, `:367`) : pointer vers le rapport web quand un jeton actif existe, **repli sur `pdf_url`** sinon. Idem pour `vars['company.audit_url']` dans `src/lib/automations/engine.ts:150` et `SequenceBuilder.tsx:27`. Les séquences existantes continuent donc de fonctionner. Renommer le libellé « Lien audit PDF » en « Lien du rapport ».

---

## Coût

| Poste | Coût |
|---|---|
| Analyseur maison | 0 € — nos propres fonctions Vercel, illimité |
| Cartes OG (`next/og`) | 0 € — livré avec Next 15.4, généré une fois, servi par le CDN Supabase |
| Captures | 0 € via thum.io (déjà utilisé dans le deck, sans clé) ; ScreenshotOne si `RENDER_API_KEY` est posé — `render-provider.ts:64` le décrit comme « generous no-card free tier », **à vérifier avant d'en dépendre**. Volume = démos réellement envoyés + prospects réellement démarchés, **pas** les 2 800 entreprises. |
| PageSpeed Insights | 0 € — quota gratuit, clé recommandée, à la demande seulement |
| Stockage | négligeable — ~3 images de 150 Ko par prospect démarché |

---

## Vérification

1. **Analyseur** — tests Jest sur `score.ts` (fonction pure) : jeux de signaux → notes attendues, y compris « site bloqué », « SPA vide », « HTTP sans TLS », « avis dans un widget », « pas de site ». Puis `curl` du cron en local, et vérifier que la réponse porte `candidats_a_rafraichir`.
2. **Refactor `reach-page`** — les tests existants de `fetch-page-html` doivent passer **sans modification**. C'est la seule preuve que l'import IA n'a pas bougé.
3. **Preview sociale** — publier un site démo de test, puis :
   - ouvrir `https://app.…/api/og/demo/{siteId}` et regarder l'image ;
   - vérifier le repli en vidant `og_shot_url` ;
   - **régénérer** et vérifier que `og_image_url` a changé de nom de fichier (le test du §1.4) ;
   - passer l'URL dans le validateur d'unfurl de Facebook **et dans une vraie conversation WhatsApp** — c'est le seul test qui compte ;
   - refaire le test avec une URL de **preview** (`{uuid}.{SITE_DOMAIN}`), le cas aujourd'hui totalement muet.
4. **Rapport** — générer un jeton, ouvrir `rapport.{SITE_DOMAIN}/{token}` sur mobile : aucune note sous le seuil de confiance ne doit apparaître, l'écran avant/après doit montrer deux vraies captures, « Voir votre nouveau site » doit pointer le bon démo. Puis `actif=false` → la page doit renvoyer un 404 propre.
5. **Non-régression** — `npm run typecheck`, `npm test`, et vérifier qu'un site publié **sans** les nouvelles colonnes (migration non appliquée) s'affiche toujours : c'est exactement le scénario qui avait mis tous les sites hors ligne (`docs/site-builder-v2.md:155-172`).

---

## Risques

- **WhatsApp est le juge final.** Pas de JS, abandon rapide, images lourdes ignorées, **cache par URL**. D'où : image pré-générée, ≤ 300 Ko, PNG/JPEG, HTTPS sans redirection, **nom haché**. À valider en vrai avant de considérer le lot 1 fini.
- **Satori est capricieux** : pas de WebP, pas de SVG **distant**, polices en `ArrayBuffer`. La normalisation PNG du logo **client** n'est pas optionnelle. Le logo SAMA, inline, ne pose pas de problème.
- **thum.io est un tiers non authentifié et sans SLA**, aujourd'hui appelé depuis le navigateur avec l'URL du prospect en clair. Passage côté serveur + cache maison au lot 1.
- **La capture d'un site en cours d'édition** peut arriver à un mauvais moment. D'où l'invalidation à la republication.
- **Décalage de schéma** : les migrations s'appliquent à la main. Toute lecture des nouvelles colonnes de `sites` doit avoir un `?? défaut`, et les colonnes doivent figurer dans `sql/RATTRAPAGE_colonnes_sites.sql`.
- **Défendabilité des notes.** Une note basse montrée à un prospect doit être justifiable par une mesure qu'on peut lui montrer. C'est la raison des preuves dans `detail`, du seuil de confiance, de la détection des widgets d'avis, et du refus de revendiquer des Core Web Vitals qu'on ne mesure pas. Une seule affirmation fausse discrédite tout le rapport.
- **Le rapport est une page publique qui note une entreprise nommée.** Jeton non devinable, `noindex`, révocable, mention de méthode et de date en pied. C'est la différence entre un actif commercial et un passif.
- 🔴 **Secret pg_cron en clair.** `sql/20260808_donnees_publiques_cron.sql:35` contient le `x-pg-cron-secret` en clair, et il est **dans l'historique git** — le retirer du fichier ne suffit pas. **Action à part, indépendante de ce plan : tourner le secret**, mettre à jour le job pg_cron et la variable côté Vercel. Les nouvelles migrations utilisent `<PG_CRON_SECRET>`.
