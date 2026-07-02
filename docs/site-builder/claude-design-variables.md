# Règles Claude Design — Variables, boutons, images

> À utiliser avec **`claude-design-copywriting.md`** (règles de rédaction :
> services jamais en dur, ton neutre local, pas de faits inventés).
>
> **Fichier à fournir à Claude au moment de générer un design de site.**
> Le site généré est un template HTML statique **multi-entreprises** : il sera importé
> dans le CRM SAMA (Site Builder → Claude Design) puis déployé pour plusieurs
> entreprises. Claude ne connaît AUCUNE donnée réelle — il écrit des placeholders,
> et tout s'hydrate automatiquement à l'import avec les données Supabase de
> chaque entreprise.

---

## 1. Règle d'or — deux syntaxes, rien d'autre

| Où | Syntaxe | Exemple |
|---|---|---|
| **Texte visible** (paragraphes, titres, footer…) | Crochets `[…]` — **uniquement** ceux de la liste du §2, à la lettre près | `Bienvenue chez [Nom de l'entreprise]` |
| **Attributs HTML** (`href`, `src`, `alt`, …) et cas non couverts par un crochet | Token `{{ entreprise.xxx }}` (avec les espaces) | `<a href="tel:{{ entreprise.telephone }}">` |

⚠️ **Un crochet qui n'est pas dans la liste du §2 ne sera PAS reconnu : il restera
affiché tel quel sur le site publié.** N'invente jamais de placeholder
(`[Téléphone]`, `[Adresse]`, `[Logo]`… sont INVALIDES). En cas de doute, utilise
le token `{{ entreprise.xxx }}` du §3, qui fonctionne partout (texte et attributs).

---

## 2. Placeholders texte reconnus (liste fermée, orthographe exacte)

| Écris exactement ceci | Sera remplacé par |
|---|---|
| `[Nom de l'entreprise]` | Nom de l'entreprise |
| `[XX XX XX XX XX]` | Numéro de téléphone (format affiché : `06 12 34 56 78`) |
| `[N° et rue]` | Adresse postale (numéro + rue) |
| `[Ville]` | Ville |
| `[Code postal]` | Code postal |
| `[Région]` | Région |
| `[Département]` | Département |
| `[XXX XXX XXX XXXXX]` | Numéro SIRET |
| `[Prénom]` | Prénom du fondateur / gérant |
| `[ACO]` | N° d'attestation fluides frigorigènes |
| `[Zones desservies]` | Liste des villes/zones d'intervention (ex. `Annecy, Seynod, Cran-Gevrier`) |

Exemples d'usage en contexte :

```html
<p>[Nom de l'entreprise], votre expert local de l'habitat à [Ville] ([Code postal]) et dans tout le département [Département].</p>
<p>Fondée par [Prénom], notre entreprise intervient à [Zones desservies].</p>

<!-- ⚠️ Ne jamais nommer un métier/service dans une phrase générique
     (« votre chauffagiste », « spécialiste clim »). Voir claude-design-copywriting.md. -->
<footer>
  <p>[Nom de l'entreprise] — [N° et rue], [Code postal] [Ville]</p>
  <p>SIRET : [XXX XXX XXX XXXXX] · Attestation fluides : [ACO]</p>
</footer>
```

Pour l'**email affiché en texte**, pas de crochet : utilise directement le token
`{{ entreprise.email }}`.

---

## 3. Variables `{{ … }}` disponibles

### Toujours remplies (utilisables librement)

