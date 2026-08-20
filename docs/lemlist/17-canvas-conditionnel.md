# Couche 9 — Le canvas conditionnel, et les trois séquences qui le prouvent

*20 août 2026.*

Quatre choses le même jour, et une seule idée : **une séquence doit pouvoir
réagir, et se lire**. Les six séquences précédentes étaient des files. Elles
n'avaient ni fourche à plus de deux voies, ni fin écrite, ni moyen de se
rejoindre — et le « flou après le premier contact » venait de là, pas du
pipeline.

---

## 1. Ce que la production disait, avant de toucher à quoi que ce soit

| Mesure | Valeur |
| --- | ---: |
| Séquences | 6, dont **1** active |
| Inscriptions vivantes | 132 |
| Garées en attente de réponse | **93** — 59 à la 1ʳᵉ attente, 34 à la 2ᵈᵉ |
| Tâches encore ouvertes | 33 |

> **Correction de mesure.** L'analyse qui a lancé ce chantier annonçait « 59 en
> étape 1, 69 en étape 3, 50 en étape 4 ». Les 59 sont exacts. Les deux autres
> sont **34** et **18**. La différence n'est pas anodine : elle change ce qu'on
> déplace et où.

### Et un défaut qu'on ne cherchait pas

`current_step`, `vars.replies` et `vars.conditions` étaient rangés **par rang**
dans le tableau d'étapes. Insérer une carte au milieu d'une séquence en cours
décale donc tout ce qui suit.

C'est arrivé. L'ajout de `s2b` dans « WhatsApp seul » a :

- fait pointer **34 inscriptions** garées sur la deuxième attente vers une carte
  WhatsApp d'une voie qu'elles n'avaient jamais prise ;
- rendu muettes **9 réponses** notées au rang 3 — neuf prospects qui avaient
  répondu et que la séquence s'apprêtait à traiter comme des silencieux.

Rien à l'écran ne le disait. **La clé est désormais l'identifiant de l'étape**
(`cleDeFourche`), et la lecture accepte encore le rang pour les sacs écrits
avant ce jour-là (`lireLeSac`) — les retirer aurait effacé ce que 92
inscriptions savent d'elles-mêmes.

---

## 2. L'aiguillage : plus de deux voies

Une fourche à deux voies oblige à empiler les questions — « a-t-il un mobile ? »
puis, dans la voie non, « a-t-il une adresse ? » puis, dans la voie non de
celle-là… Trois fourches imbriquées pour un seul aiguillage.

`condition.cas` est une **cascade** : une liste de cas, le premier vrai gagne,
et une voie `sinon` ramasse le reste.

```
Aiguillage ── c1 : a un mobile   → WhatsApp
           ├─ c2 : une adresse   → e-mail
           ├─ c3 : une ligne fixe → appel
           └─ sinon              → (personne : il n'est pas joignable)
```

> ⚠️ **« On ne sait pas » ne retient pas le prospect, il le laisse passer.**
> Sur une question à deux voies, `siInconnu` dit où envoyer celui dont la donnée
> manque. Dans une cascade, ça n'a pas de sens : un cas qu'on ne sait pas
> trancher ne peut pas prétendre attraper quelqu'un. D'où la seule règle à
> retenir en écrivant « sinon » : **elle s'adresse aussi à ceux dont on ne
> savait rien**. Les cas non mesurés sont notés à part (`vars.nonMesures`), pour
> qu'on puisse un jour séparer les deux populations.

**Rien n'a migré.** `branch.on` est passé d'une énumération à une clé libre :
`'reply'` et `'timeout'` restent les noms des deux premières sorties. Les six
séquences existantes et les 92 `vars.replies` sont valides à l'octet près.

---

## 3. La suite d'une étape : finir, ou renvoyer

`suite` répond à « et après ? », et c'est la moitié qui manquait.

| Valeur | Ce que ça fait |
| --- | --- |
| absent | on descend au suivant atteignable — le comportement de toujours |
| `fin` | la voie s'arrête ici, avec un motif écrit sur la carte et gardé sur l'inscription (`vars.fin`) |
| `aller_a` | on saute à une autre carte : en avant pour couper court, en arrière pour reboucler |

**La jonction n'est pas un type de carte, c'est un renvoi partagé.** Trois voies
qui pointent vers la même étape *sont* un point de rendez-vous, et le plan le
montre en trois traits qui convergent. Une carte « rejoindre » aurait fallu la
placer, la déplacer, la supprimer — pour ne rien dire de plus.

**Deux refus, et ils sont de fond :**

