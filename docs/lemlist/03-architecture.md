# lemlist — l'architecture applicative, et la nôtre en face

> Comment leur application est découpée, ce que nous avons déjà en regard, et à quoi
> ressemblera notre espace **Prospection**.
> Les chiffres « chez nous » sont mesurés en production le 19 août 2026.

---

## 1. Leurs douze sections

L'inventaire le plus fidèle n'est pas le menu du site vitrine — c'est la table des
matières du centre d'aide, croisée avec le menu de gauche de l'application.

| # | Section | Ce qu'elle contient |
| --- | --- | --- |
| 1 | **Campaigns** | Sequence · Lead list · Launch · Performance, plus six panneaux de réglages |
| 2 | **Leads** | contacts, entreprises, listes, champs personnalisés, enrichissement, score, imports |
| 3 | **Inbox** | conversations unifiées, statuts, réponse, assignation, désabonnements |
| 4 | **Tasks** | 6 types × 5 statuts, vues sauvegardées, filtres, actions de masse |
| 5 | **Reports** | 14 widgets, onglets sauvegardés, partage |
| 6 | **Signals** | veilles, agents d'intention, visiteurs du site |
| 7 | **lemAgent** | construire une campagne en décrivant l'objectif |
| 8 | **Templates** | modèles de campagne et de messages |
| 9 | **Deliverability Hub** + **lemwarm** | chauffe, DNS, rotation, plafonds, alertes |
| 10 | **lemcal** | pages de réservation, types de rendez-vous, rappels |
| 11 | **Settings** | expéditeurs, équipe, rôles, crédits, intégrations, API/MCP, journaux |
| 12 | **Extension Chrome** | travailler depuis LinkedIn, Gmail, le CRM |

---

## 2. Ce que nous avons en face

| Section lemlist | Chez nous aujourd'hui | Verdict |
| --- | --- | --- |
| **Campaigns** | `automations` (kind=`sequence`) — porte la séquence, les réglages, les plages, le public, l'accès par agent. **Aucune liste de leads.** | **À construire** — c'est le cœur |
| **Leads** | `entreprises` (60 445), `contacts` (333), `explorateur_entreprises()` à 25 familles de filtres avec facettes, `segments_entreprises` (dynamique), `lots`/`lots_entreprises` (figé) | **Existe, et plus fin que le leur sur notre marché.** Les trois derniers objets sont à **0 ligne** : construits, jamais appelés |
| **Inbox** | `email_logs` — fil multicanal (e-mail, WhatsApp, note) avec issue et étape. **Rien n'entre** : aucune table ne stocke un message reçu | **À construire** |
| **Tasks** | `prospection_tasks` (6 types → 4 chez nous, 4 statuts), `task-routing.ts`, `TaskBoard`, rail de Démarchage | **Existe** ; manquent le tableau, les vues sauvegardées, les filtres cumulables et l'enchaînement |
| **Reports** | `sequences/stats/_view.ts` (ouvertures, clics, rebonds, réponses, RDV), `construireEntonnoir`, **`lectureParAge`** | **Existe** — et notre lecture à âge égal est **meilleure** que la leur |
| **Signals** | GA4 (`intentByEnterprise`), vues de plaquette et de rapport public, `v_rge_qualifications_valides`, note d'audit, concurrents | **La matière est là, l'écran manque** |
| **lemAgent** | skills Claude (`preparer-audit`), `sequenceSuggeree` | **À construire**, socle présent |
| **Templates** | `whatsapp_templates`, `email_templates`, `call_scripts` (avec variantes entreprise/contact), 5 séquences en brouillon | **Existe**, à promouvoir en bibliothèque |
| **Deliverability** | `email_verifications`, `email_domain_cache`, `email_suppressions`, `email_events`, `bounce-guard.ts`, régulateur (plages, écart, plafond, espacement par entreprise), mode test | **Mécanique là**, ni écran, ni réchauffeur, ni plafond par boîte |
| **lemcal** | module `scheduling_*` complet (pages, types, disponibilités, réservations, rappels, exclusion de double réservation **en base**), pages publiques `/rdv` | **Existe déjà**, à rattacher |
| **Settings** | `agent_settings`, `regulator_settings`, `automation_connections` | **Existe en partie** |
| **Extension Chrome** | — | **Hors périmètre**, acté |

### Ce que nous avons et qu'eux n'ont pas

Adopter leur forme ne veut pas dire renoncer à ce qui nous distingue. Ces outils
gardent leur espace : **Site builder**, Section et Theme builder, **Form builder**,
Production et projets, **Lead magnets**, Planches, **Téléphonie complète** (SVI,
portabilité, softphone — lemlist n'a qu'un composeur), **Marketing pipeline** (la
chaîne qui fabrique le support de vente), **Audit de site**, **Carte du territoire**,
registre des **Bots**.

C'est **la prospection** qui prend la structure de lemlist, pas le CRM entier.

