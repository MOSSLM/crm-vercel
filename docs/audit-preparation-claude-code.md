# Préparer un audit depuis Claude Code local

Ce document décrit la boucle qu'un agent local exécute, entreprise par
entreprise, après avoir qualifié et enrichi. Elle tient en **quatre appels HTTP**
et n'exige aucun secret côté agent.

---

## La question qui décide de tout : où vivent les données ?

**Pas dans un fichier par entreprise.** C'était l'instinct naturel — un fichier
par prospect pour ne pas se perdre — et il faut y résister, pour trois raisons
concrètes :

1. **Le CRM ne le lirait pas.** L'éditeur d'audit, la page publique et les
   séquences d'envoi lisent la base. Un fichier local est invisible pour eux :
   on aurait un dossier complet sur le disque et un audit vide dans l'outil.
2. **Il serait perdu.** Un agent qui tourne ailleurs, une machine réinstallée,
   un collègue qui reprend le prospect : la donnée doit survivre à la session
   qui l'a produite.
3. **Deux vérités finiraient par diverger.** Le fichier dirait 3 650 ms, la base
   3 910 ms — Lighthouse varie d'un tir à l'autre —, et personne ne saurait
   lequel a été envoyé au prospect.

La règle est donc : **tout est écrit en base au moment de la mesure**, et
l'agent relit ce dont il a besoin, quand il en a besoin.

**Le vrai problème que le fichier cherchait à résoudre — ne pas saturer le
contexte — est réglé autrement : par deux niveaux de lecture.** Le dossier court
suffit à décider ; le dossier PageSpeed complet ne se demande que pour rédiger.

| Lecture | Poids indicatif | Quand |
|---|---|---|
| `GET /api/audit/dossier/{id}` | ~3 à 6 Ko | toujours |
| `GET /api/audit/dossier/{id}?psi=complet` | ~20 à 150 Ko | au moment de rédiger |

---

## La clé PageSpeed ne sort pas du serveur

L'agent n'a **pas** besoin de `PAGESPEED_API_KEY`. Il appelle une route du CRM,
qui détient la clé, fait l'appel à Google et enregistre le résultat.

C'est le bon découpage pour quatre raisons : la clé reste en un seul endroit
(donc révocable en un seul geste), elle n'apparaît dans aucune configuration
locale ni dans aucun transcript de conversation, le résultat est stocké sans que
l'agent ait à connaître le format de Google, et le quota se surveille au même
endroit que la dépense.

---

## La boucle, entreprise par entreprise

### 1. Mesurer avec Google — une fois par prospect

```
POST /api/audit-site/{entrepriseId}/pagespeed
```

Quarante secondes environ : Google fait tourner un vrai Chrome. À ne lancer
**que sur les entreprises qu'on s'apprête à démarcher**, jamais en balayage de
parc.

L'analyse maison doit exister d'abord (la route répond `409` sinon) : c'est elle
qui détermine l'URL réellement atteinte après redirections. Mesurer l'URL de la
fiche donnerait des chiffres portant sur une autre page que celle qu'on montre.

Inutile de refaire la mesure si elle a moins de trente jours.

### 2. Lire le dossier

```
GET /api/audit/dossier/{entrepriseId}
```

Renvoie, en un aller-retour : l'entreprise, sa fiche Google et la médiane d'avis
de sa commune, ses qualifications RGE encore valides, les axes notés avec leurs
preuves (valeur **et** seuil), les constats émis, les constats Google, et les
offres proposables avec ce que chacune répare.

Le champ `univers` est la partie qui compte : c'est la référence exacte que la
validation utilisera. Ce qui n'y figure pas ne franchira pas l'écriture.

### 3. Rédiger, en puisant dans le dossier PageSpeed

```
GET /api/audit/dossier/{entrepriseId}?psi=complet
```

Ajoute `psi`, qui contient pour chaque constat le **conseil de Google** — la
seule partie de Lighthouse qui explique au lieu de constater — et les
**ressources visées une par une** : cette image de 1,2 Mo, ce script qui bloque
l'affichage pendant 3,6 s.

C'est la matière première. Elle n'est jamais montrée telle quelle au prospect :
c'est le dossier d'instruction, pas l'audit.

### 4. Soumettre

```
POST /api/audit/preparation
{ "opportunite_id": "...", "entreprise_id": 123, "preparation": { ... } }
```

Trois cartes au plus, chacune fondée sur au moins une entrée du dossier.

---

## Ce que l'agent peut relever lui-même