- **On ne vise pas une voie sœur.** Le renvoi ferait exécuter la carte, puis la
  descente sauterait tout le reste de cette voie — l'atteignabilité dit toujours
  que la fourche a rendu l'autre sortie. Le prospect recevrait la première carte
  d'un chemin et rien de la suite, sans que rien ne le dise.
- **Une cible supprimée ARRÊTE la séquence**, elle ne reprend pas la descente.
  Faire partir un message par défaut est le mauvais côté de l'erreur.

Et un filet : un rebouclage sans issue enverrait un message par tick à un vrai
artisan. Le moteur compte les passages et s'arrête à **12 tours**, en écrivant
pourquoi. L'éditeur, lui, avertit avant — sauf quand la boucle a une fourche ou
une fin pour en sortir, auquel cas il se tait.

---

## 4. Le canvas, sur autant de niveaux qu'il en faut

La mise en page est devenue récursive. Une voie qui porte une fourche s'élargit
d'autant ; le tronc reste au milieu de ce qu'il porte ; l'écart entre deux voies
voisines est constant, quel que soit leur nombre.

Ce qui se voit désormais sans rien cliquer :

- **les voies vides**, avec ce qu'il faudrait y écrire ;
- **les voies orphelines** — un cas supprimé laisse derrière lui des étapes qui
  pointent dans le vide, dessinées en rouge plutôt que masquées ;
- **les fins de voie** et **les renvois**, en pastille sur la carte : deux cartes
  voisines peuvent se suivre à l'écran sans que l'une mène à l'autre ;
- **les incohérences de renvoi**, posées sur le plan et non dans l'inspecteur —
  une incohérence concerne deux cartes, la ranger dans le panneau de l'une des
  deux obligerait à l'avoir sélectionnée pour la découvrir.

Ce qui ne bouge pas : **aucune coordonnée n'est stockée**. La position se déduit
du tableau. Un x/y en base autoriserait à dessiner une carte au-dessus de sa
fourche pendant que le moteur l'exécute après — le dessin mentirait.

---

## 5. Le passage de relais entre séquences

Une carte `transition` ferme l'inscription courante (motif `transfert`, qui ne
renvoie **pas** le prospect au stock) et en ouvre une dans la séquence visée.

Pourquoi plusieurs séquences plutôt qu'une énorme : « premier contact », « démo »,
« nurture » posent chacune une question et se relisent seules. La même chose
écrite d'un bloc tiendrait sur cinq écrans et personne n'oserait la retoucher.

Quatre refus, et **aucun ne gèle** — un gel sans réveil est ce qui a laissé 59
inscriptions dormir des semaines : destination absente, destination qui est la
séquence elle-même, séquence déjà traversée (`vars.transitions`), chaîne de plus
de quatre. Dans les quatre cas on termine, en écrivant pourquoi.

Une destination **en pause est acceptée** : elle gèle ce qu'elle reçoit avec un
motif visible plutôt que de le perdre. C'est ce qui permet de poser le relais
avant d'avoir lancé la séquence d'en face.

---

## 6. Deux conditions qui ne mesuraient rien

### « Issue du dernier appel » répondait « non » à tout le monde

Le vocabulaire proposé était `answered / no_answer / callback / refused` —
quatre valeurs inventées. La lecture, elle, rendait `prospection_tasks.status` :
`pending`, `done`, `skipped`, `snoozed`. **Aucune des deux listes ne rencontrait
l'autre.** La condition était donc toujours fausse, et rien ne le disait.

Corrigé : la lecture va chercher la **note d'issue** dans `email_logs.outcome`,
avec le vocabulaire de `STEP_OUTCOMES` — le seul qui existe en base (18 lignes,
dont 9 « a répondu »). C'est aussi ce qui rend possible « chaque résultat d'appel
mène à une branche différente » : un aiguillage sur ce champ, et les voies
s'écrivent.

### Ce qu'on peut mesurer de l'engagement, et ce qu'on ne peut pas

**Pas « a ouvert l'e-mail ».** Resend ne suit pas les ouvertures par envoi :
c'est un réglage de domaine, et on ne l'active pas — pixel d'ouverture et
réécriture de liens abîment la réputation qu'on est en train de construire.

Ce qui se compte vraiment, côté serveur, sans rien poser chez le destinataire :
les **vues des liens à jeton**. Deux nouveaux champs, `rapport_vu` et
`plaquette_vue`. Densité au 20/08 : 162 rapports publiés, **1 ouvert** ;
2 plaquettes générées, **2 ouvertes**. C'est peu, et pour une raison qui n'est
pas un défaut de mesure — on n'a presque rien envoyé. Ces deux champs valent le
jour où la séquence tourne, pas avant.