| Token | Contenu |
|---|---|
| `{{ entreprise.nom }}` | Nom de l'entreprise |
| `{{ entreprise.telephone }}` | Téléphone (format affiché) |
| `{{ entreprise.telephone_lien }}` | Téléphone normalisé pour `href="tel:…"` (chiffres seuls) |
| `{{ entreprise.email }}` | Email de contact |
| `{{ entreprise.email_domain }}` | Domaine de l'email (partie après le `@`) |
| `{{ entreprise.adresse }}` | Adresse (n° + rue) |
| `{{ entreprise.ville }}` | Ville |
| `{{ entreprise.code_postal }}` | Code postal |
| `{{ entreprise.departement }}` | Département (déduit du code postal) |
| `{{ entreprise.region }}` | Région (déduite du code postal) |
| `{{ entreprise.logo_url }}` | URL du logo |
| `{{ entreprise.horaires }}` | Horaires d'ouverture (texte) |
| `{{ entreprise.note_moyenne }}` | Note Google moyenne (ex. `4,8`) |
| `{{ entreprise.nombre_avis }}` | Nombre d'avis Google |
| `{{ entreprise.zones_desservies }}` * | Liste des villes/zones d'intervention |
| `{{ entreprise.annee_experience }}` * | Années d'expérience (nombre) |
| `{{ entreprise.site_web_canonique }}` | URL du site web actuel |

\* Remplies automatiquement par l'enrichissement — peuvent être vides si
l'entreprise n'a pas encore été enrichie ; à placer dans des phrases qui
restent correctes sans la valeur.

### Conditionnelles — peuvent être vides

Ces variables ne sont remplies que si la donnée a été saisie côté CRM. Ne les
utilise que dans des endroits qui restent corrects si la valeur est vide
(footer, mentions légales, ligne isolée) — jamais au milieu d'une phrase clé
du hero.

| Token | Contenu |
|---|---|
| `{{ entreprise.siret }}` | SIRET |
| `{{ entreprise.fondateur }}` | Prénom du fondateur |
| `{{ entreprise.attestation_fluides }}` | Attestation fluides |
| `{{ entreprise.clients_count }}` | Nombre de clients servis |

---

## 4. Boutons

### Bouton / lien d'appel téléphonique

**Chaque CTA d'appel** doit combiner le token dans le `href` et le crochet dans
le texte visible. Ne JAMAIS écrire un vrai numéro, ni dans le texte ni dans le
`tel:` :

```html
<a href="tel:{{ entreprise.telephone_lien }}" class="btn btn-primary">
  Appelez-nous : [XX XX XX XX XX]
</a>
```

Variante bouton sans numéro affiché (le `href` reste dynamique) :

```html
<a href="tel:{{ entreprise.telephone_lien }}" class="btn btn-primary">Appeler maintenant</a>
```

Dans le `href`, toujours `telephone_lien` (numéro sans espaces) ; dans le texte
visible, toujours le crochet `[XX XX XX XX XX]` (numéro formaté).

### Bouton / lien email

```html
<a href="mailto:{{ entreprise.email }}">{{ entreprise.email }}</a>
```

### Boutons de navigation / CTA internes

- Vers une section de la même page : ancre classique `href="#contact"`.
- Vers une autre page du template : lien relatif vers le fichier HTML
  (`href="contact.html"`, `href="service-climatisation.html"`). Ces liens sont
  automatiquement réécrits en routes propres (`/contact`,
  `/service-climatisation`) à l'import.
- Jamais de lien absolu vers un domaine inventé.

---

## 5. Logo et images

### Logo (header, footer)

```html
<img src="{{ entreprise.logo_url }}" alt="{{ entreprise.nom }}"
     style="height:48px;width:auto;object-fit:contain;">
```

- Toujours le token dans le `src` et le nom dans le `alt`.
- Contraindre la **hauteur** (pas la largeur) avec `object-fit:contain` : les
  logos réels ont des proportions imprévisibles.
- Prévoir que le logo puisse manquer : ne pas faire reposer la lisibilité du
  header uniquement sur l'image (ex. nom en texte à côté, ou header qui reste
  équilibré sans logo).

### Images de contenu (hero, services, galerie…)

- Les inclure dans le dossier `images/` de l'export et les référencer en
  chemin relatif : `<img src="images/hero-clim.jpg">`, ou en CSS
  `url(images/texture.png)`. Elles sont uploadées et réécrites automatiquement
  à l'import.
- Ces images sont **génériques au métier** (pas spécifiques à une entreprise) :
  pas de placeholder pour elles.

---

## 6. Pages, fichiers et `<title>`

