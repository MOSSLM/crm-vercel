# Prompt — Document d'audit SAMA (à coller dans une nouvelle conversation Claude Design)

---

Tu es directeur artistique. Je veux un **document d'audit imprimable** pour SAMA
Digital. Un document existe déjà, il est joli et il ne marche pas. Lis tout avant
de dessiner quoi que ce soit — en particulier la partie 3, qui décrit la
machinerie dans laquelle ton dessin doit venir se brancher. Un document qui ne
s'y branche pas ne sera jamais mis en production, quelle que soit sa beauté.

## 1. Le contexte réel

SAMA vend la refonte de sites web à des **installateurs CVC français** —
chauffagistes, climaticiens, plombiers, pompes à chaleur. Artisans et TPE de 1 à
20 salariés.

Le mécanisme de vente : on génère gratuitement un **site de démonstration** au nom
du prospect, avec ses vraies données, et on le lui envoie accompagné d'un **audit
de son site actuel**. L'audit ne conclut pas la vente — il décroche le rendez-vous
téléphonique. C'est tout ce qu'il doit faire.

**Qui le lit :** un chef d'entreprise artisan, 40–60 ans, non technique, qui lit
le soir, souvent sur un téléphone, entre deux chantiers. Il a déjà reçu vingt
plaquettes d'agences web. Il les a toutes jetées.

**Ce qu'il a déjà vu et déjà cru :** un contrôle technique automobile, un DPE, un
rapport de conformité gaz, un procès-verbal Apave. C'est le registre visuel cible.
Pas « agence web ». Pas « SaaS ». Un document de mesure.

## 2. Ce qui existe aujourd'hui et pourquoi ça échoue

Format actuel : **six pages A4 pleines** (794 × 1123 px chacune), rendues par six
composants — `src/components/audit/AuditPage1.tsx` à `AuditPage6.tsx`.

| Page | Contenu actuel |
|---|---|
| 1 | Couverture : fond navy dégradé, titre « Votre présence en ligne, analysée » |
| 2 | « Ce que nous avons observé » — 4 problèmes génériques |
| 3 | « Un site conçu pour convertir » — 4 solutions |
| 4 | « Tout est inclus » — livrables |
| 5 | Tarifs (490 €, 19 €/mois, 1 990 €) + planning |
| 6 | Prochaines étapes + CTA + coordonnées |

**Les trois défauts, par ordre de gravité :**

1. **Ce n'est pas un audit, c'est une proposition commerciale.** Une page de
   constat sur six. Les cinq autres vendent. Un document qui vend n'a aucune
   autorité, donc son constat ne pèse rien.
2. **Aucune mesure.** Pas un seul chiffre qui concerne le prospect. Les constats
   sont des cases génériques — l'un d'eux dit littéralement que le formulaire est
   « absent, placé trop bas dans la page **ou** trop long ». Ce « ou » avoue au
   lecteur qu'on n'a pas regardé son site. Les seuls chiffres présents (une
   citation Stanford à 75 %, « 7 visiteurs sur 10 ») sont des statistiques sur le
   monde, pas sur lui.
3. **Aucune hiérarchie.** Tout le corps de texte est entre 9,5 et 11,5 px. Rien ne
   saute aux yeux. Un document dont tous les éléments ont le même poids ne produit
   aucun impact, quelle que soit sa qualité graphique.

**Le diagnostic :** le document est joli et sans effet parce qu'il n'affirme rien
de vérifiable sur son lecteur. L'impact ne vient pas du graphisme, il vient du
moment où le lecteur apprend un fait sur sa propre entreprise qu'il ignorait,
exprimé dans une unité qu'il peut vérifier lui-même. Il n'y a pas un seul fait de
ce genre dans le document actuel.

**Ce qui a changé depuis, et qui rend la refonte possible :** on mesure
réellement, maintenant. Un analyseur maison note tout le parc, et **PageSpeed
Insights de Google** mesure les prospects qu'on s'apprête à démarcher — avec un
vrai navigateur. La matière première existe ; c'est le document qui n'en fait
rien.

## 3. La machinerie — comment le document vit, et par qui il est modifié

