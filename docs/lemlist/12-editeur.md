# L'éditeur unique — un composant, sept canaux

> Écrit le 20 août 2026. Les densités citées sont relevées en base le jour même.
> Deux items du plan sont corrigés ici, et la correction vient d'une mesure.

---

## 1. Ce que « un seul éditeur » veut dire concrètement

La demande était explicite : **le même constructeur pour l'e-mail et pour
WhatsApp**. Ce n'est pas une préférence esthétique — c'est la cause de l'éclatement
qu'on répare. Chaque canal avait « son » écran : l'onglet WhatsApp avec ses
modèles en `localStorage`, l'onglet e-mail avec les siens, le builder avec un
troisième. Trois surfaces, trois façons d'écrire, et un modèle rédigé dans l'une
partait amputé depuis l'autre.

Un seul composant, donc, et **ce que le canal accepte est une DONNÉE, pas une
branche de code** : `CAPACITES` dans `src/lib/automations/redaction.ts`. Ajouter
le SMS ou LinkedIn en couche 2 bis, c'est ajouter une entrée à ce tableau.

| Canal | Objet | Riche | Pièces | Limite | Ce qu'on affiche |
| --- | --- | --- | --- | --- | --- |
| E-mail | oui | oui | oui | — | `N caractères` |
| WhatsApp | non | non | non | *confort 900* | `N caractères · long pour un téléphone` |
| SMS | non | non | non | *segments* | `N car. · 3 SMS · « ’ » coûte cher` |
| Message LinkedIn | non | non | non | *confort 1200* | idem WhatsApp |
| Note d'invitation LinkedIn | non | non | non | **200, dur** | `N / 200 caractères` |
| Script d'appel · Consigne | non | non | non | — | ne part pas |

### Une limite dure et une longueur de confort ne sont pas la même chose

Les confondre ment dans les deux sens : inventer une contrainte technique là où
il n'y a qu'un avis éditorial fait obéir à une opinion ; l'inverse laisse partir
un message que la plateforme refusera.

**Une seule limite dure existe dans tout le catalogue** : les 200 caractères de
la note d'invitation LinkedIn. Le reste est notre avis, et l'éditeur le dit avec
ses mots (« long pour un téléphone »), pas avec une barre rouge.

### Le décompte de LinkedIn était faux deux fois

L'ancien libellé affichait `${step.message.length}/300`.

1. **300 n'est pas la limite** : LinkedIn plafonne la note d'invitation à **200**.
2. **`step.message.length` n'est la longueur de personne.** Un message de
   190 signes dont 40 sont `{{company.name}}` en fait 180 pour « Sama » et 210
   pour une raison sociale longue. **La longueur se mesure sur le RENDU.**

C'est la même famille d'erreur que partout ailleurs dans ce chantier : afficher
un chiffre qui ressemble à une mesure sans en être une.

---

## 2. Deux façons d'écrire une fois pour tout le fichier

### Le repli — `{{contact.first_name | "à vous"}}`

Sans lui, une variable absente laisse un trou, et le seul recours est la bascule
entreprise/contact : **deux textes entiers pour un mot qui change**. Le repli
traite le cas au mot près — et surtout, il traite celui que la bascule ne sait
pas traiter : une variable qui manque à quelques fiches sur un champ sans version
alternative (la ville, le téléphone).

Le repli est un **littéral entre guillemets**, jamais une autre variable : une
chaîne de replis serait un langage, et un langage se débogue. Ici, ce qui part se
lit dans le texte même.

Conséquence directe, et c'est tout l'intérêt : **une variable qui porte un repli
n'est plus « manquante »**, donc l'éditeur n'alerte plus dessus. Et, effet de
bord utile, `pickVariant` retient enfin la version contact pour une fiche sans
prénom, puisque la phrase se tient.

### Le texte conditionnel — `{% si … %} … {% sinon %} … {% fin %}`

C'est *la* distinction des deux cohortes, dans une seule phrase :

```
Je vous propose {% si company.website %}une refonte{% sinon %}une création{% fin %} de site.
```

**Il ne teste que le sac de variables du message**, et c'est une frontière, pas
une limite subie :

| | Étape `condition` | Texte conditionnel |
| --- | --- | --- |
| Branche | **la séquence** | **la phrase** |
| Connaît | la base (`conditions-db.ts`) | ce que le message connaît |
| Sait dire « je ne sais pas » | oui (`non_mesure`) | non |
| Laisse une trace | `vars.conditions` | — |

Sans cette frontière, l'aperçu de l'éditeur devrait aller chercher en base des
faits que le sac n'a pas — et il ne montrerait plus ce qui part. **Un aperçu qui
ment est pire que pas d'aperçu.**

Ce n'est pas gênant : le cas qui motive tout se dit exactement avec
`{% si company.website %}`, puisque c'est la présence du site qui sépare les
cohortes A et B.

### L'ordre des deux passes n'est pas interchangeable

**On déplie, PUIS on interpole.** Interpoler d'abord poserait le contenu des
variables dans le texte, où un `{%` venu d'une raison sociale deviendrait une
balise. Déplier d'abord, c'est garantir que la structure du message est celle
qu'on a écrite — jamais celle qu'un prospect a dans son nom. Il y a un test pour
ça, avec une `SARL {% fin %} & Fils`.

### Trois choses se disent différemment

| | Quoi | Effet |
| --- | --- | --- |
| **Trou** | une variable citée sans repli, que le sac ne remplit pas | le message part, en creux — on avertit |
| **Faute** | un bloc mal fermé, une clé inventée | on ne sait pas ce qui partirait — **l'enregistrement est refusé** |
| **Dépassement** | dur ou de confort | refus, ou avis |

