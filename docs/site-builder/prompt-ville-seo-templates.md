# Prompt Claude Design — passer les templates CVC à la « Ville SEO »

> **Mode d'emploi :** ouvrir le projet Claude Design qui contient les 4 skins CVC
> (`template CVC - Classique`, `- Brut`, `- Agency`, `- Verdure`), coller le prompt
> ci-dessous, puis réexporter le ZIP. Le réimport dans le CRM est décrit en fin de
> fichier.
>
> Le fichier de règles complet reste [`claude-design-variables.md`](./claude-design-variables.md) :
> il a été mis à jour avec `[Ville SEO]` et `{{ entreprise.ville_seo }}`. Donne-le
> aussi à Claude Design si tu génères un **nouveau** template — le prompt ci-dessous
> ne sert qu'à **patcher les 4 skins existantes**.

---

## Le prompt à coller

````text
Tu vas modifier les 4 templates CVC (`template CVC - Classique`, `template CVC - Brut`,
`template CVC - Agency`, `template CVC - Verdure`), 9 pages HTML chacun
(`index.html` + les 8 `service-*.html`). Structure identique dans les 4 skins.

CONTEXTE
Le CRM distingue désormais deux villes, et elles ne sont PAS interchangeables :

- [Ville]      = la ville réelle de l'adresse postale de l'entreprise (ex. Quetigny)
- [Ville SEO]  = la grande ville la plus proche, celle sur laquelle l'entreprise
                 veut être trouvée et qu'on met en avant partout (ex. Dijon).
                 Elle est toujours renseignée : si l'entreprise est déjà dans une
                 grande ville, [Ville SEO] vaut cette ville.

Aujourd'hui les templates n'utilisent que [Ville], donc les titres affichent la
petite commune au lieu de la grande ville. Il faut corriger ça.

CE QUE TU DOIS FAIRE
Remplacer [Ville] par [Ville SEO] dans TOUT le texte marketing, et le laisser
intact dans l'adresse postale. Précisément, dans chaque page de chaque skin :

À REMPLACER par [Ville SEO]
1. Le H1 des 8 pages service — « Climatisation réversible à [Ville] »,
   « Pompe à chaleur à [Ville] », « Plombier à [Ville] », « Électricien à [Ville] »,
   « Installation de chauffage à [Ville] », « Ventilation & VMC à [Ville] »,
   « Panneaux solaires photovoltaïques à [Ville] »,
   « Bornes de recharge pour véhicules électriques à [Ville] ».
2. Le chapô sous le H1 de la page plomberie :
   « … un artisan plombier réactif et soigné à [Ville] et ses environs. »
3. Le H2 de la section « Où nous intervenons » :
   « À votre service, partout autour de [Ville] ».
4. Le paragraphe qui suit ce H2 :
   « Nous intervenons dans un rayon d'environ 40 km autour de [Ville]. … ».
5. La première puce de villes : <span class="city-chip">[Ville]</span>.
6. Le paragraphe de présentation du footer :
   « Artisan installateur en chauffage, climatisation, photovoltaïque, plomberie
   et électricité à [Ville] et ses environs, à votre service. »

À LAISSER STRICTEMENT INCHANGÉ
7. La ligne d'adresse du footer : <li>[N° et rue], [Code postal] [Ville]</li>
8. Le champ « Ville » du formulaire de devis :
   <input id="dv-ville" class="input" type="text" placeholder="[Ville]">

AUTRE CHANGEMENT — la carte de zone
Dans la section « Où nous intervenons », la carte est centrée sur la ville :
  <div id="zone-leaflet" class="zone-leaflet" role="img"
       data-city="{{ entreprise.ville }}" aria-label="…"></div>
Remplace l'attribut par data-city="{{ entreprise.ville_seo }}" — la carte doit
être centrée sur la grande ville, pas sur la commune de l'adresse.
(Le commentaire correspondant dans `site.js` mentionne `{{ entreprise.ville }}` :
mets-le à jour aussi, c'est du commentaire, aucun impact fonctionnel.)

RIEN D'AUTRE NE CHANGE
Pas de retouche de design, de CSS, de structure, de wording au-delà du
remplacement du placeholder. `[Ville SEO]` est un placeholder valide de la liste
fermée : écris-le exactement ainsi, entre crochets, avec cette casse.

VÉRIFICATION AVANT EXPORT
Par page, il doit rester EXACTEMENT 2 occurrences de `[Ville]` (l'adresse du
footer, et le placeholder du formulaire) et 0 ailleurs. Par skin : 45 `[Ville]`
remplacés par `[Ville SEO]`, 18 conservés, 9 attributs `data-city` mis à jour.
Sur les 4 skins : 180 remplacements, 72 `[Ville]` conservés.
````

---

## Réimport dans le CRM

1. Site Builder → Claude Design → **Import multi-pages**, déposer le ZIP réexporté.
2. Pour chacune des 4 lignes détectées : mode **« Mettre à jour »** en ciblant le
   template existant du même nom (le CRM le propose automatiquement), et cocher
   **« Reprendre les photos »** — sinon les ~200 images déjà placées sont à refaire.
3. Aucune action n'est nécessaire dans l'écran de mapping des crochets :
   `[Ville SEO]` est reconnu automatiquement et converti en
   `{{ entreprise.ville_seo }}` (`src/lib/site-builder/claude-design/bracket-tokens.ts`).
4. Republier les sites concernés pour que le snapshot de variables soit régénéré.

## Pourquoi ça marche côté CRM

- L'enrichissement (edge function `enrich-lead-magnet`) écrit la grande ville la
  plus proche dans `lead_magnet_projects.override_city`, avec replis successifs
  sur la grande ville du département puis sur la ville de l'entreprise : la valeur
  est toujours une vraie ville.
- `override_city` alimente `{{ entreprise.ville_seo }}`, et `{{ entreprise.ville }}`
  reste la ville réelle de `entreprises.ville` — voir
  `src/lib/site-builder/city-variables.ts`.
- La ville SEO est obligatoire dans la fiche du marketing pipeline (juste sous
  « Ville ») : impossible de créer un site sans elle.
