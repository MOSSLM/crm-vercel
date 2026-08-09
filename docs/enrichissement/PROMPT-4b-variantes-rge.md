# Prompt 4b — deux variantes de texte selon le RGE

À passer à Claude Design, sur les six variantes CVC. Le bloc de logos est déjà
pilotable (bundle `cvc12`) ; ce prompt traite **le texte**, qui ne l'est pas.

Mesuré sur `cvc12`, hors bloc piloté, commentaires exclus : **76 allégations
écrites en dur par variante**, soit 456 sur les six, plus **125 mentions d'aides
par variante**.

---

## Le prompt

> Les templates affirment en clair, pour **tous** les clients, des qualifications
> que beaucoup ne détiennent pas. Le CRM interroge maintenant l'ADEME et connaît
> la réponse pour chaque entreprise. Sur **88 projets sur 190, la réponse
> vérifiée est « aucune qualification »**. Sur ceux-là, chacune des phrases
> ci-dessous est fausse.
>
> Le bandeau de logos est déjà piloté : il disparaît tout seul. Le problème
> restant est le texte autour, qui lui ne bouge pas. Aujourd'hui le résultat est
> pire qu'avant : le bandeau s'efface et le pied de page continue d'afficher
> trois badges, ce qui a l'air d'avoir été vérifié.
>
> **Ce qu'il faut produire : deux rédactions de chaque zone concernée, pas une
> zone qui se vide.** Un site sans RGE doit rester complet et vendeur — pas
> troué. C'est le cœur de la demande.
>
> ### Le contrat, trois attributs
>
> ```html
> <span data-rge="oui">Certifié RGE</span>
> <span data-rge="non">Devis gratuit sous 48 h</span>
> ```
>
> - `data-rge="oui"` — gardé quand l'entreprise a au moins une qualification
>   vérifiée. Supprimé sinon.
> - `data-rge="non"` — l'inverse. Gardé **uniquement** quand l'ADEME confirme
>   zéro.
> - `data-rge-noms` — élément dont le CRM remplace le texte par les noms réels
>   des qualifications détenues (« QualiPAC, Qualibat »). Mettez-y un exemple
>   plausible, il sera écrasé.
>
> Les deux versions vivent **côte à côte dans le markup livré**. Le CRM en
> supprime une. Prévoyez donc que chaque paire soit cohérente une fois seule :
> pas de séparateur orphelin, pas de virgule qui pend, pas de grille qui perd sa
> troisième colonne.
>
> ### Les six zones, avec leur texte actuel
>
> **1. Pied de page** — présent sur les 10 pages.
> ```html
> <div class="footer-labels">
>   <span class="label-badge">RGE QualiPAC</span>
>   <span class="label-badge">Qualibat</span>
>   <span class="label-badge">Qualifelec</span>
> </div>
> ```
> Version « non » : d'autres gages de confiance, vrais pour tout le monde —
> assurance décennale, devis gratuit, intervention sous 48 h, garantie
> pièces et main-d'œuvre. Gardez le même nombre de badges pour que le pied de
> page ne change pas d'équilibre.
>
> **2. `<meta name="description">`** — un attribut, donc pas d'élément à
> envelopper. Utilisez un attribut jumeau :
> ```html
> <meta name="description"
>       content="Artisan installateur RGE QualiPAC. Pompe à chaleur…"
>       data-content-sans-rge="Installateur pompe à chaleur, climatisation…">
> ```
>
> **3. Barre de confiance du hero**
> ```html
> <span class="dot"></span>
> <span>Certifié <b>RGE QualiPAC</b></span>
> ```
> Le `.dot` qui précède doit partir avec — sinon deux séparateurs se suivent.
> Enveloppez les deux dans un seul porteur, ou posez `data-rge` sur chacun.
>
> **4. Carte argumentaire** (`<article class="assure-card">`)
> ```html
> <h3>Certifié RGE QualiPAC</h3>
> <p>Une qualification reconnue par l'État, indispensable pour vous ouvrir le droit aux aides.</p>
> ```
> C'est une carte dans une grille : la version « non » doit exister, sinon la
> grille tombe à trois cartes au lieu de quatre. Proposez un autre argument
> vérifiable — délai d'intervention, garantie, matériel, zone couverte.
>
> **5. FAQ « Quelles aides puis-je obtenir ? »**
> ```html
> MaPrimeRénov', les CEE, le Coup de pouce et l'éco-PTZ peuvent se cumuler selon
> votre situation et vos revenus. Étant certifiés RGE QualiPAC, nos installations
> y ouvrent droit. Nous montons l'intégralité de vos dossiers pour vous.
> ```
>
> **6. Tout le discours « aides »** — 125 mentions par variante. **C'est la zone
> la plus sensible et elle ne se règle pas en supprimant un badge.**
> MaPrimeRénov' et les CEE **exigent légalement** un installateur RGE. Une
> entreprise sans RGE qui laisse entendre que ses travaux y ouvrent droit ne fait
> pas une exagération commerciale : elle fait perdre au client une aide qu'il
> croyait acquise.
>
> Distinguez donc deux registres :
> - **pédagogique** — « MaPrimeRénov' est une aide de l'État pour la rénovation
>   énergétique ». Vrai pour tout le monde, gardez tel quel.
> - **appropriation** — « éligible MaPrimeRénov' », « nos installations y ouvrent
>   droit », « nous montons vos dossiers ». À passer en `data-rge="oui"`.
>
> Pour la version « non », ne cherchez pas d'équivalent : une entreprise sans RGE
> n'a rien à dire sur ces aides. Retirez la section entière plutôt que d'écrire
> une phrase alambiquée — c'est le seul endroit où le vide vaut mieux qu'un
> remplacement.
>
> ### Deux règles absolues
>
> **Ne nommez jamais une qualification en dur, même dans la version « oui ».**
> Une entreprise peut détenir Qualibat et pas QualiPAC : « Certifié RGE
> QualiPAC » serait alors faux pour elle aussi. Écrivez « Certifié RGE » — vrai
> dès qu'il y a une qualification, quelle qu'elle soit — ou utilisez
> `data-rge-noms` pour que le CRM pose les vrais noms.
>
> **N'inventez aucun label.** Pas de « Certifié qualité », pas de badge maison
> qui ressemble à une certification. Les gages de la version « non » doivent être
> des faits que le CRM connaît ou que toute entreprise du métier peut affirmer.
>
> ### Le panneau Tweaks
>
> `index-tweaks.jsx` a aujourd'hui deux contrôles qui se recouvrent :
> `nbQualifications` (0→5, aperçu des logos) et `masquerCertifications`
> (booléen). Ils permettent un état incohérent : logos masqués et texte affirmant
> le RGE.
>
> **Fusionnez-les en un seul.** `nbQualifications = 0` signifie « sans RGE » et
> bascule TOUT : le bandeau, les six zones de texte, la section aides. 1 à 5
> affiche la variante « oui » avec ce nombre de logos. `masquerCertifications`
> disparaît. Un curseur, deux états de page, aucun état impossible.
>
> Livrez les six variantes (Agency, Brut, Classique, Nocturne, Studio, Verdure)
> avec le même contrat — le CRM applique le même traitement à toutes.

---

## Côté CRM, ce qui reste à écrire après

Rien n'est encore implémenté pour ce contrat. À faire quand les templates
reviennent :

| | |
|---|---|
| `strip-rge-regions.ts` | supprime `[data-rge="non"]` ou `[data-rge="oui"]` selon le verdict |
| `data-content-sans-rge` | bascule l'attribut `content` du `<meta>` |
| `data-rge-noms` | remplit avec les `nom_certificat` des qualifications valides |

Le verdict vient de `rge-compteur.ts`, déjà écrit et testé. **Reprendre sa règle
telle quelle** : `qualificationsValides > 0` → variante « oui » ; ADEME
interrogée et zéro → variante « non » ; **non vérifié → on ne touche à rien**,
la page reste telle qu'elle est livrée. C'est la décision du propriétaire
(§A10) : ne toucher que le vérifié.

Le branchement se fait dans `condition-service-markup.ts`, qui applique déjà les
conditionnements de ce type, et doit passer par `porteDesCertifications` — le
garde-fou du site publié, pas une liste de marqueurs recopiée (cf. le bug du
09/08).
