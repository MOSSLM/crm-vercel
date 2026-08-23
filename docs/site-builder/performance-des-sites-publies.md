# Pourquoi une page met 5 à 8 secondes, et où se gagnent les secondes

Clarity relève 2 à 14 s d'affichage sur les sites publiés, le plus souvent 5 à
8 s. Ce document part de mesures réelles, pas d'impressions, puis classe les
correctifs par **gain**, **risque de changer le rendu**, et **effort**.

Mesures du 23 août 2026 sur `h2g-clim.samadigitalstudio.fr` (accueil), depuis
une connexion fibre. Un visiteur en 4G sur un téléphone milieu de gamme paie
tout cela plus cher, d'un facteur 2 à 4.

---

## Ce qu'on mesure

### Le serveur

| | Mesure |
|---|---|
| TTFB, 3 requêtes successives | **3,31 s · 1,94 s · 1,38 s** |
| `x-vercel-cache` | `MISS` **à chaque fois** |
| `cache-control` | `private, no-cache, no-store, max-age=0, must-revalidate` |

La page n'est **jamais** mise en cache : ni par le CDN, ni par le navigateur.
Chaque visite, chaque rechargement, chaque page vue refait le rendu complet
côté serveur. Le `export const revalidate = 60` des routes est **inerte** :
appeler `headers()` dans le composant et dans `generateMetadata` rend la route
dynamique, ce qui désactive le cache de route.

### Ce que pèse une page

| Ressource | Poids | Remarque |
|---|---|---|
| HTML | 123 Ko compressé (**649 Ko brut**) | dont 139 Ko de `<style>` inline et **447 Ko de `<script>` inline** (28 balises) |
| `cdn.tailwindcss.com` | **407 Ko** (126 Ko compressé) | chargé **en synchrone**, position 145 237 sur 649 109 — juste avant le contenu |
| Chunks Next | 238 Ko compressés | 12 fichiers |
| Leaflet (js + css) | 147 Ko + 15 Ko | depuis `unpkg.com`, sur **les 256 sites publiés**, carte ou pas |
| Images | **776 Ko** | 14 uniques ; les 4 plus grosses : 253, 231, 139, 82 Ko |
| Google Fonts | — | le **même lien émis 4 fois** |

Total sur la première visite : **~1,7 Mo**, dont 570 Ko de JavaScript avant
même d'avoir affiché une phrase.

### La chaîne de la seconde perdue

1. **1,4 à 3,3 s** — le serveur rend la page (aucun cache) : 2 allers-retours
   Supabase, compilation Tailwind, sérialisation de 649 Ko de HTML.
2. Le navigateur lit le HTML et rencontre, **avant le contenu**, un
   `<script src="https://cdn.tailwindcss.com">` **synchrone**. L'analyse
   s'arrête : téléchargement de 126 Ko, puis Tailwind **compile le CSS dans le
   navigateur** en observant le DOM. Sur mobile, c'est du travail sur le fil
   principal, de l'ordre de la demi-seconde à la seconde.
3. La mise en page devient enfin possible.
4. **Alors seulement** l'image héros commence à se télécharger — 253 Ko — parce
   qu'elle porte `loading="lazy"` (voir P4 : c'est un défaut, pas un choix).
5. LCP.

Chaque étape attend la précédente. C'est pour ça que le total est de 5 à 8 s et
non de 2 s : ce ne sont pas des coûts parallèles, c'est une file d'attente.

---

## Les propositions

Classées par gain. « Risque visuel » = probabilité que le site rende
différemment de ce que le client a validé.

### P1 — Rendre la page cachable par le CDN

**Gain : le plus gros de la liste.** TTFB de 1,4–3,3 s à ~50 ms sur un HIT.

`headers()` est appelé dans les deux routes publiques uniquement pour lire
l'hôte — or le paramètre de route `subdomain` **porte déjà** cette valeur
(`resolveSite` fait `subdomain || host`, et `subdomain` est toujours renseigné).
Le seul usage réel est `origineRequete()` dans `generateMetadata`, pour servir
la carte OpenGraph depuis l'hôte demandé.