Et une distinction gardée : **pas de ligne de rapport = `non mesuré`**, zéro vue
sur un rapport **qui existe** = une mesure. Aplatir les deux ferait passer pour
« pas intéressé » un prospect à qui on n'a jamais rien envoyé.

---

## 7. Les trois séquences

### S1 — Premier contact : une ÉCHELLE, pas un aiguillage

La première version aiguillait à l'entrée sur un canal. Matteo l'a relue :
*« c'est pas vraiment une séquence multicanal »*. Il avait raison, et le défaut
est de fond — **aiguiller à l'entrée enferme**. Un prospect qui a un mobile *et*
une adresse partait sur WhatsApp, et s'il ne répondait jamais, plus rien.

La règle qu'il faut est une échelle : **tant qu'on a WhatsApp on WhatsApp ;
sinon l'e-mail ; puis l'appel.** On descend d'un barreau quand le précédent n'a
rien donné.

Le tronc de S1 **est** cette échelle. Chaque barreau est une question
« a-t-il ce canal ? » dont la voie « oui » contient le cycle complet :

```
« a un mobile ? »  ── oui → accroche · attente 3 j ── il répond → démo → ⇢ S2
                   │                                └ silence  → relance+démo · attente 4 j ── il répond → ⇢ S2
                   └ non → (rien)
                       ↓ les deux chemins se rejoignent
« a une adresse ? » ─ oui → e-mail démo · attente 4 j ── il répond → ⇢ S2
                   │                                  └ silence  → relance · attente 3 j ── il répond → ⇢ S2
                   └ non → (rien)
                       ↓
                    appel · « il a répondu ? » ── oui → ⇢ S2
                                               └ non → appel 2 (J+7) · « il a répondu ? » ── oui → ⇢ S2
                                                                                           └ non → ⇢ S3
```

Qui n'a pas le canal traverse une voie **vide** et tombe au barreau suivant ;
qui réagit **sort** par un passage de relais et ne descend jamais. Le site démo
part dans S1, sur le canal qui sert — c'est le premier contact qui le porte,
pas une séquence d'après.

> **Les délais ne sont pas dans les `day`, ils sont dans les attentes.**
> Tous les `day` de S1 valent 0, et ce n'est pas un oubli. `stepStartMs` compte
> depuis le `day` de l'étape d'ancrage, et l'ancre se repose à chaque geste
> humain et à chaque attente qui se libère — mais **pas** sur un barreau sauté.
> Des `day` croissants auraient donc fait attendre sept jours à un prospect sans
> mobile avant son premier e-mail. À 0, chaque étape part dès que la précédente
> rend la main, et le rythme vient des `replyTimeoutDays` — l'endroit honnête
> pour l'écrire.

Ce que ça donne, mesuré par `cheminSuppose` **avant** d'écrire en base :

| Profil | Ce qu'il reçoit |
| --- | --- |
| mobile, jamais de réponse | J0 accroche · J3 relance + démo · J7 e-mail démo · J11 relance · J14 appel · J21 appel 2 · ⇢ S3 |
| mobile, il répond | accroche · démo WhatsApp · ⇢ S2 |
| e-mail seul | J0 e-mail démo · J4 relance · J7 appel · J14 appel 2 · ⇢ S3 |
| fixe seul, il décroche | J0 appel · ⇢ S2 |

**Et cet aperçu a attrapé un défaut du moteur du chemin**, pas de la séquence :
il continuait tranquillement *après* une carte « passer à une autre séquence »,
alors que le moteur, lui, en sort. Sur « mobile, il répond », il affichait trois
étapes que le prospect ne recevra jamais. `estSortie` corrige la lecture — un
passage de relais est un cul-de-sac, et le canvas ne trace plus de trait
derrière lui.

### S2 — Après la démo : la plaquette, puis l'appel

S2 n'envoie **pas** la démo : S1 s'en est déjà chargé. Ce qu'il reste à faire,
c'est rassurer sur le prix, puis rappeler.

```
« a un mobile ? » → plaquette WhatsApp / plaquette e-mail      (J+2)
      ↓
attente 3 j ── il réagit → appel « il a ouvert la plaquette » ──┐
      ↓ silence                                                 │ renvoi
« a ouvert la plaquette ? » ── oui → appel chaud (J+2) ─────────┤
                            └ non → appel standard (J+4) ───────┤
                                                                ↓
                                         « il a répondu à l'appel ? »
                                            oui → fin, le commercial reprend
                                            non → ⇢ S3
```

