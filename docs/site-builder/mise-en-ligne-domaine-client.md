# Passer une démo en vrai site, sur le domaine du client

Ce document décrit le seul geste irréversible du métier : le jour où le domaine
d'un client cesse de servir son ancien site pour servir le nôtre. Le design se
corrige le lendemain ; l'ancienneté perdue par ses vieilles URLs, non.

Tout se pilote depuis l'éditeur du design → bouton **« Mise en ligne »**.

---

## Ce qui change, et ce qui ne change pas

| | Avant (démo) | Après (vrai site) |
|---|---|---|
| Adresse | `client.samadigitalstudio.fr` | `client.fr` |
| Sous-domaine de démo | l'adresse officielle | **reste servi**, mais en `noindex` |
| Balise canonique | pointe le sous-domaine | pointe le domaine du client |
| `sitemap.xml` | listé sur le sous-domaine | listé sur le domaine, et **seulement** lui |
| Anciennes URLs du client | — | redirigées en 308 par le plan |
| Barre d'achat de la démo | visible | **à retirer** |
| Titres et descriptions | repli automatique | un par page |

Le sous-domaine de démo n'est jamais coupé : des liens de démarchage déjà
envoyés pointent dessus, et un 404 sur un lien qu'on a soi-même envoyé est pire
qu'une page en double. Il est simplement marqué `noindex` et désigne le domaine
du client comme adresse officielle — donc il ne lui fait pas concurrence.

---

## Avant de toucher au DNS

Trois choses se font **pendant que l'ancien site tourne encore**. Une fois le
DNS basculé, l'ancien site n'est plus lisible par personne, nous compris.

### 1. Relever les URLs de l'ancien site

C'est ce que fait le bouton **« Proposer depuis l'ancien site »** du dialogue de
mise en ligne. Il lit le `sitemap.xml` de l'ancien site (celui annoncé par son
`robots.txt`, sinon les emplacements conventionnels), et propose page par page
vers quoi rediriger.

> **Le piège de calendrier.** Une fois le domaine pointé chez nous,
> `client.fr/sitemap.xml` rend **notre** sitemap. Le plan se construirait alors
> sur les URLs du nouveau site, c'est-à-dire sur rien — et de façon parfaitement
> crédible. Le CRM refuse un domaine déjà rattaché, mais il ne peut rien contre
> un DNS basculé sans rattachement. **Fais cette étape en premier.**

Si l'ancien site n'a pas de sitemap, l'outil retombe sur les liens de la page
d'accueil : la couverture est partielle par construction. Les pages qu'aucun
lien ne pointe plus n'existent que dans la **Search Console** du client —
*Performances → Pages*, puis *Indexation → Pages indexées*. Demande-lui l'accès,
exporte la liste, colle-la dans le plan.

### 2. Vérifier ce qui doit disparaître

- La **barre d'achat** de la démo. Elle propose au visiteur d'acheter le site
  que le client vient de payer. Le webhook Stripe l'éteint après un paiement en
  ligne — **pas** après un virement ni une facture, c'est-à-dire dans la plupart
  des ventes. Le dialogue affiche un bandeau et un bouton « Retirer ».
- Les **contenus d'exemple** restés dans les sections (photos génériques,
  chiffres de démonstration).

### 3. Écrire le SEO page par page

Onglet **SEO** du panneau de gauche de l'éditeur. Il suit la page active.

Sans lui, les dix pages sortent sous la même formule automatique
(« *{Titre} — {Entreprise}* »), ce qu'un moteur lit comme dix pages
interchangeables. Les variables `{{ entreprise.ville_seo }}` sont acceptées ; le
compteur de caractères compte la longueur **interpolée**, la seule que Google
voit. Bornes visées : **50–60** caractères pour le titre, **150–160** pour la
description.

Les valeurs partent en ligne à la **republication** : elles sont figées dans
l'instantané, comme le reste du contenu.

---

## La bascule, point par point

### Étape 1 — Poser le plan de redirection

Dialogue **Mise en ligne** → section *Plan de redirection*.