Chemin : retirer `headers()` du composant page ; dans `generateMetadata`,
remplacer `origineRequete()` par l'hôte canonique du site — qu'on connaît déjà
(`hostCanoniqueDuSite`).

- **Risque visuel : nul.** Le HTML rendu est identique.
- **Risque fonctionnel : moyen, et à traiter explicitement.**
  - La carte de partage serait servie depuis l'hôte canonique et non depuis
    l'hôte demandé. C'est un retour en arrière sur une décision documentée
    (en-tête de `build-page-metadata.ts`) — à assumer ou à contourner.
  - Une page cachée ne peut pas décider par requête : les redirections
    **par query** (`/?page_id=12`) exigent `searchParams`, donc du dynamique.
    Solution : garder l'accueil dynamique, cacher tout le reste ; ou renoncer
    aux règles à query.
  - Le contenu servi serait à jour à 60 s près, sauf purge. `invalidateSiteCache`
    existe déjà partout ; il faudrait y ajouter `revalidatePath` sur les
    segments du site.
- **Effort : une demi-journée**, essentiellement pour la carte OG.

### P2 — Ne plus compiler Tailwind au moment du rendu

**Gain : 85–120 ms par rendu à chaud** (mesuré), bien plus à froid — un lambda
qui démarre paie en plus l'import de `@tailwindcss/postcss` et de son binaire
natif. Le cache actuel est une `Map` en mémoire de processus : chaque instance
Vercel recommence.

Le CSS des sections bibliothèque doit être **cuit à la publication**, dans
`published_shared_assets`, comme le reste de l'instantané.

- **Risque visuel : faible**, à condition de compiler à partir du HTML complet
  de la page (`@source` sur le fichier), et non du jeu de tokens extraits par
  regex : Tailwind voit alors toutes les classes réellement présentes.
- **Effort : un jour.** C'est aussi le **prérequis de P3**.

### P3 — Supprimer le script Tailwind CDN synchrone

**Gain : très gros côté navigateur.** 126 Ko de moins, l'analyse du HTML n'est
plus bloquée juste avant le contenu, et le fil principal ne compile plus de CSS.
Sur mobile, on parle de 1 à 3 s.