---

## 3. L'espace Prospection — l'arborescence cible

### Côté admin

```
/prospection                              → redirige vers Campagnes

├─ /campagnes                             LISTE — nom, statut, canaux, leads,
│                                         en file, prochain envoi, taux de réponse
│  ├─ /nouvelle                           3 départs : vierge · un modèle · décrire
│  │                                      l'objectif (lemAgent)
│  └─ /[id]                               LA CAMPAGNE — 4 onglets + panneau réglages
│       ?vue=sequence                     le constructeur vertical
│       ?vue=leads                        la liste des leads (l'écran neuf)
│       ?vue=lancement                    la revue avant de lancer
│       ?vue=rapport                      la performance de cette campagne
│
├─ /inbox                                 conversations, 3 volets
│  └─ /[id]                               un lead = un fil, tous canaux
│
├─ /taches                                tableau + vues sauvegardées
│  └─ /[vue]                              « Mes appels du jour », « Sans réponse J+7 »…
│
├─ /leads                                 contacts et entreprises
│  ├─ /segments                           requêtes nommées (dynamiques)
│  ├─ /lots                               photos figées
│  ├─ /desabonnes                         suppressions, blacklist, plaintes
│  └─ /[entrepriseId]                     LE DOSSIER — identité, canaux, présence web,
│                                         audit, démo, campagnes, fil, tâches
│
├─ /signaux                               veilles (segment + déclencheur)
├─ /rapports                              widgets déplaçables, onglets sauvegardés
├─ /modeles                               séquences · e-mails · WhatsApp · scripts d'appel
├─ /delivrabilite                         le hub
│  ├─ /boites                             expéditeurs, plafonds par boîte, rotation
│  ├─ /rechauffeur                        notre lemwarm — rampe, santé, boîtes témoins
│  └─ /verifications                      adresses vérifiées, douteuses, rebonds
└─ /reglages                              régulateur, attribution des tâches, intégrations
```

### Côté agent — quatre entrées, pas douze

```
/espace-agent
├─ /ma-journee        la file du jour : premiers contacts + relances datées
├─ /inbox             ses conversations
├─ /taches            ses vues sauvegardées
└─ /campagnes         lecture seule : où en sont ses prospects
```

L'agent **ne conçoit pas d'audience** : ni constructeur de campagne, ni segments, ni
délivrabilité. C'est ce qui garde son écran lisible — et c'est aussi la réponse au
grief « la page est trop chargée ».

---

## 4. À quoi ressemblent les trois écrans qui comptent

### La campagne — `?vue=sequence`

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Campagnes   Cohorte B · sans site        [Brouillon ▾] [⚙] [Lancer]  │
│ ┌──────────┬───────────┬───────────┬──────────┐                        │
│ │ Séquence │ Leads 297 │ Lancement │ Rapport  │                        │
├─┴──────────┴───────────┴───────────┴──────────┴────────────────────────┤
│                                                    ┌─────────────────┐ │
│   ┌─ J+0 ─────────────────────────┐                │ ÉTAPE 2         │ │
│   │ ✉  E-mail · automatique       │                │ ─────────────── │ │
│   │    « Votre site, en 72 h »    │                │ Canal   WhatsApp│ │
│   └───────────────┬───────────────┘                │ Mode    manuel  │ │
│              [+ Ajouter une étape]                 │ Jour    J+1     │ │
│   ┌─ J+1 ─────────────────────────┐  ◀── sélection │                 │ │
│   │ ⌾  WhatsApp · manuel          │                │ Message         │ │
│   └───────────────┬───────────────┘                │ ┌─────────────┐ │ │
│   ┌─ CONDITION ───────────────────┐                │ │ Bonjour     │ │ │
│   │ ◇  L'audit est-il prêt ?      │                │ │ {{prenom}}, │ │ │
│   └──────┬─────────────────┬──────┘                │ │ …           │ │ │
│      OUI │                 │ NON                   │ └─────────────┘ │ │
│   ┌──────┴──────┐   ┌──────┴──────┐                │ {{ }} 🖼 📎 A/B │ │
│   │ ✉ J+3 audit │   │ ☎ J+3 appel │                │                 │ │
│   └──────┬──────┘   └──────┬──────┘                │ Aperçu sur      │ │
│   ┌──────┴─────────────────┴──────┐                │ « SARL Martin » │ │
│   │ ✉  J+8 · clôture              │  ← chaque      └─────────────────┘ │
│   └───────────────────────────────┘    branche finit                   │
└────────────────────────────────────────────────────────────────────────┘
```

Le panneau de droite **est** l'éditeur de messages : mêmes variables, mêmes images,
même aperçu sur un vrai prospect, quel que soit le canal. Un canal n'a jamais « son »
écran — c'est ce qui a éclaté notre prospection en quatre surfaces.

### L'inbox — trois volets

```
┌───────────────┬──────────────────────────────────┬───────────────────┐
│ Filtres       │  SARL Martin · Cédric Martin     │ LE DOSSIER        │
│ ─────────     │  ──────────────────────────────  │ ───────────────── │
│ ● Non lus  12 │  ✉ 17/08  Votre site en 72 h  →  │ Cohorte B         │
│ ● À répondre 4│  ⌾ 18/08  WhatsApp           →   │ 06 12 … · pas d'@ │
│ ─────────     │  ⌾ 18/08  « pas intéressé »  ←   │ Site : absent ✓   │
│ Cédric M.  ⌾  │  📝 18/08  note de Bilal :       │ Audit : prêt      │
│ Toiture D. ✉  │     « rappeler en septembre »    │ Démo  : publiée   │
│ Plomb+ ☎      │  ─────────────────────────────   │ ───────────────── │
│ …             │  [Répondre ▾] [Intéressé] [Non]  │ Campagne : B août │
│               │   ✉ WhatsApp ☎ Note              │ Étape 3/6         │
└───────────────┴──────────────────────────────────┴───────────────────┘
```

C'est ici que la note de Bilal se voit — dans le fil, à sa date, à côté du reste.

### Les tâches — un tableau, pas un rail

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Aujourd'hui 24] [Sans réponse J+7] [Mes appels] [+ Nouvelle vue]    │
│ Canal: Appel ×  Cohorte: B ×  Échue ×               [+ Filtre] [⚙]   │
├──────┬─────────────┬──────────┬─────────┬──────────┬─────────────────┤
│ ☐    │ Entreprise  │ Tâche    │ Échéance│ Campagne │ Statut du lead  │
├──────┼─────────────┼──────────┼─────────┼──────────┼─────────────────┤
│ ☐ ☎  │ SARL Martin │ Appel 1  │ échue   │ B · août │ En cours        │
│ ☐ ⌾  │ Toiture Dup │ WhatsApp │ 10 h    │ B · août │ Envoyé          │
├──────┴─────────────┴──────────┴─────────┴──────────┴─────────────────┤
│ 2 sélectionnées : [Terminer] [Ignorer] [Reporter] [Changer d'agent]  │
└──────────────────────────────────────────────────────────────────────┘
```

