# Les tâches en tableau — ce que la couche 4 change, et ce qu'elle refuse

> Écrit le 20 août 2026, après avoir mesuré la file entière et fait tourner le
> module de filtrage sur ses 933 lignes réelles. Tous les chiffres sont relevés.

---

## 1. Le grief, et sa mesure

Matteo, mot pour mot : *« page Démarchage trop chargée, trop rigide ; la barre
de gauche filtre mal »*, et *« les chiffres du haut comptent deux fois le même
prospect »*.

Ce n'est pas une impression. La file, au 20/08/2026 :

| Mesure | Valeur |
| --- | --- |
| Tâches, tous statuts | **933** |
| En attente | **659** — dont **640 appels** |
| **Échues** | **927 sur 933** |
| Dues cette semaine · plus tard | **1 · 5** |
| Hors de toute campagne | **698** |
| Premiers contacts (jamais touchées) | **626** |
| Dont le prospect a déjà répondu | **144** |
| Cohorte B · A · sans cohorte | 281 · 278 · 374 |
| Agents | Matteo 580 · Bilal 281 · compte admin 72 |

**927 tâches échues sur 933.** Un rail vertical qui présente des cartes une à
une ne se lit pas à cette taille — et un filtre « échue » qui retient 99,4 % des
lignes n'est pas un filtre. C'est ce que le tableau vient remplacer.

---

## 2. La sémantique des pastilles, écrite une seule fois

Elle vit dans `src/lib/prospection/vue-taches.ts` et nulle part ailleurs :

- **DANS une pastille, les valeurs s'additionnent — toujours un OU.**
  « Canal : Appel, WhatsApp » veut dire appel *ou* whatsapp. Personne n'a jamais
  voulu dire « une tâche qui est à la fois un appel et un WhatsApp » : c'est
  l'ensemble vide, et un filtre qui rend zéro ligne passe pour cassé.
- **ENTRE les pastilles, c'est le MODE qui tranche** — ET par défaut, OU sur
  demande, un seul interrupteur pour toute la barre.

**Un interrupteur, pas un arbre.** lemlist s'arrête là et c'est le bon arrêt :
dès qu'on offre des parenthèses, l'écran devient un éditeur de requêtes, et un
éditeur de requêtes ne se lit pas d'un coup d'œil le matin.

---

## 3. La partition, prouvée

Le grief n° 2 dit que les compteurs du haut comptaient deux fois le même
prospect. La parade n'est pas un commentaire, c'est une invariante vérifiée sur
les vraies lignes :

```
« Canal : Appel »        716
« Canal : ni Appel »     217
                       ─────
                         933   = la file entière
```

Aucune ligne comptée deux fois, aucune perdue. Le test qui la porte est dans la
suite (`vue-taches.test.ts`), et la sonde sur les 933 lignes réelles l'a
confirmée avant qu'on écrive un seul pixel.

Les compteurs d'onglets sont des **vues**, pas des signaux additionnés : un
onglet annonce le nombre de LIGNES que sa question rend. Deux onglets peuvent
donc montrer la même tâche — mais aucun ne la compte deux fois.

---

## 4. Ce que la couche livre

| Pièce | Où |
| --- | --- |
| Le moteur pur — filtrer, trier, compter, résumer | `src/lib/prospection/vue-taches.ts` (24 tests) |
| La table des vues | `sql/20260819_vues_taches.sql` — **appliquée le 20/08** |
| La lecture de la file + les gestes de masse | `src/app/api/prospection/taches/route.ts` |
| Les vues (CRUD) | `src/app/api/prospection/vues/route.ts` |
| L'écran | `src/components/prospection/TachesTableau.tsx` |
| Le skin | `lem-skin.css` — onglets, pastilles, panneau, barre de masse |

**La table des vues est une copie conforme de `segments_entreprises`**, et c'est
voulu : même forme, même invariante — **on stocke les critères, jamais les
résultats**. Une vue est une QUESTION. La tâche qui devient échue ce matin y
entre toute seule ; celle qu'on vient de boucler en sort.