Le trou se juge sur le texte **déplié** : signaler une variable enfermée dans une
branche que ce prospect ne prendra pas est exactement la fausse alerte que le
conditionnel existe pour supprimer.

Une clé inventée (`{% si compagny.website %}`) est signalée, et pas par excès de
zèle : elle serait **toujours vide**, donc enverrait **tout le monde** dans la
branche « sinon », en silence. C'est le même accident que `missingVariables` a
été écrit pour empêcher sur les variables.

### Ce qui se passe quand c'est mal écrit

Jamais de balise laissée brute dans un message envoyé — règle héritée de
`interpolateVars`. Un `{% si %}` jamais fermé est lu comme s'il se fermait à la
fin du texte, ce qui est sa lecture naturelle ; un `{% sinon %}` orphelin
disparaît sans emporter de texte. Dans les deux cas **la faute remonte** et
l'éditeur refuse : ce rattrapage est un filet, pas un comportement.

---

## 3. Le SMS, et le caractère qui triple la facture

Le SMS se facture par segment, et un seul caractère hors alphabet GSM 03.38 fait
tomber le segment de **160 à 70** caractères.

Ce qui n'est pas dans cet alphabet, et qui nous concerne directement :

- `ê â î ô û ë ï` — aucun circonflexe ni tréma sur a/e/i/o/u ;
- **`ç` minuscule.** La table porte `Ç` (0x09) et lui seul. « français »,
  « reçu », « ça » basculent donc, ce que personne ne devine ;
- **l'apostrophe typographique `’`** — que tout le CRM écrit, jusque dans ce
  document.

L'éditeur ne dit donc pas « votre message coûte 3 SMS » — ça ne dit pas quoi
corriger. Il dit **quel caractère** a fait basculer.

---

## 4. Deux gardes du moteur ont changé d'avis

`etapePromettUnAuditAbsent` et `etapePromettUneDemoAbsente` gèlent l'inscription
quand une étape promet une pièce que l'entreprise n'a pas. Elles jugeaient sur le
texte **brut**.

Avec les conditionnels, c'est devenu faux : un message qui dit

```
{% si company.demo_url %}voici votre aperçu {{company.demo_url}}{% fin %}
```

ne promet **rien** à un prospect sans démo — la branche n'est pas prise, la
phrase n'existe pas. Juger sur le brut gèlerait l'inscription pour une promesse
que le prospect ne lira jamais, et **un gel est exactement ce que la couche 0 a
passé son temps à défaire**.

Les deux gardes jugent désormais sur le texte déplié. Effet de bord voulu : le
conditionnel donne enfin **une façon d'écrire une étape qui se dégrade au lieu de
se bloquer**.

---

## 5. Les images — le plan avait tort, et c'est la base qui le dit

Le plan écrivait, à propos des images : *« là nous sommes mieux placés qu'eux […]
nous stockons déjà `entreprises_audit_site.capture_url` : la capture du site
actuel du prospect »*. C'était l'argument le plus flatteur du chantier.

**Relevé le 20/08/2026 :**

| Mesure | Valeur |
| --- | --- |
| Lignes dans `entreprises_audit_site` | 1 968 |
| … qui portent une `capture_url` | **2** |
| Entreprises attribuées | 908 |
| … avec une capture de leur site | **2** |
| … avec un `logo_url` | 208 |
| Jetons de plaquette (`plaquette_token`) | **2**, pour 4 vues |
| Jetons de rapport | 161, pour **1** vue |

La capture existe **deux fois sur mille neuf cent soixante-huit**. Bâtir une
variable `{{company.site_capture}}` là-dessus, c'est ajouter au catalogue une
variable qui partirait vide pour 906 prospects sur 908 — précisément l'accident
que tout le reste de ce fichier est écrit pour empêcher.

**Ce n'est pas un problème de code.** `capturerSite` existe et fonctionne
(`src/lib/audit-site/shot.ts`). Il appelle un **service de rendu tiers payant**
(ScreenshotOne, cf. le registre des bots), et le registre porte déjà la règle
voisine : *« PageSpeed jamais en masse : le quota est la ressource rare »*.
Capturer 908 sites est **une décision de dépense**, pas une tâche technique — et
elle n'a pas été prise.

**Donc : aucune variable d'image n'est ajoutée.** L'item redevient ce qu'il est :
*capturer le parc, puis exposer la capture*, dans cet ordre. Le mettre au
catalogue d'abord donnerait un éditeur qui propose une image que personne n'a.

C'est la deuxième correction au plan par la mesure, après `a_ouvert` / `a_clique`
(couche 2) — et elle a la même forme : **le préalable manquait, et il ne se
rattrape pas en écrivant du code.**

---

## 6. Où c'est, et ce qui reste

| Quoi | Où |
| --- | --- |
| Le repli | `src/lib/automations/variables.ts` — le motif, et `missingVariables` |
| Conditionnels, capacités, coût SMS | `src/lib/automations/redaction.ts` — 40 tests |
| L'éditeur | `src/components/automations/MessageEditor.tsx` — 17 tests |
| Le rendu du moteur | `engine.ts` · `interpolate` → `rendreMessage` |

**Reste sur cette couche :** les variantes A/B avec le taux de réponse par
variante, et la bibliothèque de modèles présente **au moment où l'on écrit** (les
trois tables existent, il leur manque d'être offertes dans l'éditeur plutôt
qu'ailleurs).