Une règle par ligne, `ancienne-url → /nouvelle-page` :

```
/nos-services.html      → /services
/qui-sommes-nous.php    → /a-propos
/blog/*                 → /actualites/*
/?page_id=12            → /contact
/ancienne-promo         → /offres !
```

| Forme | Effet |
|---|---|
| `/x.html → /y` | correspondance exacte, insensible à la casse et au slash final |
| `/blog/* → /actu/*` | tout ce qui est sous `/blog/` part sous `/actu/`, suffixe reporté |
| `/blog/* → /actu` | tout ce qui est sous `/blog/` atterrit sur une seule page |
| `/?page_id=12 → /y` | permalien hérité porté par la query |
| `… → https://autre.fr` | cible externe, laissée telle quelle |
| `… !` en fin de ligne | redirection **temporaire** (307) au lieu de permanente (308) |

Séparateurs acceptés : `→`, `->`, `=>`, une virgule, un point-virgule, une
tabulation. C'est large exprès : le plan arrive d'un tableur ou d'un mail, et
refuser une forme de flèche ferait retaper cent lignes.

Le bloc sous la zone de saisie relit le plan en direct et signale :

- **une cible qui rendrait 404** — la redirection serait un cul-de-sac ;
- **une règle inerte** parce que sa source est déjà une page du site ;
- **un doublon** — seule la première ligne s'appliquerait ;
- **une boucle** — bloquante, l'enregistrement est refusé.

**Enregistrer le plan n'est pas republier.** Le plan s'applique immédiatement sur
le site en ligne, sans refiger le contenu. C'est délibéré : le moment où on a
besoin d'une redirection est précisément celui où l'on ne veut pas emporter au
passage trois semaines de retouches en cours dans l'éditeur.

**Vérifie le plan avant la bascule** : il s'applique aussi sur le sous-domaine
de démo. `https://client.samadigitalstudio.fr/nos-services.html` doit déjà
partir vers la bonne page, DNS ou pas.

### Étape 2 — Rattacher le domaine dans le CRM

Même dialogue, section *Domaine du client*. Saisis `client.fr` (l'URL complète
est acceptée, elle est réduite à son domaine).

Le CRM refuse : un sous-domaine de `samadigitalstudio.fr` (le routage ne saurait
pas le résoudre, le site tomberait en 404 avec un journal serveur vide), un hôte
d'infrastructure, une IP, une saisie libre. Il refuse aussi un domaine déjà
rattaché à un autre site.

### Étape 3 — Ajouter le domaine chez l'hébergeur

**Vercel → le projet → Settings → Domains → Add.** Ajoute **les deux** :

- `client.fr`
- `www.client.fr`, en choisissant **Redirect to `client.fr`** (308)

La redirection `www` → domaine nu se fait **là**, pas dans notre application :
elle est servie à l'edge, sans invoquer de fonction, et elle ne peut pas boucler
si le DNS de l'apex n'est pas encore propagé.