**C'est la partie qui conditionne tout le reste.** Le document n'est pas une
maquette figée : c'est un gabarit rempli automatiquement, puis retouché à la main
avant envoi, plusieurs fois par jour. Ta mise en page doit rester modifiable dans
les mêmes conditions qu'aujourd'hui — ou mieux. Tout bloc que tu dessines sans
prévoir qui l'écrit et comment on le corrige est un bloc qui sera abandonné.

### 3.1 Un document = un objet JSON persisté

Le contenu vit dans une colonne `jsonb` (`audits.content`), typée `AuditContent`
dans `src/types/index.ts`. Aujourd'hui : `{ page1, page2, page3, page4, page5,
page6, global_style }`. Chaque champ éditable porte un **chemin pointé stable** —
`page2.section_intro`, `page1.client_name`. Ces chemins sont l'ossature de tout le
système : ils servent d'identifiants d'édition, de clés de sauvegarde et de cibles
de navigation dans l'éditeur.

Ta nouvelle structure remplace ces clés. Nomme-les d'après ce que le bloc **est**,
pas d'après sa position : `verdict.*`, `methode.*`, `constats.*`, `consequences.*`,
`demo.*`, `conditions.*`. Une clé qui s'appelle `page3` devient un mensonge dès
qu'on déplace la page.

### 3.2 Trois rendus du même JSON — et c'est le défaut à ne pas reproduire

| Rendu | Fichiers | Usage |
|---|---|---|
| React | `src/components/audit/AuditPage1..6.tsx` | l'aperçu vivant dans l'éditeur |
| Chaîne HTML | `src/utils/audit/htmlPage1..6.ts`, `htmlShared.ts` | l'impression et le PDF |
| HTML mobile | `src/utils/audit/htmlMobile.ts`, `mobileCss.ts` | le rapport public, ouvert au téléphone depuis un lien |

Le même bloc est donc écrit **trois fois**, et les trois divergent en pratique.

**Conception attendue :** un bloc = **une fonction pure** `(donnees) → HTML`, sans
dépendance de framework, sans état, sans accès au DOM global. La même fonction doit
pouvoir être appelée pour l'impression et pour l'écran mobile, la seule différence
étant la feuille de style. Si un bloc a besoin de JavaScript pour exister, il ne
sortira jamais correctement en PDF.

### 3.3 Deux mains écrivent dans ce document, et elles n'écrivent pas la même chose

**L'humain**, via l'éditeur (`src/components/AuditEditorPage.tsx`) : panneau gauche
les formulaires, panneau droit l'aperçu à l'échelle. **Cliquer un bloc dans
l'aperçu l'entoure d'un liseré et fait sauter l'éditeur au bon champ** (composant
`Zone`, état `activeField`, table `FIELD_PAGE`). C'est le confort qui fait que
l'outil est utilisé, et il impose une règle de dessin :

> Tout bloc doit être une **zone rectangulaire nommée**, portant un identifiant
> stable, isolable sans casser la mise en page voisine. Un texte incrusté dans une
> composition qu'on ne peut pas cerner d'un rectangle n'est pas éditable.

Concrètement : chaque nœud éditable porte un attribut `data-field="verdict.phrase"`.
Le rendu ne fait rien d'autre ; c'est l'éditeur qui s'y accroche.

**Claude Code**, via `POST /api/audit/preparation`, après avoir lu tout ce qu'on
sait de l'entreprise en un appel (`GET /api/audit/dossier/{id}`). Il n'écrit pas
de mise en page : il écrit **au plus trois cartes de constat**, chacune de la forme
`{ cle, fonde_sur[], titre, texte }`, plus une intro et une accroche. Une
validation refuse toute carte qui ne cite aucune preuve mesurée, tout chiffre
absent du dossier, toute offre inconnue — et retombe alors sur le texte du
catalogue plutôt que de bloquer l'envoi.

Deux conséquences directes sur ton dessin :

- **Le nombre de constats est décidé par la mesure, jamais par la maquette.** Entre
  0 et 8, le plus souvent 3.
- **Le budget typographique d'une carte est déjà fixé par le contrat de
  rédaction** : titre de 3 à 90 caractères, texte de 20 à 420 caractères. Teste tes
  blocs aux deux extrémités de cette plage, pas sur un texte de démonstration
  confortable.

### 3.4 Les mots et les chiffres ne se mélangent jamais

C'est la règle la plus importante de cette partie.

| | Nature | Source | Éditable à la main ? |
|---|---|---|---|
| `AUDIT_CONTENT` | les **mots** | catalogue, Claude Code, l'opérateur | **oui** |
| `AUDIT_MESURES` | les **chiffres** | l'analyseur et Google | **jamais** |

Un chiffre retouché à la main est un faux — et c'est précisément ce que ce document
doit cesser d'être. Les mesures sont donc **injectées au rendu, à côté du
contenu**, dans un objet séparé, en lecture seule, et aucun chiffre de mesure ne
doit être recopié en dur dans `AUDIT_CONTENT`. Dans ta maquette : deux objets,
`window.AUDIT_CONTENT` et `window.AUDIT_MESURES`.

### 3.5 Les mesures réellement disponibles

Voici la forme exacte de ce qui arrive au rendu (type `AuditLu`,
`src/lib/audit-site/lecture.ts`). Utilise ces noms de champs dans ta maquette :
elle sera branchable telle quelle.

```js
{
  url_analysee, url_finale,      // ce qui a été mesuré, après redirections
  http_status, bloque, injoignable,
  note_globale,                  // 0–100, ou null si la mesure n'a pas abouti
  libelle,                       // le mot qui va avec la note
  analyse_le,                    // horodatage de NOTRE mesure
  psi_recupere_le,               // horodatage de la mesure GOOGLE
  axes: [{
    id, note, confiance,
    mesureGoogle,                // true ⇒ afficher « mesuré par Google »
    preuves: [{ cle, libelle, valeur, seuil, poids, verdict }],
    constats: [ /* voir ci-dessous */ ]
  }],
  axes_masques: [],              // axes retirés faute de confiance — à nommer, pas à cacher
  constats_google: [{
    id, categorie, titre,
    valeur,                      // déjà rédigé en français par Google
    gainMs, gainOctets, elements,
    verdict                      // "probleme" | "moyen"
  }],
  ttfb_ms, chargement_ms, poids_octets,
  capture_url,                   // capture du site actuel, hébergée chez nous
  note_globale_demo              // la note du site préparé — le troisième repère de la réglette
}
```

S'y ajoutent, côté dossier : la fiche Google (nombre d'avis, note moyenne, **et la
médiane de la commune**, qui situe sans inventer de seuil) et les qualifications
RGE encore valides avec leur date d'échéance.

### 3.6 Le catalogue et les deux profondeurs

Les constats viennent d'un catalogue de clés (`src/data/auditIssues.ts`), rangées
en trois piliers. Un tri par force (`classerParForce`) retient les plus lourds ;
les autres alimentent une ligne « **et X autres améliorations possibles** » qu'il
faut prévoir dans la maquette — c'est elle qui montre qu'on n'a pas tout dit.

Deux profondeurs du même document existent déjà dans le code (`AuditVariante`) :
`court`, ce qui part par message, et `complet`, ce qu'on déplie en rendez-vous.
Dis explicitement, pour chaque bloc, s'il survit en version courte.

## 4. Le principe directeur

**Le document constate. Il n'argumente pas. Il ne vend pas.** L'argumentation se
fera au téléphone, et elle sera possible précisément parce que le document ne
l'aura pas faite.

Corollaires :
- Le prix sort du document. C'est un diagnostic, pas un devis. Un diagnostic
  s'accepte ; un devis se négocie.
- Les livrables, le planning et les « solutions » sortent aussi.
- La seule chose qui reste du registre commercial : le site démo est en ligne,
  voici l'adresse.

## 5. Structure demandée

On passe de six pages à **trois feuilles, cinq blocs**. C'est une réduction de
moitié, et elle est volontaire.

**Feuille 1 — pleine page A4. LE VERDICT.**

Une seule page, non coupée en deux. C'est la page qui décide si le document est lu.
Elle contient exactement :

- Le nom de l'entreprise, en dominante typographique de la page
- L'adresse du site mesuré
- La date **et l'heure** de la mesure
- La note sur 100, sur l'échelle à bandes (voir §7, élément signature)
- **Une seule phrase de constat** — la plus dure et la plus vérifiable des mesures
  relevées

Rien d'autre. Pas de titre poétique, pas de sous-titre d'accroche, pas de mockup de
navigateur, pas de dégradé.

**Feuille 2, demi-page haute — CE QUI A ÉTÉ MESURÉ.**

La méthode : ce qui a été testé, comment, quand, avec quel outil, et **ce qui n'a
pas été testé** — les axes écartés faute de confiance sont dans `axes_masques`, ils
se nomment, ils ne se cachent pas. Les sources citées (PageSpeed Insights de
Google, annuaire des entreprises de l'État, jeu de données RGE de l'ADEME, avis
Google). Le lien permettant au lecteur de refaire le test lui-même.

Cette page vient **avant** les constats, comme dans un vrai rapport de diagnostic.
C'est elle qui rend tout le reste incontestable. Aucun concurrent ne la met.

**Feuille 2, demi-page basse — LES CONSTATS.**

Un tableau. Trois colonnes : *ce qui a été observé* / *la mesure* / *ce que ça fait
au visiteur*. Entre 3 et 8 lignes selon le prospect. Le tableau doit rester lisible
à 3 lignes comme à 8. Une ligne mesurée par Google porte une marque discrète : la
caution vaut mieux que notre parole, et elle ne se revendique pas à tort.

**Feuille 3, demi-page haute — CE QUE ÇA CHANGE.**

Les conséquences, tirées uniquement des constats de la page précédente et des
données propres du prospect. Toute estimation affiche ses hypothèses en clair, dans
la même page.

**Feuille 3, demi-page basse — LE SITE EST DÉJÀ EN LIGNE.**

L'avant/après, exprimé en secondes et en gestes (pas en scores). L'URL au nom du
prospect. Un QR code. **Un seul appel à l'action de tout le document, ici.**

**Feuille 4 — optionnelle, désactivée par défaut (`conditions.affichees: false`).**
Conditions et tarifs, pour les cas où le prospect les demande.

## 6. Règles éditoriales — non négociables

1. **Aucune donnée inventée.** Tout chiffre affiché provient d'une source lue et
   citable. Cette règle n'est pas une consigne : elle est appliquée par le code à
   l'écriture, et un chiffre absent du dossier fait rejeter la carte entière.
2. **Aucun « ou » dans un constat.** Si on ne sait pas laquelle des deux situations
   est vraie, on n'écrit pas la ligne.
3. **Aucune statistique générique.** Pas de « 75 % des internautes », pas de
   « 7 visiteurs sur 10 ». Une statistique sur le monde n'est pas un constat sur
   lui.
4. **Aucun vocabulaire technique dans le corps du document.** Bannis : LCP, CLS,
   INP, TTFB, Lighthouse, Core Web Vitals, requêtes HTTP, SEO, conversion,
   responsive, **et surtout les Ko et les Mo**. Le poids d'une page se mesure en
   octets et se raconte en secondes.
5. **Unités autorisées :** les secondes, le oui/non, les comptages de choses
   visibles (« 3 clics pour trouver un numéro de téléphone »), les positions
   (« 14ᵉ sur *chauffagiste à Autun* »), les dates (« certificat expiré le
   14/03/2026 »).
6. **Le test du téléphone.** Chaque constat doit pouvoir être vérifié par le
   prospect, sur son propre téléphone, devant le commercial, en moins de dix
   secondes. Un constat qui échoue à ce test va en annexe ou disparaît.
7. **Les axes ne sont pas une liste fixe — ne les code jamais en dur.** Il y en a
   quatre à six, et leurs noms changent selon que Google a mesuré ou non :

   | Sans mesure Google | Avec mesure Google (le cas cible) |
   |---|---|
   | Rapidité | Rapidité |
   | Visibilité sur Google | Visibilité sur Google |
   | Sur téléphone | Accessibilité |
   | | Bonnes pratiques |
   | Prise de contact | Prise de contact |
   | Notoriété | Notoriété |

   Dès que Google a mesuré, ses catégories remplacent les nôtres et l'axe « Sur
   téléphone » **disparaît** — il n'est pas masqué, il est remplacé. Une maquette
   qui suppose quatre axes cassera le jour où il y en aura six.
8. **Ton :** constat, jamais promesse. « Votre formulaire demande 9 champs. » et non
   « Nous simplifierons votre formulaire. »
9. **Ne reprocher à personne ce qu'il fait bien.** La mesure liste aussi les tests
   réussis. Un rapport qui ne relève que des fautes se lit comme un argumentaire ;
   un rapport qui commence par ce qui va se lit comme un diagnostic.
10. **Une mesure s'affiche datée.** Google ne rend pas deux fois le même chiffre :
    3 910 ms puis 3 650 ms sur le même site à dix minutes d'intervalle. L'ordre de
    grandeur est solide, la décimale ne l'est pas. Jamais présentée comme une
    constante du site.

## 7. Direction visuelle

**Palette — tokens de marque déjà en production (`src/components/audit/AuditShared.tsx`), à conserver tels quels :**

```
--nuit:  #0B1D3A    --azur:  #3A7BD5    --brume: #B5D0F0
--creme: #F4F1EB    --blanc: #E8F3FF
```

**Typographies existantes, à conserver :** Cormorant Garamond (300/400, italique
disponible) en display, DM Sans (300/400/500) en corps. Les chiffres doivent être
en **tabular figures** (`font-variant-numeric: tabular-nums`) partout où ils
s'alignent.

**Cinq décisions à appliquer :**

1. **Fond clair par défaut, navy en accent.** La couverture actuelle est navy plein
   avec un dégradé radial : c'est la signature d'une plaquette d'agence. Un rapport
   de mesure est sur fond clair. Le navy devient un bandeau d'en-tête et rien
   d'autre.
2. **Le nom du prospect domine celui de SAMA.** Aujourd'hui c'est l'inverse.
   Inverse-le complètement : son nom est le plus gros élément typographique de la
   feuille 1, SAMA n'apparaît qu'en pied de page.
3. **Contraste d'échelle d'au moins 8:1** entre le chiffre du verdict et le corps
   de texte. Le verdict doit être lisible à un mètre. Le corps peut rester petit.
4. **Zéro décoration sur la page de verdict.** Pas de grain, pas de dégradé, pas de
   mockup de navigateur, pas d'ombre portée, pas d'angle arrondi supérieur à 2 px.
   Chaque élément décoratif retiré augmente la crédibilité.
5. **Élément signature — l'échelle à bandes.** La note ne se présente jamais seule.
   Elle se lit sur une réglette horizontale à bandes, façon étiquette DPE, portant
   **trois repères sur le même axe** : le prospect (`note_globale`), la médiane des
   installateurs CVC mesurés, et le site préparé (`note_globale_demo`). C'est le
   seul élément graphique fort du document, et il fait tout le travail : il est
   culturellement lisible en une seconde par un artisan français, il rend la note
   relative (donc non vexante), et il ne ressemble à aucun outil en ligne.

   Interdits sur cette réglette : le feu tricolore vert/orange/rouge (signature des
   outils SEO gratuits), l'anneau de progression circulaire (signature de Google
   PageSpeed), l'aiguille de compteur.

**À éviter dans l'exécution :** le duo « gros chiffre + petit label + accent
dégradé » posé en héros, les cartes arrondies à ombre douce, les marqueurs
numérotés 01/02/03 sur du contenu qui n'est pas une séquence.

## 8. Contraintes techniques

- **Format page :** 794 × 1123 px (A4 à 96 dpi). `@page { size: A4; margin: 0 }`,
  `print-color-adjust: exact`, sauts de page explicites. Une « feuille coupée en
  deux » reste **une seule page de 1123 px** contenant deux blocs : c'est l'élément
  page qui pagine.
- **Zéro requête réseau au rendu.** C'est un bug réel et récurrent du document
  actuel, sur trois fronts :
  - les polices sont chargées depuis `fonts.googleapis.com`
    (`src/utils/auditHtmlExport.ts`) et arrivent après le snapshot une fois sur
    trois ;
  - la couverture affiche une capture via `image.thum.io` et une favicon via
    `google.com/s2/favicons` — mêmes symptômes ;
  - un QR code appelé à une API externe échouerait de la même façon.

  Donc : **polices en woff2 encodées en base64 dans le CSS**, QR code généré en SVG
  inline, capture prise depuis `capture_url` (hébergée chez nous), et un état vide
  dessiné pour le cas où elle manque.
- **Deux chemins d'impression, le document doit tenir dans les deux.** Aujourd'hui
  l'export ouvre une fenêtre et appelle `window.print()` ; un rendu serveur
  (Puppeteer) est prévu et n'existe pas encore. Ne fais donc dépendre aucun rendu
  des réglages de la boîte de dialogue d'impression : les fonds doivent être forcés
  en CSS, pas cochés par l'utilisateur.
- Le document doit rester lisible **imprimé en noir et blanc sur laser
  bureautique**. Teste chaque contraste en niveaux de gris ; ne fais jamais reposer
  une information sur la seule couleur — la réglette en particulier.
- **Le même contenu est aussi lu au téléphone**, dans un rapport public ouvert
  depuis un lien envoyé par message. Prévois, pour chaque bloc, comment il se
  comporte sur 360 px de large. Le tableau de constats est le point critique.
- Sortie en fichiers séparés, sur le modèle des autres maquettes du dépôt :
  `audit.html`, `audit.css`, `audit-content.js`, `audit-render.js`.
- Chaque bloc doit être une section HTML autonome, réimportable indépendamment,
  rendue par une fonction pure.

## 9. Variabilisation

Tout le texte vit dans `window.AUDIT_CONTENT`, structuré par bloc ; toutes les
mesures dans `window.AUDIT_MESURES`, en lecture seule. Aucune chaîne en dur dans le
rendu, aucun chiffre de mesure dans le contenu.

**Chaque bloc variable a un état vide *défini*, jamais masqué.** Un trou dans une
page se voit ; une substitution ne se voit pas. À gérer explicitement :

- **Nombre de constats : 3, 5 ou 8.** La demi-page doit tenir dans les trois cas
  sans reflow ni page qui déborde.
- **Site injoignable** (`injoignable: true`) — variante complète de la page verdict :
  pas de note, mais un relevé d'incident (trois vérifications horodatées, code de
  réponse `http_status`, date d'expiration du certificat, et où pointe la fiche
  Google). C'est le cas le plus fréquent et la meilleure accroche : il mérite un
  gabarit à part entière, pas une case vide.
- **Aucune mesure Google** (`psi_recupere_le` absent ou vieux de plus de 30 jours) :
  quatre axes au lieu de six, aucun constat Google, et la page « ce qui a été
  mesuré » ne doit pas citer une source qu'on n'a pas utilisée.
- **Axes écartés** (`axes_masques` non vide) : ils se nomment sur la page méthode.
- **Aucun avis Google** — le bloc devient autre chose, il ne disparaît pas.
- **Capture du site absente** (`capture_url: null`).
- **Nom d'entreprise long** : « SARL Établissements Dupont-Lachenal & Fils » ne doit
  casser aucun en-tête. Budget de caractères défini et testé.
- **Note absente** (mesure non aboutie) : la réglette affiche les deux repères
  restants sans se déformer.

## 10. Livrables

1. Un plan de conception court avant tout code : palette, échelle typographique,
   concept de mise en page, et l'élément signature — avec la justification de
   chaque choix par rapport à ce brief.
2. **Une table de correspondance** — c'est le livrable qui rend le portage
   possible : pour chaque bloc, son chemin JSON, son `data-field`, sa source
   (opérateur / mesure / Claude Code) et son comportement en version courte.
3. Le document complet, les 3 feuilles, avec du contenu d'exemple réaliste (une
   entreprise de chauffage fictive, des mesures plausibles et cohérentes entre
   elles).
4. Les variantes d'états : 3 constats, 8 constats, site injoignable, et sans mesure
   Google.
5. Une capture de la feuille 1 réduite à 200 px de large — **si le nom de
   l'entreprise, le chiffre et la date n'y sont pas lisibles, la page est à
   refaire.** C'est à cette taille qu'elle est vue en vignette dans une messagerie,
   et c'est cette vignette qui décide de l'ouverture.

## 11. Le critère de réussite

Un chauffagiste de 52 ans qui reçoit ce document doit avoir, en dix secondes,
l'impression d'avoir reçu un **rapport le concernant** — et non une publicité.

Le test : retire le logo SAMA et toutes les couleurs. S'il reste un document que le
lecteur croirait volontiers émis par un organisme de contrôle, c'est réussi. S'il
reste une plaquette, c'est raté.

Et le second test, moins visible mais aussi décisif : **un opérateur doit pouvoir
corriger n'importe quelle phrase du document en moins de dix secondes, sans ouvrir
un fichier de code.** Si ta mise en page l'en empêche, elle ne sera pas mise en
production.