L'analyseur ne mesure pas tout. Il sait qu'un formulaire existe, pas qu'il
demande neuf champs ; qu'un numéro est cliquable, pas combien de gestes il faut
pour l'atteindre. Or ce sont exactement les chiffres qui parlent à un artisan :
« 9 champs à remplir » se vérifie sur son téléphone en dix secondes,
« conversion faible » ne se vérifie pas du tout.

L'agent ouvre déjà le site pour qualifier l'entreprise. Il peut donc relever ces
faits — **dans un cadre fermé, et seulement lui**. La règle tient en une phrase :

> Il remplit des cases qu'on a définies, il n'en crée pas.

Le champ `observationsPossibles` du dossier liste les cases disponibles, avec
leur unité, leur seuil et la phrase qui dit comment le prospect le vérifie
lui-même. On les soumet dans la préparation :

```json
{
  "cartes": [
    {
      "cle": "form_not_accessible",
      "fonde_sur": ["obs:champs_formulaire"],
      "titre": "Votre formulaire demande 9 champs",
      "texte": "…"
    }
  ],
  "observations": [
    { "cle": "champs_formulaire", "valeur": 9 },
    { "cle": "avis_affiches", "valeur": false }
  ]
}
```

**Ce qui est refusé, et pourquoi ça ne se négocie pas :** une clé absente du
catalogue, une valeur qui ne correspond pas à l'unité déclarée, une valeur hors
des bornes de plausibilité, un doublon. Un agent à qui l'on dit simplement
« note ce que tu observes » invente des catégories, change d'unité d'un prospect
à l'autre, et finit par écrire un pourcentage que personne ne pourra défendre en
rendez-vous.

**Les unités autorisées** sont celles de la règle éditoriale : les secondes, le
oui/non, les comptages de choses visibles, les dates, la position dans la page.
Pas de pourcentage — sur un seul site, il n'a pas de dénominateur vérifiable.
Pas de Ko ni de Mo.

**Une observation acceptée devient citable** sous la forme `obs:<cle>`, comme un
constat Google, et ses nombres deviennent écrivables. Seules celles **en échec**
peuvent fonder une carte : « vos avis sont bien affichés » est une bonne
nouvelle qu'on peut écrire, pas un constat sur lequel bâtir un argument.

**Les observations survivent au rejet des cartes.** Un relevé juste est une
mesure acquise, payée par une visite du site ; on la garde même si la phrase
qu'on en avait tirée ne passe pas. Elles sont rangées avec la mesure
(`entreprises_audit_site.detail`) et non avec la rédaction : un chiffre posé
dans le document deviendrait retouchable dans l'éditeur, et un relevé qu'on peut
corriger à la main n'est plus un relevé.

**Aucune case ne permet d'écrire une position dans les résultats Google.** Un
rang relevé une fois, non daté et non reproductible, est la ligne la plus
contestable qu'on puisse mettre devant un prospect : il tapera la requête
lui-même, verra un autre chiffre, et c'est tout le rapport qui perd sa valeur.

---

## Ce que la validation refuse, et pourquoi

Quatre règles, appliquées à l'écriture — pas dans un prompt, parce qu'un prompt
se contourne et ne laisse aucune trace quand il échoue :

1. **Un constat doit citer un fondement réel** dans `fonde_sur` : une clé de
   preuve en échec, ou un constat Google sous la forme
   `google:render-blocking-insight`.
2. **Un code d'offre inconnu ou non proposable est rejeté.**
3. **Tout nombre écrit doit figurer dans le dossier.** C'est la règle qui
   empêche « vous perdez 40 % de vos visiteurs » quand rien ne mesure ce
   pourcentage. Les chiffres de Google sont dans le dossier : ils sont donc
   citables, et ce sont les meilleurs — le prospect peut les revérifier en
   trente secondes sur `pagespeed.web.dev`.
4. **Un rejet ne bloque jamais.** La réponse nomme chaque carte écartée et la
   raison ; l'audit garde le texte du catalogue pour celles-là. Moins ajusté,
   toujours vrai, toujours envoyable.

Les rejets sont nommés **même en cas de succès partiel**. Une carte
silencieusement écartée se remarque trois semaines plus tard, devant un prospect.

---

## Deux mises en garde de mesure

**Lighthouse varie d'un tir à l'autre.** Sur le même site à quelques minutes
d'intervalle : 3 910 ms puis 3 650 ms de gain, CLS 0,111 puis 0,238. L'ordre de
grandeur est stable, le chiffre exact ne l'est pas. On affiche donc la mesure
**datée**, et on ne la présente jamais comme une constante du site.

**Ne reprocher à personne ce qu'il fait bien.** Le champ `reussis` liste les
audits que le site passe. Un rapport qui ne relève que des fautes se lit comme un
argumentaire ; un rapport qui commence par ce qui va se lit comme un diagnostic.
