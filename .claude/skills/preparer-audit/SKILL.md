---
name: preparer-audit
description: Préparer et remplir l'audit d'un prospect artisan — mesurer son site, rédiger les constats, soumettre au CRM. À utiliser dès qu'il s'agit de préparer un audit, remplir un audit, auditer une entreprise, ou rédiger les constats d'un prospect avant démarchage.
---

# Préparer un audit

Tu prépares un document de trois pages qu'un artisan lira sur son téléphone, et
qu'il pourra contester ligne par ligne. C'est la contrainte qui commande tout le
reste : **chaque affirmation doit être vérifiable par lui, en moins de dix
secondes, sans nous croire sur parole.**

Le CRM refuse ce qui ne l'est pas. Ce n'est pas un obstacle à contourner — c'est
la raison pour laquelle ce document se vend.

## Ce que tu ne remplis jamais

Commence par là. Ces valeurs existent déjà, mesurées ou décidées, et **toute
tentative de les écrire est refusée** :

| Jamais toi | D'où ça vient |
|---|---|
| La note sur 100 | `note_globale`, calculée par l'analyseur |
| Les notes par axe | l'analyseur, ou PageSpeed quand il a mesuré |
| La médiane du parc | calculée sur les 430 sites analysés |
| **La colonne « Après »** | le catalogue, écrit une fois pour tous les prospects |
| Les prix, les noms d'offres | la table `offres` |
| Les étapes, les livrables | le contenu par défaut |

La colonne « Après » mérite un mot : **on ne mesure jamais le site démo**, c'est
une décision. Sa colonne est donc la seule du document qui promette un résultat,
et rien ne pourrait vérifier ce que tu y écrirais. Deux prospects doivent
recevoir la même promesse pour le même problème. Le champ `apres` est rejeté par
le schéma — n'essaie pas.

**Ce que tu écris, et c'est tout** : trois constats (leur titre, leur texte, leur
valeur mesurée), une introduction, une accroche, les offres retenues, et les
observations que tu as relevées toi-même.

## La boucle

### 1. Mesurer avec Google — une fois par prospect

```
POST /api/audit-site/{entrepriseId}/pagespeed
```

Environ quarante secondes : Google fait tourner un vrai Chrome. **À ne lancer que
sur une entreprise qu'on s'apprête à démarcher**, jamais en balayage de parc.

L'analyse maison doit exister d'abord (`409` sinon) : c'est elle qui détermine
l'URL réellement atteinte après redirections. Inutile de refaire une mesure de
moins de trente jours.

### 2. Lire le dossier

```
GET /api/audit/dossier/{entrepriseId}
```

Trois à six kilo-octets. L'entreprise, sa fiche Google, ses qualifications RGE,
les axes notés avec leurs preuves — **valeur et seuil** —, les constats émis, les
offres proposables, et deux champs à lire attentivement :

- `univers` — la référence exacte de la validation. Ce qui n'y figure pas ne
  passera pas.
- `observationsPossibles` — les cases que tu as le droit de remplir toi-même.

### 3. Lire le détail, seulement pour rédiger

```
GET /api/audit/dossier/{entrepriseId}?psi=complet
```

Vingt à cent cinquante kilo-octets : le conseil de Google pour chaque constat et
les ressources visées une par une — cette image de 1,2 Mo, ce script qui bloque
l'affichage pendant 3,6 s. C'est le dossier d'instruction, jamais montré tel quel
au prospect.

### 4. Soumettre

```
POST /api/audit/preparation
{ "opportunite_id": "…", "entreprise_id": 123, "preparation": { … } }
```

## Les quatre règles

Formulées comme des interdits, parce que c'est ainsi qu'elles s'appliquent :

1. **Un constat sans preuve en échec n'existe pas.** Chaque carte cite au moins
   une clé de `univers.preuvesEnEchec`.
2. **Une offre hors catalogue n'existe pas.** Les codes viennent de
   `univers.offresProposables`.
3. **Un chiffre absent du dossier n'existe pas.** Tout nombre de ton titre, de
   ton texte et de ton `avant` doit figurer dans `univers.nombres`. Les années et
   les petits délais (« sous 7 jours ») passent librement.
4. **Un rejet ne bloque jamais.** Ce qui ne passe pas est écarté et **nommé** ;
   l'audit garde le texte du catalogue pour le reste. Lis les rejets : ils disent
   quoi corriger, tu n'as pas à deviner.

## Ce que tu peux relever toi-même

L'analyseur ne mesure pas tout : il sait qu'un formulaire existe, pas qu'il
demande neuf champs ; qu'un numéro est cliquable, pas combien de gestes il faut
pour l'atteindre. Ce sont pourtant les chiffres qui parlent le plus.