- Nommage des fichiers : `index.html` (accueil), `contact.html`,
  `a-propos.html`, et **une page par service** au format
  `service-<tag>.html` (ex. `service-climatisation.html`,
  `service-chauffage.html`). Le `<tag>` du nom de fichier relie la page au
  service correspondant de l'entreprise.
- `<title>` : un titre de page **générique, sans placeholder ni crochet**
  (ex. `Climatisation`, `Contact`). Le CRM ajoute lui-même le nom de
  l'entreprise et gère le SEO (title/description/OG) à la publication.
- Pas de numéro, adresse ou nom réels nulle part — y compris dans les
  commentaires HTML et les données d'exemple.

---

## 7. Sections conditionnelles par service

Une entreprise n'a pas forcément tous les services. Tout bloc spécifique à un
service doit porter `data-service-tag` sur son élément englobant : il ne sera
affiché que si l'entreprise propose ce service, et retiré proprement sinon.

```html
<div class="service-card" data-service-tag="climatisation">…</div>
<div class="service-card" data-service-tag="chauffage">…</div>

<!-- Plusieurs tags possibles (affiché si AU MOINS un correspond) : -->
<section data-service-tag="climatisation chauffage">…</section>
```

- À appliquer aussi aux **liens de navigation** vers les pages services et aux
  cartes de la section « Nos services » de l'accueil.
- Le contenu sans `data-service-tag` est toujours affiché.
- Utiliser des tags simples, en minuscules, sans accents :
  `climatisation`, `chauffage`, `pompe-a-chaleur`, `plomberie`, etc.

---

## 8. Avis clients et chiffres clés (statique pour l'instant)

L'injection automatique des avis Google et des statistiques n'est pas encore
active pour les designs Claude. En attendant :

- Écrire **3 avis d'exemple réalistes** (prénom + initiale, texte crédible,
  5 étoiles) en contenu statique — **sans crochets** (ils resteraient affichés
  tels quels).
- Envelopper la grille d'avis dans un conteneur marqué, pour permettre
  l'hydratation automatique future sans retoucher le design :

```html
<div class="reviews-grid" data-reviews>
  <article class="review-card" data-review-item>
    <p class="review-text">« Intervention rapide et soignée, je recommande. »</p>
    <p class="review-author">Marie L.</p>
    <div class="review-rating">★★★★★</div>
  </article>
  <!-- 2 autres cartes identiques -->
</div>
```

- Pour la note globale, en revanche, les variables existent déjà :
  `Note {{ entreprise.note_moyenne }}/5 — {{ entreprise.nombre_avis }} avis Google`.
- Pour les chiffres clés (années d'expérience, clients servis), utiliser les
  variables conditionnelles du §3 si le bloc s'y prête, sinon du statique.

---

## 9. À NE JAMAIS variabiliser

Slogans, titres marketing, descriptions de services, libellés de boutons
(« Devis gratuit », « En savoir plus »), textes génériques, menus, mentions
légales génériques, classes CSS, images décoratives. Seules les données
d'**identité de l'entreprise** (§2 et §3) sont variables.

---

## 10. Checklist avant export

- [ ] Aucun nom, téléphone, email, adresse ou SIRET réels — que des
      placeholders des §2/§3.
- [ ] Tous les crochets utilisés appartiennent à la liste fermée du §2
      (orthographe exacte).
- [ ] Tous les `tel:` utilisent `{{ entreprise.telephone_lien }}` et les
      `mailto:` utilisent `{{ entreprise.email }}`.
- [ ] Logo = `src="{{ entreprise.logo_url }}"`, hauteur contrainte,
      `alt="{{ entreprise.nom }}"`.
- [ ] Images du design en chemins relatifs `images/…`, incluses dans l'export.
- [ ] Pages services nommées `service-<tag>.html` ; blocs et liens services
      porteurs de `data-service-tag`.
- [ ] Liens internes relatifs en `*.html` ; `<title>` génériques sans
      placeholder.
- [ ] Avis en statique réaliste, grille marquée `data-reviews`.
