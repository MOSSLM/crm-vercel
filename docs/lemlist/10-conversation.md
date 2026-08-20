# La conversation — le fil par lead, et ce qu'on a trouvé en le cherchant

> Écrit le 20 août 2026. Tous les chiffres sont relevés en base ; l'écriture est
> éprouvée dans une transaction annulée.

---

## 1. Le grief cachait pire que lui-même

Matteo : *« je ne vois pas les notes de Bilal »*. On a cherché l'écran manquant.
Ce n'était pas l'écran.

**`email_logs` n'a jamais eu de colonne d'auteur.** Les 29 notes existantes ne
portent le nom de personne — pas parce qu'on les affiche mal, parce que
l'information n'a jamais été écrite. Aucun écran, quel qu'il soit, n'aurait pu
les attribuer.

La colonne est posée (`sql/20260820_conversation.sql`, appliquée le 20/08), et
les cinq endroits qui écrivent dans le fil la remplissent désormais :

| Où | Ce qui s'y écrit |
| --- | --- |
| `PATCH /api/agent/tasks` | la note d'issue d'une tâche bouclée |
| `POST /api/agent/demarchage/hors-canal` | la trace d'une sortie de séquence |
| `POST /api/telephony/cockpit/outcome` | l'issue d'un appel |
| `recordOutcome` (`sales-pipeline/actions.ts`) | l'issue déclarée depuis le pipeline |
| `POST /api/messages/log` | qui a ouvert ce WhatsApp |

Le cron (`process-scheduled-actions`) reste sans auteur, et c'est juste : c'est
le CRM qui écrit.

### On ne rattrape pas les 29, et c'est délibéré

On pourrait deviner. 10 des 29 ont une tâche bouclée sur la même étape et la
même entreprise, avec un seul agent possible ; et les 29 sont sur des fiches qui
n'ont que deux propriétaires. Mais **deviner un auteur et l'écrire dans une
colonne, c'est fabriquer une donnée qui aura l'air relevée.**

L'écran dit donc `auteur non enregistré` pour les 29, et `le CRM` pour ce que le
moteur écrit — deux états différents, et ni l'un ni l'autre n'est « personne ».
29 notes, c'est deux jours de travail ; la valeur est dans les 200 qui viennent.

---

## 2. L'état de départ, dit franchement

| Mesure | Valeur |
| --- | --- |
| Lignes dans un fil | **206** (4 écartées : les `scheduling` de juillet, sans entreprise) |
| Fils | **133** |
| Sortants · internes · **entrants** | 177 · 29 · **0** |
| Lignes portant un contact nominatif | 162 |
| Lignes portant un auteur | **0** |

**Rien n'est jamais entré dans ce CRM.** Ce n'est pas un défaut de cet écran :
c'est ce qu'il rend enfin visible, et l'écran le dit en toutes lettres au lieu
de laisser découvrir une boîte vide.

Une inbox e-mail résoudrait 4 échanges sur 210. Les 177 WhatsApp partent par des
`wa.me` ouverts à la main, et **aucun mécanisme ne captera jamais une réponse
WhatsApp** sans l'API Business. Livrer une boîte vide en l'appelant « inbox
unifiée » serait pire que ne rien livrer.

**Donc : le fil d'abord, la réception après.** Le seul transport entrant qui
existe aujourd'hui, c'est l'agent qui recopie ce qu'on lui a dit — un geste
qu'il fait déjà, dans un carnet ou dans un message à Matteo. Ici il est daté,
attribué, et dans le fil.

---

## 3. Trois sens, et ils ne se devinent pas

`direction` est en base, avec une contrainte fermée :

- **`sortant`** — nous avons écrit. C'est le défaut, et il qualifie les 181
  lignes existantes sans en toucher une seule.
- **`entrant`** — le prospect a parlé, recopié à la main.
- **`interne`** — une note d'équipe. Ni envoyée ni reçue : c'est ce que les 29
  notes sont réellement, et les y ranger n'invente rien.

**Une note interne n'éteint jamais « à répondre ».** Écrire « rappeler en
septembre » dans le fil ne répond à personne — et c'est même le fil qu'on risque
le plus d'oublier, puisqu'il a l'air d'avoir bougé. La règle a son test.

---

## 4. Ce que la couche livre

| Pièce | Où |
| --- | --- |
| Le moteur pur — assembler, filtrer, compter, décider de « à répondre » | `src/lib/prospection/conversation.ts` (16 tests) |
| Les colonnes `auteur_id` et `direction` | `sql/20260820_conversation.sql` — **appliquée** |
| La lecture des fils + le geste « consigner » | `src/app/api/prospection/conversations/route.ts` |
| L'écran trois volets | `src/components/prospection/Conversations.tsx` (7 tests) |

**Regroupé par entreprise, pas par contact.** 830 de nos 905 fiches n'ont aucun
contact nominatif : grouper par contact rendrait 830 fils vides et perdrait tout
le reste. Le contact, quand il existe, s'affiche dans le fil de son entreprise.

**Les compteurs de filtres sont des vues.** « À répondre » est un sous-ensemble
d'« Ont parlé » : les additionner compterait deux fois le même prospect — le
grief n° 2, encore. Ce qui reste vrai, et qui a son test : *ont parlé + n'ont
jamais parlé = tous*.

---

## 5. La ligne rouge, redite à l'endroit du geste

⚠️ **`sales_pipeline_state.replied` n'est jamais posé par cet écran.** Le
raisonnement est en tête de `reply.ts` : `hasInterest()` s'en sert pour éteindre
les cellules WhatsApp et Appel, ce qui couperait les étapes que la séquence veut
enchaîner. Une réponse débloque une attente ; elle ne dit pas que le prospect est
intéressé.

C'est écrit **sous le bouton**, pas seulement dans le code : *« consigner une
réponse ne déclare pas le prospect intéressé »*. Cette distinction a déjà été
payée une fois.

---

## 6. Deux fautes corrigées en ouvrant l'écran

1. **Le volet gauche accusait le filtre pendant que le centre disait la panne.**
   Deux volets, deux vérités, sur le même échec de lecture. La gauche dit
   maintenant « liste indisponible ».
2. **`contacts` porte `first_name`/`last_name`, pas `prenom`/`nom`** — comme
   `entreprises` porte `name` et pas `nom`. Le dépôt n'est pas la vérité sur
   Supabase ; les deux ont été trouvées par sonde avant le premier chargement.

---

## 7. Ce qui reste : 5b, recevoir vraiment

Par ordre de préférence, et rien n'est commencé :

1. **Cloudflare Email Routing → webhook** — gratuit, sans état, et **exactement
   la forme du webhook Resend déjà écrit** (HMAC vérifié, idempotence par clé
   primaire).
2. **Resend Inbound**, s'il est sur le plan.
3. **IMAP en cron**, en repli — le connecteur existe déjà, écrit pour le
   réchauffeur (`src/lib/rechauffeur/connecteur-imap.ts`).

La saisie manuelle reste de toute façon : elle seule couvre WhatsApp et le
téléphone. Et le vrai gain de 5b est ailleurs — un entrant apparié appelle
`declarerReponse` (`reply.ts`), qui gère **déjà** le rattrapage depuis la branche
silence, c'est-à-dire le cas le plus fréquent : le prospect qui répond *après* la
relance.