**Trois voies d'appel, une seule décision** — c'est la jonction. La première y
arrive par un **renvoi** (`suite.aller_a`), les deux autres par la reprise du
tronc. Sans le renvoi, la voie « il réagit » serait retombée dans la question
« a-t-il ouvert la plaquette ? » et il aurait été rappelé deux fois.

**Pas d'audit.** Matteo : *« pour le moment l'audit ne me plaît pas, je préfère
envoyer la plaquette »*. La condition « a ouvert son rapport d'audit » reste
disponible dans l'éditeur — elle est mesurable — mais aucune séquence ne s'en
sert.

**La plaquette dès S1 ?** Il posait la question. Non : elle répond à
« combien ça coûte », et envoyée au premier contact elle répond à une question
que personne n'a posée, tout en alourdissant un message qui porte déjà un lien
de démo. Mais comme on entre dans S2 dès la première réaction, elle arrive en
pratique **deux jours après la démo** — ce qui est le geste qu'il décrivait.

### S3 — Reprise à distance, et le sort du « rappelez-moi le 12 »

> ⚠️ **Un prospect qui donne une date n'entre nulle part.** L'agent note l'issue
> « Mettre de côté » avec sa date, la tâche est **replanifiée** à cette date, et
> `PATCH /api/agent/tasks` n'avance pas l'inscription sur un `snoozed`
> (`status !== "snoozed"`). La séquence reste donc exactement où elle en était,
> et **elle repart le jour dit, à l'étape où elle s'était arrêtée**. C'est déjà
> le mécanisme du CRM ; lui imposer un J+21 écrirait par-dessus la seule date
> qui compte, la sienne.

Ce qui rend la question de Matteo — *« je la trouve trop éloignée »* — juste :
elle l'était pour ce cas-là, et pour ce cas-là il ne fallait pas de séquence du
tout.

S3 sert à l'autre cas, celui qu'on n'a **jamais** réussi à joindre : tous canaux
épuisés, pas un mot. Trente jours de silence, une relance sur son canal, un
appel, puis **une fin écrite** — jamais une attente sans limite.

### Où sont passés les 132

On **repointe**, on ne recrée pas : l'historique, les tâches faites, la liste de
campagne et le lien avec les 640 appels restent accrochés.

Et on classe **sur ce qui est réellement parti**, pas sur le rang qu'affichait la
carte. Pendant l'opération, un agent envoyait les accroches WhatsApp — quinze
tâches faites en quinze minutes. Se fier au `current_step` aurait replacé ces
quinze-là au début, et ils auraient reçu l'accroche une seconde fois.

| Ce qui est arrivé au prospect | Où il est posé | Effectif |
| --- | --- | ---: |
| L'accroche est encore dans la file de l'agent | S1 · `wa1` | 1 |
| La démo WhatsApp est dans la file | S1 · `waDemo` | 2 |
| L'accroche est partie, pas de réponse | S1 · `waW` | 75 |
| Il a réagi | S2 · `plqQ` (la plaquette) | 40 |
| Il a réagi, un appel est déjà dans la file | S2 · `apStd` | 13 |

Chaque inscription est sur une carte dont l'identifiant est celui de sa tâche
ouverte ; aucune voie n'est orpheline. Le 132ᵉ est sorti pendant l'opération —
un agent l'a marqué « pas de compte WhatsApp ».

> ⚠️ **Les trois séquences sont en `draft`.** Rien ne partira tant que personne
> ne les aura activées.

## 8. Suspendre un canal, sans arrêter la séquence

Le lendemain de la livraison, une question de terrain : *les boîtes d'envoi ne
sont pas encore chaudes — comment lancer S1 en étant sûr qu'aucun e-mail ne
parte, même pour une entreprise qui a mobile ET adresse ?*

**La vérification a corrigé une idée fausse que j'avais.** Je croyais que le
barreau WhatsApp se terminait toujours par une sortie vers S2 — donc qu'un
prospect joignable par les deux canaux n'atteignait jamais l'e-mail. C'est faux :
`waW2` n'a qu'une voie « il a répondu ». En cas de silence complet, le prospect
**retombe sur le tronc** et arrive à `mlQ`, la question sur l'adresse. Après
3 + 4 jours, il reçoit bien un e-mail. `cheminSuppose` sur la définition réelle
le dit en une ligne ; la déduction disait le contraire.

### Pourquoi ni `paused` ni la phase de test

Les deux existaient déjà, et les deux **gèlent le prospect là où il est**. Ce
n'est pas ce qu'on veut : un artisan sans mobile doit être appelé, pas mis en
attente six semaines. Ce qu'il fallait, c'est que la séquence **continue** en
sautant le barreau.