- **Risque visuel : le plus élevé de la liste.** Il est là pour une raison,
  écrite dans le code : l'extraction de classes par regex rate les classes
  construites dynamiquement (ternaires, gabarits, tables d'objets). Le Play CDN,
  lui, observe le DOM au chargement et rattrape aussi les classes ajoutées par
  le JavaScript de la page. Un CSS figé ne le fera jamais.
- **Chemin sûr, dans cet ordre :** (1) faire P2 avec `@source` sur le HTML
  complet ; (2) comparer, page par page sur un échantillon, le rendu avec et
  sans le CDN (capture d'écran de part et d'autre) ; (3) ne retirer que si le
  diff est vide. Sinon, corriger l'extraction avant.
- **Effort : deux jours, dont la moitié en vérification.** À ne pas faire à la
  légère : ça touche les 256 sites publiés d'un coup.

### P4 — L'image héros est en `loading="lazy"` — c'est un défaut

**Gain : gros sur le LCP, souvent 1 à 2 s.** **Risque visuel : nul.**

`add-image-loading-hints.ts` garde la **première** `<img>` du document en eager
avec `fetchpriority="high"`, et met toutes les suivantes en `lazy`. L'intention
est juste ; le résultat ne l'est pas, parce que la première image d'un design
est **toujours le logo de la barre de navigation** — présent deux fois (version
bureau et version mobile). L'image héros est donc la troisième, et elle part en
`loading="lazy"` : le navigateur la dépriorise, et ne la demande qu'après avoir
calculé la mise en page, c'est-à-dire après Tailwind.

Mesuré sur le site témoin : `<img id="photo-hero-accueil" … loading="lazy">`,
253 Ko, sans `fetchpriority`.

Correctif : ignorer les images de marque (classe `brand-img`, images dans
`<header>`/`<nav>`) dans le choix de la première, ou plus simplement ne jamais
poser `lazy` sur les trois premières images. **Deux nuances importantes :** ces
attributs sont figés dans le HTML stocké, donc corriger la fonction ne suffit
pas — il faut soit une passe de rattrapage sur les sections existantes (écriture
de masse : archiver d'abord), soit appliquer la correction **au rendu**, ce qui
couvre tout le parc immédiatement et n'écrit rien.

C'est le meilleur rapport gain/risque de la liste. À faire en premier.

### P5 — Le poids des images

**Gain : gros, surtout en 4G.** 776 Ko servis en taille native depuis Supabase
Storage, sans `srcset`, sans `width`/`height`.

- Supabase sait redimensionner à la volée
  (`/storage/v1/render/image/public/…?width=…&quality=…`) : un `srcset` à 640 /
  1024 / 1600 px diviserait ce poids par 3 à 5.
- **`width`/`height` absents sur les 26 balises** : c'est aussi du décalage de
  mise en page (CLS), donc du ressenti « ça saute ».
- **Risque visuel : faible** (même image, moins de pixels) — mais **vérifier
  d'abord que la transformation d'images est activée sur le plan Supabase du
  projet**, sinon les URLs rendront 404 et les images disparaîtront.
- **Effort : un jour**, plus une passe de rattrapage sur le HTML stocké.

### P6 — Leaflet chargé partout

**Gain : moyen** (162 Ko). **Risque : faible.**

`published_shared_assets.scriptLinks` contient
`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` sur **les 256 sites publiés**,
qu'il y ait une carte sur la page ou non. Deux gestes : ne l'injecter que si la
page contient le conteneur de carte, et le servir depuis chez nous plutôt que
depuis `unpkg.com` (un tiers de plus dans le chemin critique, et une dépendance
à sa disponibilité).

### P7 — Les liens Google Fonts sont émis 4 fois

**Gain : faible mais gratuit. Risque : nul.** Le même `<link>` apparaît quatre
fois dans le HTML (deux URLs identiques, chacune en double).

### P8 — 447 Ko de `<script>` inline et 238 Ko de chunks

**Gain : moyen à gros. Risque : moyen.** C'est la charge React/RSC d'une page
qui est, pour l'essentiel, une brochure statique. La réduire demande de revoir
quels composants sont réellement clients (barre d'achat, formulaires,
animations) — un chantier d'architecture, pas un réglage. À garder pour après
P1–P5, qui coûtent beaucoup moins cher pour beaucoup plus.

---

## Ordre recommandé

| | Action | Gain | Risque visuel | Effort |
|---|---|---|---|---|
| 1 | **P4** image héros | 1–2 s | nul | 2 h |
| 2 | **P7** fonts en double | ~0,1 s | nul | 15 min |
| 3 | **P1** cache CDN | 1,3–3,2 s | nul | ½ j |
| 4 | **P5** poids des images | 0,5–2 s (4G) | faible | 1 j |
| 5 | **P6** Leaflet conditionnel | 0,2–0,5 s | faible | 3 h |
| 6 | **P2** Tailwind cuit à la publication | 0,1–1 s | faible | 1 j |
| 7 | **P3** retirer le CDN Tailwind | 1–3 s | **élevé** | 2 j |
| 8 | **P8** charge JavaScript | ? | moyen | chantier |

Les quatre premières lignes ne peuvent pas changer l'apparence d'un site. Elles
valent, ensemble, **3 à 5 secondes**. C'est là qu'il faut commencer.

---

## Une chose à ne pas faire

Ne pas mettre `loading="eager"` sur **toutes** les images pour « aller plus
vite » : les 776 Ko partiraient d'un coup et se disputeraient la bande passante
avec le héros. Le but n'est pas de tout charger tôt, c'est de charger **le héros
en premier** et le reste quand il approche.

---

## Comment remesurer

```bash
curl -s -o /tmp/p.html -w "TTFB:%{time_starttransfer}s total:%{time_total}s taille:%{size_download}o\n" https://<hôte>/
curl -sI https://<hôte>/ | grep -iE "x-vercel-cache|cache-control|age"
```

Puis PageSpeed Insights sur l'URL — **jamais en masse**, le quota est la
ressource rare (cf. `src/lib/architecture/bots.ts`).