Tu ouvres le site de toute façon. Tu peux donc les relever — **dans les cases de
`observationsPossibles`, et seulement celles-là.** Tu remplis des cases qu'on a
définies, tu n'en crées pas.

Une observation acceptée devient citable sous `obs:<cle>` et son chiffre devient
écrivable. Seules celles **en échec** peuvent fonder une carte : « vos avis sont
bien affichés » est une bonne nouvelle qu'on peut écrire, pas un argument.

**Aucune case ne permet d'écrire une position dans les résultats Google**, et
c'est délibéré : un rang relevé une fois, non daté, non reproductible, est la
ligne la plus contestable du document — le prospect tape la requête, voit un
autre chiffre, et tout le rapport perd sa valeur.

## Choisis la bonne preuve, pas la première

Chaque preuve du dossier porte une **`force`** : ce que le signal pèse, multiplié
par l'ampleur avec laquelle ce site-là le rate. Un constat peut se déclencher sur
plusieurs preuves — « site lent » vient du serveur **et** du poids de la page.

**Fonde ta carte sur la preuve la plus forte, et écris SA valeur dans `avant`.**
Un serveur à 1,3 s pour un seuil de 0,8 s a une force faible : il ne rate que de
120 ms. Une page à 5,7 Mo pour 2 Mo a une force élevée. Écrire « 1,3 s » ferait
reposer tout le constat sur sa jambe la plus faible, et le prospect qui trouve
son serveur correct rejetterait la ligne entière — avec le reste du document.

Le classement final ne t'appartient pas : la route ordonne les lignes par force
et met les pires en premier. Tu choisis **de quoi** parler, la mesure décide
**dans quel ordre**.

## Comment écrire

- **Des unités qu'un artisan lit sans traduction** : secondes, nombre de choses
  visibles, oui/non, dates. Jamais de pourcentage — sur un seul site il n'a pas
  de dénominateur vérifiable. Jamais de Ko, de LCP, de « on-page », de
  « responsive », de « schema markup ».
- **Nomme ce qui se voit, pas ce qui se code.** « Onze photos sur quatorze n'ont
  pas de description » plutôt que « attributs alt manquants ».
- **Dis l'effet, une fois, sans le dramatiser.** Le constat mesuré suffit ; le
  document n'a pas besoin d'accabler.
- **Ne parle jamais du concurrent qui a fait le site.** Le prospect l'a peut-être
  choisi lui-même.

## Un exemple qui passe

```json
{
  "intro": "Votre site répond, il est en ligne, et il ne bloque rien. Deux points le pénalisent, tous deux mesurés ci-dessous et vérifiables depuis votre téléphone.",
  "accroche": "Deux points mesurés sur votre site, dont un qui vous coûte des appels.",
  "cartes": [
    {
      "cle": "slow_site",
      "fonde_sur": ["ttfb"],
      "avant": "3,4 s",
      "titre": "Votre serveur met 3,4 secondes à répondre",
      "texte": "Pendant ces trois secondes, l'écran reste blanc : rien ne s'affiche encore. Le seuil au-delà duquel un visiteur sur deux repart est de 800 ms."
    },
    {
      "cle": "form_not_accessible",
      "fonde_sur": ["obs:champs_formulaire"],
      "avant": "9 champs",
      "titre": "Votre formulaire demande 9 champs",
      "texte": "Neuf cases à remplir au clavier d'un téléphone, souvent debout sur un chantier. Un nom, un numéro et deux lignes suffisent à rappeler."
    }
  ],
  "observations": [
    { "cle": "champs_formulaire", "valeur": 9 },
    { "cle": "avis_affiches", "valeur": false }
  ],
  "offres": ["site_demo_cle_en_main", "GMB_RELANCE_AVIS"]
}
```

## Deux exemples qui échouent

**Un chiffre qui n'est pas dans le dossier.**

```json
{ "avant": "9,8 s", "titre": "Votre site met 9,8 secondes à s'afficher", "…": "…" }
```
```
règle 3 — chiffre absent du dossier : 9,8
```

Le dossier disait 3,4 s. Reprends la valeur mesurée, ne l'arrondis pas vers le
haut : c'est celle que le prospect va vérifier.

**Une observation hors catalogue.**

```json
{ "observations": [{ "cle": "taux_de_rebond", "valeur": 62 }] }
```
```
règle 4 — obs:taux_de_rebond : clé absente du catalogue d'observations
```

Et la carte qui s'appuyait dessus tombe avec elle, en règle 1. Le taux de rebond
n'est mesurable par personne depuis l'extérieur, et un pourcentage ne se vérifie
pas en dix secondes.

---

Le détail complet — contrat champ par champ, catalogue d'observations, carte du
document bloc par bloc — est dans `docs/audit-preparation-claude-code.md`.