### Deux effets, de natures différentes

1. **Le contournement** — `a_email` répond « non » tant que l'e-mail est
   suspendu. L'échelle descend d'un barreau toute seule ; rien à modifier dans
   les séquences, rien à remettre en place après.
2. **La ceinture** — une étape d'un genre suspendu n'envoie rien et ne pose
   aucune tâche : elle **retient** l'inscription (motif `canal_suspendu`,
   lisible dans le régulateur). Elle ne la fait pas avancer — franchir enverrait
   le prospect à la suite d'un message qu'il n'a jamais reçu.

Le premier évite l'embouteillage, le second attrape les chemins qu'aucun
aiguillage n'aura évités — la plaquette e-mail de S2, par exemple, qui est la
voie « sinon » d'une question portant sur le mobile. Et un troisième filet dans
`send-guard.ts`, parce qu'une action `send_email` de workflow n'a ni séquence ni
aiguillage.

**Seul `a_email` est masqué, et c'est délibéré.** `a_mobile` sert à la fois à
WhatsApp et à l'appel : le rendre faux parce que WhatsApp est suspendu couperait
le téléphone, qui n'a rien demandé. L'e-mail est le seul canal qui corresponde
exactement à un fait du prospect.

**Le `false` inventé, l'unique.** `conditions-db.ts` interdit en tête d'inventer
un `false` — on ne saurait pas le distinguer d'une lecture ratée. L'exception
est ici, et elle est d'une autre nature : ce n'est pas une lecture qui échoue,
c'est une impossibilité qu'on connaît.

| Profil | Canal ouvert | Canal suspendu |
| --- | --- | --- |
| Mobile, il répond | `wa1 → waW → waDemo → ⇢S2` | identique |
| Mobile + e-mail, silence | `… waW2 → mlQ →` **`ml1 → mlW → ml2 → mlW2`** `→ ap1 …` | `… waW2 → mlQ → ap1 → issQ → ap2 → ⇢S3` |
| E-mail seul | `mlQ → ml1 → … → ap1 …` | `mlQ → ap1 → issQ → ap2 → ⇢S3` |
| Fixe seul | `mlQ → ap1 …` | identique |

Exposition au 20/08 : **nulle**. Les 131 inscriptions vivantes ont toutes un
mobile. Ce sont les 75 en attente sur `waW` qui atteindraient l'e-mail dans une
semaine, en cas de silence.

## Ce qui n'a pas été fait, et pourquoi

- **Le graphe nodes + edges avec des positions stockées.** L'analyse le
  proposait ; le tableau plat le rend inutile ici. `branch.on` est une clé libre,
  `suite.aller_a` est une arête, et l'imbrication se dessine. Stocker un x/y
  redonnerait au dessin le droit de mentir sur l'ordre d'exécution, qui reste
  celui du tableau.
- **« A ouvert l'e-mail », « a cliqué ».** Voir §6 — ce n'est pas un manque
  d'écran, c'est un choix de réputation.
- **L'orchestrateur au-dessus des séquences.** La carte `transition` en fait le
  travail utile — sortir d'ici, entrer là — sans introduire un second endroit qui
  décide du sort d'un prospect. Un orchestrateur qui déciderait *en plus* des
  séquences serait un deuxième moteur, et les deux finiraient par ne plus dire la
  même chose.

## Les fichiers

| Fichier | Ce qu'il porte |
| --- | --- |
| `src/lib/automations/branches.ts` | **Le chemin** : sorties d'une fourche, atteignabilité, suite, redirections, arbre de l'éditeur |
| `src/lib/automations/conditions.ts` | Le vocabulaire testable, l'évaluation d'un cas et d'une cascade |
| `src/lib/automations/canvas.ts` | La mise en page récursive, les traits, les places d'accueil |
| `src/components/automations/SequenceCanvas.tsx` | Le plan à l'écran, le glisser, le relier en deux clics |
| `src/components/automations/SequenceBuilder.tsx` | L'inspecteur : aiguillage, « et après ? », passage de relais |
| `src/lib/automations/regulator.ts` | `canauxSuspendus`, les genres suspendables, le motif `canal_suspendu` |
| `src/lib/automations/conditions-db.ts` | Le masquage d'`a_email` — le seul `false` inventé du fichier |
| `sql/20260820_canaux_suspendus.sql` | La colonne, et pourquoi ce n'est ni une pause ni la phase de test |
| `sql/20260820_sequences_conditionnelles.sql` | Les trois séquences et le déplacement des 132 |