**Terminer** ferme la ligne et **descend à la suivante**. La tâche suivante du même
prospect reprend sa place à sa date : elle ne double personne. Les compteurs des
onglets sont des **vues**, pas des signaux additionnés.

---

## 5. La barre de qualité — « même richesse, même prise en main »

Ce qui rend lemlist facile alors qu'il est riche, et qu'il faut copier au même titre
que les fonctionnalités :

- **On ne part jamais d'une page blanche** : un modèle, une duplication, ou un objectif
  décrit en une phrase.
- **Rien ne part sans avoir été vu** : l'onglet Lancement montre l'aperçu **par lead**
  avant le premier envoi.
- **Chaque écran répond à une seule question.** Rapports : « où en est-on ». Leads :
  « qui ». Tâches : « que fais-je maintenant ». Campagne : « qu'est-ce qui part ». Un
  écran qui répond à deux questions est l'écran surchargé qu'on remplace.
- **Ce qui bloque se dit en français, à l'endroit où ça bloque.** Nos dix-huit motifs de
  gel du régulateur ont déjà leurs libellés ; ils doivent remonter jusqu'à la ligne du lead.
- **Tout état visible est filtrable, et tout filtre est enregistrable en vue.**

---

## 6. Les trois shells actuels, et ce qu'ils deviennent

| Shell | Aujourd'hui | Demain |
| --- | --- | --- |
| Studio admin (`spaces.ts`, 7 espaces) | Séquences est dans *Acquisition*, Pipeline commercial dans *Relation*, Marketing pipeline dans *Marketing & Web* | Gagne l'espace **Prospection** ; les trois entrées éparses le rejoignent |
| Espace agent (`agentSpaces.ts`) | Démarchage, Séquences, Pipeline commercial, Marketing pipeline, Entonnoir… | Se resserre sur quatre entrées |
| Automatisations (`AutomationsShell.tsx`, 7 onglets) | Workflows, Séquences, Modèles, La semaine, Régulateur, Démarchage, Connexions | Ses écrans sont **embarqués** dans Prospection, pas réécrits |

**Le mot « démarchage » désigne aujourd'hui trois écrans différents** : l'entrée
*Démarchage* du menu admin pointe sur `/qualification`, l'espace agent a son poste de
travail `/espace-agent/demarchage`, et Automatisations a sa file
`/automations/prospection` — qui n'est atteignable depuis aucun espace du rail. C'est
une des causes du « ça nous perd ».

Le nouvel espace **embarque les composants existants** plutôt que de les réécrire :
`SequenceBuilder`, `TaskBoard`, `sequences/stats/_view.ts`, `RegulatorPage`.