En ligne de commande (`gh` n'est pas disponible ici, `npx vercel` oui) :

```bash
npx vercel domains add client.fr <nom-du-projet-vercel>
```

Cette commande ajoute le domaine ; **elle ne configure pas la redirection
`www`**, qui n'existe que dans l'écran Domains. Autrement dit : le tableau de
bord fait les deux, la ligne de commande une seule.

Sans cette étape, le DNS aura beau pointer chez nous : pas de certificat, donc
une erreur de sécurité en travers de la page.

### Étape 4 — Poser le DNS chez le registrar du client

Le dialogue affiche les lignes exactes, avec un bouton de copie. Elles ne sont
pas les mêmes selon ce qu'on rattache :

**Un domaine nu** (`client.fr`) — deux lignes :

| Type | Nom | Valeur |
|---|---|---|
| `A` | `@` | l'IP affichée par Vercel |
| `CNAME` | `www` | le CNAME affiché par Vercel |

**Un sous-domaine du client** (`pro.client.fr`) — une seule :

| Type | Nom | Valeur |
|---|---|---|
| `CNAME` | `pro` | le CNAME affiché par Vercel |

> Ne jamais servir la consigne du domaine nu pour un sous-domaine : le `A @`
> ferait pointer `client.fr` chez nous — c'est-à-dire déplacer le site principal
> du client — et le `CNAME www` enverrait `www.client.fr` sur un site qui n'est
> pas le sien. Le dialogue fait la distinction tout seul.

> Les valeurs par défaut du CRM sont celles que Vercel affiche aujourd'hui
> (`NEXT_PUBLIC_DNS_APEX_IP`, `NEXT_PUBLIC_DNS_CNAME`). **Compare-les toujours à
> ce que l'écran de Vercel dit à ce moment-là** : ce sont les valeurs d'un
> hébergeur, pas une constante du monde.

Le `CNAME www` est à poser **même si on redirige `www`** : la redirection se
fait chez l'hébergeur, il faut donc que le nom lui parvienne. C'est l'oubli le
plus fréquent — le domaine nu marche, `www.` rend une erreur de certificat, et
c'est l'adresse que la moitié des gens tape.

**Pense aussi à baisser le TTL à 300 s la veille**, sur l'ancienne zone : ça
raccourcit la fenêtre pendant laquelle une partie du monde voit encore l'ancien
site.

### Étape 5 — Vérifier le DNS depuis le CRM

Bouton **« Vérifier le DNS »**. Il lit l'apex et le `www` depuis deux résolveurs
publics — donc **ce que le monde voit**, pas ce que ton navigateur a mis en
cache. C'est précisément le piège de cette étape : la machine de l'opérateur
affiche encore l'ancien site pendant des heures, et on cherche côté application
ce qui se joue chez le registrar.

Propagation : de quelques minutes à 24 h. Tant que le verdict n'est pas vert des
deux côtés, il n'y a rien à corriger dans l'application.

### Étape 6 — Republier

Le bouton **« Republier »** de la barre du haut. C'est lui qui fait passer en
ligne le SEO par page et tout ce qui a été modifié dans l'éditeur.

### Étape 7 — Retirer la barre d'achat

Le bandeau du dialogue, s'il est encore là. Une fois retiré, recharge le site du
client pour le constater.

### Étape 8 — Contrôler

```bash
curl -sI https://client.fr | head -3
curl -sI https://www.client.fr | head -3
curl -s https://client.fr/robots.txt
curl -s https://client.fr/sitemap.xml | head -5
curl -sI https://client.fr/nos-services.html | grep -i "^HTTP\|^location"
curl -s https://client.fr | grep -o '<link rel="canonical"[^>]*>'
```

Ce qu'on doit lire :

- l'apex répond `200`, `www` répond `308` vers l'apex ;
- le `robots.txt` du domaine annonce le sitemap ; celui du sous-domaine de démo
  ne l'annonce pas ;
- une ancienne URL répond `308` avec le bon `Location` ;
- le canonical pointe le domaine du client, y compris quand la page est demandée
  depuis le sous-domaine de démo.

### Étape 9 — Search Console

1. Ajoute la propriété `client.fr` (ou fais-la ajouter par le client).
2. **Soumets le sitemap** : `https://client.fr/sitemap.xml`.
3. Si le client change **aussi** de domaine (`ancien.fr` → `nouveau.fr`),
   utilise l'outil **Changement d'adresse** de la Search Console de l'ancien
   domaine. Sans ça, les redirections seules mettent bien plus longtemps à
   transférer l'ancienneté.
4. Garde le plan de redirection **au moins un an**. C'est la durée pendant
   laquelle Google revient vérifier les anciennes URLs.

---

## Ce que le système fait tout seul

Rien à configurer pour ça :

- **la balise canonique** de chaque page désigne le domaine du client dès qu'il
  est rattaché, quelle que soit l'adresse par laquelle la page a été demandée ;
- **le sous-domaine de démo** sert les mêmes pages, mais chacune porte
  `noindex, follow` : il est exploré (donc le canonical est lu) et il n'est pas
  indexé ;
- **le `sitemap.xml`** est bâti sur l'adresse officielle et ne liste que les
  pages réellement servies — une page masquée par un tag de service ou vide de
  sections n'y figure pas, pour ne pas livrer à Google des URLs qui rendent 404 ;
- **les URLs à extension héritée** (`.html`, `.php`, `.aspx`…) atteignent bien le
  site et non le 404 de l'application ;
- **`www.client.fr` et `client.fr`** résolvent tous deux vers le site, même si
  une seule des deux formes est enregistrée en base.

---

## Les pièges, rangés

| Piège | Ce qui se passe | Ce qu'il faut faire |
|---|---|---|
| Plan construit après la bascule | on lit notre propre sitemap, le plan est vide de sens | construire le plan **avant** |
| Domaine ajouté au CRM mais pas à Vercel | erreur de certificat sur la page | Vercel → Settings → Domains |
| `CNAME www` oublié | `www.` casse, l'apex marche | poser les deux enregistrements |
| Barre d'achat oubliée | on propose au client d'acheter son propre site | bandeau du dialogue |
| Redirection vers une page inexistante | cul-de-sac silencieux | lire les avertissements du plan |
| Règle sur une page qui existe | la règle ne s'applique pas (garde anti-masquage) | supprimer la ligne, ou renommer la page |
| Cache navigateur | on croit que le DNS n'a pas basculé | « Vérifier le DNS », qui lit deux résolveurs publics |
| Republier pour poser une redirection | on emporte des retouches non terminées | « Enregistrer le plan » suffit, il s'applique seul |
| Sous-domaine coupé « pour faire propre » | les liens de démarchage déjà envoyés tombent en 404 | le laisser vivre, il est en `noindex` |

---

## Défaire — offboarding

Un client qui part, un domaine qui change de main :

1. Dialogue **Mise en ligne** → icône corbeille à côté du domaine. Le site reste
   servi sur son sous-domaine de démo, et le domaine redevient attribuable.
2. Dépublier le site, si c'est le souhait, depuis l'éditeur.

La dépublication seule **ne libère pas** le domaine : c'est délibéré (un client
peut revenir), mais ça veut dire qu'un offboarding doit passer par le
détachement explicite. Sans ça, le CRM continue d'annoncer comme adresse
publique un domaine parti chez un repreneur.