**Quatre vues de départ** sont posées en base, choisies sur ce que la file
contient réellement et pas sur un catalogue théorique : *Appels à passer* (640),
*Premiers contacts* (626), *Ont répondu* (144), *Hors campagne* (698). « On ne
part jamais d'une page blanche » vaut aussi pour un écran de filtres : personne
n'écrit sa première vue devant un tableau vide.

---

## 5. Ce que l'écran REFUSE de faire, et pourquoi

**« Terminer » n'est pas un geste de masse.** La maquette du plan le montrait
dans la barre du bas ; il n'y est pas, et c'est délibéré.

`PATCH /api/agent/tasks` fait deux choses en bouclant une tâche : il pose
`entreprises.premiere_touche_le` (une seule fois, jamais déplacée) et il fait
avancer l'inscription. Or les deux cohortes ne se comparent pas à une DATE, elles
se comparent à l'**ÂGE** depuis cette première touche. Cocher cinquante appels
« faits » depuis un écran d'administration daterait donc cinquante premiers
contacts qui n'ont pas eu lieu — et fausserait la seule mesure que la campagne
d'août existe pour produire.

Les quatre gestes retenus ne touchent que `prospection_tasks` :

| Geste | Ce qu'il écrit | Pourquoi il est sûr |
| --- | --- | --- |
| **Reporter** | `status='snoozed'` + `due_at` | Déplacer `due_at` seul laisserait la tâche « en attente » et échue le lendemain — et `isSetAside` ne la reconnaîtrait pas : c'est la lecture du STATUT qui distingue une mise de côté d'une échéance future. |
| **Changer d'agent** | `assignee_id` | `agentId` absent et `agentId: null` ne veulent pas dire la même chose : le premier est un oubli, le second un détachement voulu. |
| **Ignorer** | `status='skipped'` | `skipped` ne fait avancer aucune inscription : le geste n'a pas eu lieu. |
| **Remettre en file** | `status='pending'` + `due_at=maintenant` | Ne ressuscite jamais une tâche **faite** : `done_at` est posé et la séquence a déjà avancé derrière. |

Et le décompte est honnête : cocher 40 lignes dont 3 sont faites rend
« 37 modifiées — 3 déjà faites, laissées telles quelles », jamais 40.

---

## 6. Deux fautes corrigées en cours de route

1. **« Aucune tâche ne répond à ce filtre » quand la lecture échoue.**
   Découvert en ouvrant l'écran sans session : l'API rendait `unauthorized` et le
   tableau accusait le filtre. C'est la faute que le CRM s'interdit partout
   ailleurs — un zéro et une absence de mesure ne sont pas la même chose. L'écran
   dit maintenant *« La file n'a pas pu être lue »*, et propose de réessayer.

2. **« Non attribuée » pour une tâche attribuée à un profil sans nom.**
   72 tâches appartiennent au compte admin, dont `full_name` est nul. Le libellé
   se déduit maintenant de `agentId`, pas du nom : « non attribuée » et « agent
   inconnu » sont deux états différents.

Une troisième, attrapée par le typage plutôt que par l'écran :
`entreprises.nom` **n'existe pas** — la colonne s'appelle `name`. Le dépôt n'est
pas la vérité sur Supabase ; la sonde l'a dit avant le premier chargement.

---

## 7. Ce qui reste de la couche 4

L'**inbox** (le fil par lead, tous canaux) n'est pas dans cette livraison : elle
appartient à la couche 5, et l'arbitrage écrit là-bas tient toujours — une inbox
e-mail résout aujourd'hui 4 échanges sur 199, et **aucun mécanisme ne pourra
jamais capter une réponse WhatsApp** sans l'API Business. C'est la partie 5a — la
conversation par lead, sans rien recevoir — qui vaut d'être livrée en premier, et
c'est elle qui répond au grief *« je ne vois pas les notes de Bilal »*.