---

## Où ça vit dans le code

### Ce que le CRM ne surveille pas (encore)

Six angles morts — journal des 404, mesure d'audience, surveillance du domaine,
limite de débit sur les formulaires, notification d'un formulaire rempli, trace
des changements d'adresse — sont détaillés dans
**`securite-et-exploitation.md`**, avec l'état d'authentification des routes.

Et si le site paraît lent une fois en ligne, ce n'est pas une impression :
**`performance-des-sites-publies.md`** mesure d'où viennent les 5 à 8 secondes
et classe les correctifs par risque de changer le rendu.

| Sujet | Fichier |
|---|---|
| Règles, appariement, garde anti-masquage | `src/lib/site-builder/redirections.ts` |
| Application à une requête | `src/lib/site-builder/appliquer-redirection.ts` |
| Proposition depuis l'ancien site | `src/lib/site-builder/plan-redirections.ts` |
| Validation d'un domaine client | `src/lib/site-builder/domaine-client.ts` |
| Lecture DNS | `src/lib/site-builder/dns-domaine.ts` |
| Adresse officielle et canonical | `src/lib/site-builder/host-canonique.ts` |
| `noindex` hors adresse officielle | `src/lib/site-builder/build-page-metadata.ts` |
| Aiguillage par hôte, extensions héritées | `src/lib/site-domain.ts` |
| Routes API | `src/app/api/site-builder/sites/[siteId]/{domaine,redirections,seo}/` |
| Écran | `src/components/site-builder/claude-design/MiseEnLigneDialog.tsx` |

Le plan de redirection est stocké dans `sites.site_config.redirections` **et**
dans `sites.published_site_config.redirections` : le premier pour que la
prochaine publication le conserve, le second pour qu'il s'applique tout de
suite. C'est la seule entrée de l'instantané publié qu'on écrit sans republier,
et la raison est écrite en tête de la route.
