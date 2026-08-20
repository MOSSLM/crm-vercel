# Ce qui reste — refonte lemlist du CRM Sama

> Tenu à jour au fil des couches. Trois sections : **ce qui attend Matteo** (rien
> ne bouge sans lui), **ce qui m'attend** (du code), et **ce qui est mort à la
> mesure** (pour qu'on ne le repropose pas dans six mois).
>
> Dernière relecture : **20 août 2026** (couche 9 livrée — canvas conditionnel
> et les trois séquences ; puis l'interrupteur « canaux suspendus », qui permet
> de lancer S1 avant que les boîtes d'envoi soient chaudes).

---

## 1. Ce qui attend Matteo

Ces points bloquent du code déjà écrit. Tant qu'ils ne sont pas tranchés, la
suite ne peut pas être livrée honnêtement.

### 1.0 — Relire S1 / S2 / S3, puis les activer ⛔ *(nouveau le 20/08)*

Les trois séquences conditionnelles sont écrites et **les 132 inscriptions
vivantes y sont déjà posées, à l'étape qui leur correspond** (voir
`17-canvas-conditionnel.md`). Elles sont en `draft` : rien ne partira tant que
personne ne les aura activées — une séquence qui n'est pas `on` gèle ses
inscriptions avec un motif visible au lieu de les faire avancer.

**Ce qu'il faut de toi :** relire les messages et les délais dans l'éditeur, puis
activer S1. Les six anciennes sont archivées, pas supprimées.

**Et l'e-mail dans tout ça ?** Il est suspendu — `regulator_settings.canaux_suspendus`
vaut `{email}` depuis le 20/08, posé exprès. Voir § 1.0 bis : S1 peut être
activée **maintenant**, sans attendre le réchauffeur.

### 1.0 bis — L'e-mail est suspendu, et c'est ce qui débloque le lancement *(20/08)*

Les boîtes d'envoi ne sont pas chaudes, et le réchauffeur attend encore sa clé
(§ 1.3). Retirer les étapes e-mail des séquences aurait voulu dire les
réécrire plus tard, donc réintroduire les défauts qu'on vient de corriger.

À la place, **un interrupteur** : Pilotage › Régulateur › *Canaux suspendus*.
Un canal suspendu n'envoie rien **et la séquence continue quand même** — c'est
ce qui le distingue de la pause et de la phase de test, qui gèlent le prospect
là où il est.

**Ce que ça change sur le vrai S1, mesuré par `cheminSuppose` :**

| Profil | Canal ouvert | Canal suspendu |
| --- | --- | --- |
| Mobile, il répond | `wa1 → waW → waDemo → ⇢S2` | identique |
| **Mobile + e-mail, silence** | `wa1 → waW → wa2 → waW2 → mlQ →` **`ml1 → mlW → ml2 → mlW2`** `→ ap1 …` | `wa1 → waW → wa2 → waW2 → mlQ → ap1 → issQ → ap2 → ⇢S3` |
| E-mail seul | `mlQ → ml1 → mlW → ml2 → mlW2 → ap1 …` | `mlQ → ap1 → issQ → ap2 → ⇢S3` |
| Fixe seul | `mlQ → ap1 …` | identique |

La ligne du milieu est celle qui compte : **un prospect qui a mobile ET e-mail
atteint bien le barreau e-mail**, après tout le cycle WhatsApp (3 + 4 jours de
silence). Ce n'est pas l'échelle qui protège dans ce cas-là, c'est la
suspension.

**Exposition aujourd'hui : nulle.** Les 131 inscriptions vivantes ont toutes un
mobile — vérifié en base. Aucune ne touche une étape e-mail maintenant ; ce sont
les **75 en attente sur `waW`** qui y arriveraient dans une semaine si elles
restaient silencieuses.

**Le jour où tu rouvres :** un clic sur le même interrupteur. Les inscriptions
retenues repartent au tick suivant — leur `next_run_at` n'a pas été effacé,
exprès.

### 1.1 — Relire le message de la voie « sans réponse » ⛔

**Ce qui est fait le 20/08 :** le délai est posé (`s2` passe de 0 à **3 jours**),
la voie « sans réponse » est **écrite**, et la séquence a désormais ses deux
branches explicites — `s3` (« Très bien… ») n'est plus sur le tronc, elle est
sur la branche **réponse**. Un silencieux ne peut donc plus la recevoir : c'est
tenu par un test (`voie-silence.test.ts`).

**RIEN N'EST PARTI, ET RIEN NE PARTIRA TOUT SEUL.** Les 59 ont `next_run_at`
nul, et le régulateur ne sélectionne que du non-nul (`regulator-db.ts:330`) —
vérifié avant de toucher à quoi que ce soit. Le réveil est un `UPDATE` délibéré,
par paquets.

Le message écrit, à relire :

> Bonjour, je me permets de revenir vers vous.
>
> *(s'il a un site)* J'ai préparé une version plus vendeuse du site de {{company.name}} :
> *(sinon)* J'ai préparé un site pour {{company.name}}, vous pouvez le voir ici :
>
> {{company.demo_url}}
>
> C'est une démo, rien n'est publié sur Google — vous pouvez la regarder sans engagement.
> Si ce n'est pas le bon moment, dites-le moi et je n'insiste pas.
>
> {{owner.first_name | "Sama"}}

**Ce qu'il faut de toi :** un « ça me va » — ou une correction.

**Le réveil, lui, n'est plus un `UPDATE` à part.** Les 59 sont posées sur
l'attente de S1, ancre remise à maintenant : elles repartiront d'elles-mêmes à
l'activation, étalées par le délai de relance au lieu de tomber le même jour.

### 1.2 — Créer les 6 boîtes témoins du réchauffeur ⛔ bloquant

Gmail, Outlook, Yahoo, **Orange/Wanadoo et Free** (omniprésents chez les artisans,
absents des réseaux de chauffe américains).

⚠️ **Les mots de passe d'application se tapent DANS LE FORMULAIRE du CRM, jamais
dans le chat.** Ils sont chiffrés côté serveur et ne reviennent jamais au
navigateur. Je ne les saisis pas à ta place.

### 1.3 — Poser `RECHAUFFEUR_CLE` sur Vercel ⛔ bloquant

Sur **Production ET Preview**. Une variable posée sur Production seule fait
tomber toutes les Preview, et aucun merge n'y peut rien. Sans elle, le coffre du
réchauffeur refuse de sceller — c'est délibéré, il ne devine pas.

### 1.4 — Répartir les 121 opportunités orphelines

905 attribuées + 121 sans propriétaire = 1 032. Les orphelines n'entrent dans
aucune campagne tant que personne ne les possède.

### 1.5 — Décider : capture du parc (dépense)

908 sites à capturer, via **ScreenshotOne, qui est payant**. C'est une décision de
dépense, pas une décision technique — d'où le fait que je ne l'aie pas prise.
Sans capture, pas de variable d'image dans l'éditeur (voir §3.2).

### 1.6 — ~~Décider : le sort de LinkedIn~~ ✅ tranché le 20/08 — **on ne le fait pas**

Matteo : « ah bah fais pas linkedin ». C'était le canal sans matière —
**2 `linkedin_url` sur 60 456**, 6 contacts sur 374 — pendant que l'e-mail touche
478 fiches et le téléphone 860. Rien n'a été écrit ; rien n'est à défaire le jour
où le fichier changera.

---

## 2. Ce qui m'attend — le code

### 2.1 — ~~Couche 0 : la voie silence, et le réveil~~ ✅ *(clos le 20/08)*

Fait : le délai posé, les deux branches explicites, le modèle « Relance après
silence » créé, et l'avertissement **en rouge** dans l'éditeur quand une attente
est laissée à 0 (« attente sans limite — aucune horloge ne les réveillera »).
Le réveil est clos autrement que prévu : les 59 ont été **posées sur l'attente
de S1** avec l'ancre remise à maintenant. Elles repartiront à l'activation, et
le délai de relance les étale — plus besoin de paquets à la main.

### 2.2 — ~~« Adiana Services »~~ ✅ le 20/08 — et c'était un défaut général

Une seule inscription en production, mais pas un cas isolé : **annuler n'est ni
faire ni arrêter**, et ce troisième cas n'était traité nulle part. Une tâche
`skipped` laissait l'inscription `active`, `hold_reason` nul, `send_at` nul,
`next_run_at` nul — aucun tick ne la reprend, aucun écran ne la montre, aucun
motif ne l'explique.

`garerTacheAnnulee` pose désormais le motif `tache_annulee` (« tâche annulée —
reprendre ou sortir de la séquence »), sauf si une autre tâche court encore.
Adiana est garée avec ce motif : elle est visible, et la reprise reste une
décision humaine.

⚠️ Au passage, ma mesure « 5 enlisées » était fausse : 4 d'entre elles avaient
une tâche `snoozed`, qui revient dans la file. Il y en avait bien **une**.

### 2.3 — Effacer les 54 878 fausses estampilles RGE

`rge_rafraichi_le = 2026-08-16 02:17:00.123097+00`, la même à la microseconde,
posée sans jamais appeler l'ADEME. Ce sont **exactement** les 54 878 dont
`est_rge_indicatif` est nul.

⚠️ **Archiver avant** — le trigger `updated_at` détruit la preuve de ce qui était
là, et une fois écrasée elle ne revient pas.
⚠️ **Conséquence à dire avant de le faire** : ça remet 54 878 lignes dans la file
du cron, qui traite 40 fiches/heure — soit **environ 57 jours**. Le lissage
depuis l'app est le chemin plus rapide (§ couche 4 ter, livrée).

### 2.4 — ~~`v_entreprises_presence_site`~~ ✅ corrigée le 20/08

**Et ma note était fausse dans son sens.** Elle disait que la vue mettait la
colonne d'abord et appellerait « présent » 67 entreprises constatées absentes.
Mesuré : **0**. La première branche de son `CASE` ne peut rendre qu'« absent » —
le constat gagnait déjà.

Le vrai défaut était l'inverse, et bien plus gros : **25 291 entreprises avec
une URL en colonne et aucun constat y étaient déclarées « inconnu »**, c'est-à-
dire « personne n'a regardé ». On effaçait une mesure au lieu d'en inventer une.

`sql/20260820_presence_site_colonne.sql`, appliquée : la hiérarchie est écrite
une fois (hôte-sans-site → constat present/absent → colonne → constat inconnu →
rien), et deux colonnes disent d'où vient le verdict. Après correction :
present 25 406 (dont **25 340 par la colonne, en confiance `haute`**) · absent
797 · inconnu 34 253. Les 67 restent « absent ».

### 2.5 — Brancher `refresh-google-stats` sur le lissage

L'edge function prend des `project_ids`, pas des entreprises. Tant que la
correspondance n'est pas établie, le sujet `fiche_google` n'est confirmé à
confiance `certaine` que par `dossier-web`, en local.
⚠️ Un `place_id` à l'ancien format « ftid » fait retomber la fonction sur une
recherche par nom, **qui est facturée**.

### 2.6 — ~~Écran de choix du SIRET~~ ✅ livré le 20/08

`/prospection/identite`. Les quatre critères du registre affichés un par un, les
fiches serrées signalées, le SIRET vérifié au registre avant d'être écrit, et la
ligne de file libérée après la décision. Voir `14-lissage.md`.

**La tâche disait « 57 497 fiches sans porte de sortie ». C'était faux, et la
base l'a dit :** 57 497 est le nombre de fiches dont le sujet *identité* n'a
jamais été tranché — mais **57 801 d'entre elles ONT un SIRET** et n'attendaient
qu'une hydratation. Les fiches réellement sans SIRET sont **2 648**, dont 1 479
cherchables (nom + commune). Deux bugs se cachaient derrière ce chiffre, tous
deux corrigés — voir §2.6 bis.

### 2.6 bis — ~~458 candidats SIRET orphelins~~ ✅ régularisés le 20/08

`sql/20260820_candidats_siret_orphelins.sql`, appliquée. **Et ils n'étaient pas
un bloc** — les rejeter tous aurait été faux :

| | |
| --- | --- |
| **7** proposaient *exactement* le SIRET déjà posé | passés en `valide` : ils le **confirment** |
| **96** même SIREN, autre établissement | `rejete`, avec le motif : même entreprise, autre adresse |
| **355** un autre SIREN | `rejete`, avec le renvoi vers l'archive |

Archive préalable : `archive_candidats_siret_20260820` (458 lignes, plus le
SIRET et le SIREN de la fiche pour pouvoir refaire le tri sans rejouer la
jointure). `decide_par` reste **NULL** sur les 458 : personne ne les a regardés,
et la colonne doit continuer à le dire.

Reste `propose` : **365 lignes sur 138 fiches**, toutes réellement sans SIRET —
c'est-à-dire exactement ce que l'écran doit montrer.

### 2.7 — Couche 4 bis : finir l'éditeur (65 % livré)

Livré : repli `{{clé | "texte"}}`, conditionnel `{% si %}{% sinon %}{% fin %}`,
capacités par canal, coût SMS, aperçu sur un vrai prospect.
Reste :
- **variantes A/B** sur une étape, avec le taux de réponse par variante ;
- **pièces jointes et lien de plaquette par prospect** (`plaquette_token`) ;
- **la bibliothèque de modèles dans l'éditeur** — `whatsapp_templates`,
  `email_templates`, `call_scripts` existent, il manque leur présence au moment
  où l'on écrit.

### 2.8 — Couche 5b : le cœur est livré, le facteur reste à choisir

**Livré le 20/08** — `sql/20260820_reception.sql` appliquée (`message_id` unique,
`in_reply_to`, `recu_le`, `lu_le`, `assignee_id`), `src/lib/email/reception.ts`
(pur), `reception-db.ts`, `POST /api/email/entrant` signé en HMAC. 42 tests.
Voir `15-reception.md`.

La règle : **il faut un humain ET un appariement exact**. Une absence
(« je suis en congés ») entre dans le fil mais ne fait avancer AUCUNE séquence —
`declarerReponse` réancre la suite, et l'étape suivante est écrite pour
quelqu'un qui vient de parler. Un message apparié par la seule adresse de son
expéditeur est rangé, pas débloqué : deux inscriptions peuvent viser la même
adresse.

**⛔ Reste : le facteur.** Et la recommandation a changé le 19/08, quand
`reply_to` est passé à `contact@samadigitalstudio.fr` avec le sous-adressage
allumé. Les réponses arrivent **déjà** dans une boîte LWS, sous-adressées ;
`imapflow` est déjà une dépendance et le coffre chiffré existe. Donc :

- **B — relève IMAP sur `contact@samadigitalstudio.fr`** : zéro DNS, trois
  briques déjà écrites, un mot de passe d'application tapé dans le formulaire du
  CRM. **Recommandé.** Dépend de `RECHAUFFEUR_CLE` (§1.3) — la poser débloque
  donc deux couches.
- **A — sous-domaine + routage vers webhook** : demande de rechanger le
  `Reply-To` posé et éprouvé le 19/08, et de réprouver le `+` ailleurs. Ce qui
  était « ne touche à rien » ne l'est plus.

Le code ne change pas selon le choix : le facteur n'est qu'un adaptateur
au-dessus de `enregistrerEntrant`.

**Le réchauffeur complet en dépend** : ouvrir, répondre et sortir du spam
exigent de savoir recevoir.

### 2.9 — Couche 6 : finir les rapports (45 % livré)

Livré : l'entonnoir en partition, la comparaison par cohorte à âge égal.
Reste : les widgets déplaçables et les onglets sauvegardés.

### 2.10 — Les écrans pas encore ouverts

| Écran | État |
| --- | --- |
| `/prospection/leads` + `/segments` + `/lots` + `/desabonnes` | ✅ **ils existaient déjà, ailleurs.** L'explorateur porte les 25 familles de filtres, les segments enregistrés ET le figeage en lot ; `/blacklist` est la liste des désabonnés ; le dossier d'entreprise vit à `/companies/[id]` (et non `/entreprises/[id]`, qui n'existe pas). Il leur manquait d'être atteignables depuis Prospection : deux entrées de rail, le 20/08 |
| `/prospection/modeles` | ✅ existait aussi (`/automations/modeles`, trois familles + aperçu + « quelles séquences s'en servent »), et il était déjà dans le rail. Reste le petit manque : **créer** un modèle sans quitter l'étape du constructeur |
| `/prospection/signaux` | ✅ livré le 20/08 — voir `16-signaux.md` |
| Inbox à trois volets | 5a livrée (la conversation) ; les trois volets attendent 5b |
| Espace agent (Ma journée · Inbox · Tâches · Mes campagnes) | ✅ livré le 20/08 — section Prospection à quatre entrées, vérifiée dans le navigateur |

### 2.11 — ~~Couche 8 : signaux et lemAgent~~ ✅ livrée le 20/08

Le détail est dans **`16-signaux.md`**. Les trois choses à retenir ici :

1. **Une veille montre, elle n'agit jamais.** Aucune inscription, aucun envoi,
   aucune tâche — un signal qui déclencherait un envoi referait la faute des 59
   gelées, en pire. `veille_constats` (unique par veille + entreprise) convertit
   un état permanent en événement, et **la première passe est une reprise** :
   220 sites injoignables ne sont pas tombés cette nuit.
2. **Deux des quatre veilles du plan sont impossibles, et c'est mesuré.** La
   note d'audit qui chute : `entreprises_audit_site` a une seule ligne par
   entreprise, chaque analyse écrase la précédente. Le site qui vient de tomber :
   les 159 transitions « présent → absent » de `constats_presence` sont toutes
   survenues **le même jour, à zéro heure d'intervalle**, entre `dossier-web` et
   `verifier-sites` — deux bots qui se contredisent, pas 53 sites tombés. Les
   quatre restent à l'écran, grisées, avec leur raison.
3. **lemAgent assemble, il ne rédige pas.** Les modèles existent et un texte
   généré serait relu de toute façon ; ce qui manque n'est pas la prose mais
   l'arbitrage — « 30 jours équilibré » suppose un contact nominatif, et il y en
   a 75 sur 908. L'assistant est déterministe, rend des **réserves chiffrées**,
   et **dit ce qu'il n'a pas compris** plutôt que de l'avaler.

Reste ouvert : **pas de cron sur les passes**, délibérément — la cadence dépend
de la matière (le RGE bouge au trimestre, le rapport ouvert à l'heure), et on ne
la fixe pas avant d'avoir vu une veille tourner. Et **pas de filtre par segment**
sur une veille : `segments_entreprises` porte zéro ligne, la colonne `segment_id`
est en base pour le jour où.

### 2.11 bis — Ce que l'audit du 20/08 a trouvé, et ce qu'il en reste

Cinq lentilles indépendantes sur la surface prospection, chaque trouvaille
soumise à un sceptique chargé de la démolir. **14 ont survécu.** Corrigées le
jour même :

| | Ce que ça coûtait |
| --- | --- |
| **La liste de suppression n'était lue que si « vérifier avant d'envoyer » était allumé** | Éteindre un réglage de délivrabilité éteignait aussi, en silence, les rebonds durs, les plaintes et les **désabonnements**. Elle est désormais lue à chaque envoi, sans condition — et une liste *illisible* retient l'envoi (`suppression_illisible`) au lieu de passer pour une liste vide. |
| **Le garde s'ouvrait sur une panne de lecture** | `verify_before_send` ne destructurait pas `error` : une requête en échec valait « non », mise en cache 15 s. Désormais une table absente vaut « non », toute autre erreur retombe sur la dernière valeur connue, et un échec ne se met jamais en cache. |
| **Un e-mail de workflow partait hors régulateur** | Ni pause, ni plafond, ni plage. Le disjoncteur promet que « si la réalité dérape, tout s'arrête » — ce chemin-là continuait. `sendEngineEmail` refuse maintenant quand le régulateur est en pause, et le journalise. |
| **« Tester » envoyait pour de vrai** | La route choisissait la première VRAIE opportunité de l'étape de déclenchement, brouillon compris, et lui envoyait un e-mail ; `isTest` ne marquait que la ligne de run. L'essai rend maintenant ce qui SERAIT parti, sans partir. |
| **Trois conditions n'étaient jamais mesurées** | `ajouterLesPieces` n'avait aucun appelant : « l'audit est-il prêt ? » et « la démo est-elle prête ? » rendaient toujours `non_mesure`. Une fourche qui ne mesure pas ce qu'elle teste est pire qu'une fourche absente : elle a l'air de fonctionner. |
| **Le détail d'une campagne disait « pas encore de liste » à une campagne de 153 leads** | Il suffisait de filtrer sur « Écarté ». Trois vides confondus en un, et c'est le plus grave qui s'affichait — avec une invitation à verser un segment. |
| **La liste des campagnes affichait « Aucune campagne » sur une lecture ratée** | Et la bannière des 59 garées, calculée sur cette liste, disparaissait avec. |
| **Le tick de lissage : `remarques` n'était jamais rempli** | Mon propre défaut de la veille. Le champ était déclaré, initialisé, sérialisé et lu par l'écran — et personne n'y poussait rien. Le test censé le couvrir recopiait les deux `if` du moteur au lieu d'appeler le moteur. |
| **Le réchauffeur lisait « aucune mesure » comme « mauvais score »** | Score 0 → facteur 0 → « prospection suspendue tant que le score est sous 50 ». Le premier jour d'une boîte neuve, avant le moindre relevé, la chauffe se suspendait elle-même. |
| **Deux notes de doc démenties par le dépôt** | `08-rechauffeur.md` affirmait que le `.fr` n'a ni MX ni DMARC ; `14-lissage.md` gardait la fausse note sur la vue de présence. |

**Restent ouvertes**, par ordre de ce qu'elles coûtent :

- **`Delivrabilite.tsx` cache la carte du domaine de réception** quand il est le
  même que celui d'envoi (ce qui est le cas depuis le 19/08), pendant que le
  bandeau affirme au-dessus que « ces deux domaines sont différents à dessein ».
  Conséquence mesurable : ce domaine n'est plus contrôlé qu'au rôle `envoi`, où
  l'absence de MX vaut `ok`. Si le MX du `.fr` tombe, l'écran donne le feu vert
  à un domaine qui n'encaisse plus une seule réponse — au moment précis où la
  couche 5b s'appuie dessus.
- **Un DNS muet est rendu « Aucun SPF », en rouge.** Les quatre interrogations
  avalent l'échec en tableau vide : « le résolveur n'a pas répondu » et « la
  zone ne porte pas cet enregistrement » sont indiscernables. Il faut le
  troisième état, comme partout ailleurs.
- **Le réchauffeur calcule une capacité de prospection que personne ne lit.**
  `capacite().froidAujourdhui` et `rechauffe_jours.capacite_prospection`
  existent ; `regulator-db.ts` ne les consulte pas. À brancher **en même temps**
  que le réchauffeur, pas avant — c'est la couche 7, et elle attend §1.2/§1.3.

### 2.12 — Dette repérée en passant

**Traitée le 20/08 — `env.ts` ne tue plus l'API pour une variable de service.**
`vercel env pull` écrit un placeholder sur les variables marquées « Sensitive » ;
`RESEND_FROM_EMAIL` est la seule au format strict, et son placeholder faisait
jeter le module **à l'import**. Comme `getServiceClient()` l'importe, tout est
tombé en 500 — `/api/telephony/me`, `/api/agent/journee`,
`/api/entreprises/perimetre`, qui n'envoient aucun e-mail.

Désormais : une variable **optionnelle** mal formée vaut **absente**, la
fonctionnalité rend son 503 habituel, et `VARIABLES_IGNOREES` dit ce qui a été
écarté (plus un avertissement au démarrage — un dégradé silencieux serait pire
que la panne). Restent fatales : les deux clés Supabase, `GMAPS_API_TOKEN`, et
l'exigence d'au moins un secret de cron en production.
⚠️ Le `next build` local échoue toujours, et c'est normal : `GMAPS_API_TOKEN`
reste exigée. La vérification qui vaut ici est `npm run typecheck` + `npx jest`.

**Traitée le 20/08 — la signature d'un message n'est plus celle de celui qui
l'a écrit.** Deux modèles WhatsApp se terminaient par « Bilal » en dur, dont
« Envoi du site démo » qu'utilise **la seule séquence active** (153 inscrits).
Le parc, lui, est partagé : 561 fiches à Matteo, 344 à Bilal — la majorité des
prospects recevait donc un message signé de quelqu'un qui ne suit pas leur
fiche. Remplacé par `{{owner.first_name | "Sama"}}`
(`sql/20260820_signature_proprietaire.sql`, appliquée, archive préalable).

**Traitée le 20/08 — un prospect déjà touché ne retourne plus au stock.**
`aDemarcher()` rendait `true` sur une sortie `reattribution` quel que soit
l'avancement : un lead à sa quatrième relance, retiré à son agent, réapparaissait
en « À démarcher » et recevrait l'accroche une seconde fois. `exit_reason` dit
POURQUOI on est sorti, jamais si quelque chose était parti avant. La trace qui
survit à tout est `entreprises.premiere_touche_le` (posée quand une tâche est
bouclée, 121 fiches aujourd'hui) : elle remonte désormais dans le tableau et
`aDemarcher` la lit d'abord. Le cas ne mordait pas encore — aucune inscription
en `reattribution` en base — il aurait mordu à la première désattribution.

Non traitée :

- **`/api/agent/demarchage/templates` n'a aucun consommateur.** Repéré en
  cherchant où les modèles sont rendus : rien dans `src/` n'appelle cette route.
  La bibliothèque de modèles dans la carte de l'agent n'a jamais été branchée —
  c'est d'ailleurs l'un des restes de la couche 4 bis (§2.7).
- **Deux vocabulaires de variables coexistent**, et ils ne se recouvrent pas :
  le catalogue (`{{company.name}}`, `{{owner.first_name}}`, résolu par
  `rendreMessage`) et celui de la carte de l'agent (`{{prenom}}`,
  `{{entreprise}}`, résolu par un `fillVars` local dont la regex `\w+` ne peut
  PAS lire un point). Sans conséquence aujourd'hui — le `fillVars` ne sert qu'aux
  scripts d'appel en dur —, mais brancher la bibliothèque sans unifier ferait
  partir des `{{company.demo_url}}` bruts chez le prospect.
- **Deux `lienWhatsApp`** dans le dépôt (`lib/telephone.ts` et
  `lib/prospects/canal.ts`). Dette antérieure ; j'ai posé `lienSms` à côté de
  celui qui sert vraiment plutôt que d'en créer un troisième.
- **Le secret pg_cron est en clair** dans
  `sql/20260808_donnees_publiques_cron.sql`. Les migrations suivantes utilisent
  un placeholder ; celle-ci est restée en arrière. **Le secret est à tourner.**
- `edge function enrich/enrich-lead-magnet(1).zip` ressemble à un export oublié —
  à confirmer avant suppression.
- **ProÉco** figure dans les libellés et dans le schéma des sources, mais aucun
  bot du dépôt ne l'interroge.

## 3. Ce qui est mort à la mesure

**À ne pas reproposer.** Chaque ligne a la même forme : *le préalable manque, et
il ne se rattrape pas en écrivant du code.*

### 3.1 — `a_ouvert` et `a_clique` comme conditions

Resend ne suit pas par envoi, et on n'active pas le suivi de domaine (pixel et
réécriture de liens abîment la réputation de la boîte). Un « 0 ouverture »
ferait lire une absence de réaction là où il n'y a qu'une **absence de mesure**.

### 3.2 — Les variables d'image

`entreprises_audit_site` compte 1 968 lignes et **2 captures**. Montrer à un
artisan la photo de son propre site vaut tous les prénoms incrustés — mais il
faut d'abord les captures, et elles sont payantes (§1.5).

### 3.3 — LinkedIn, en l'état

0 entreprise sur 60 447. Voir §1.6 : c'est une décision, pas un renoncement.

### 3.4 — Cinq conditions écartées, et dites à l'écran plutôt que cachées

*Unsubscribed* (aucun mécanisme de désabonnement n'existe — ni en-tête
`List-Unsubscribe`, ni route à jeton : c'est un chantier à part) · *a un compte
WhatsApp* (indétectable avant d'écrire) · *invitation acceptée* et *message
LinkedIn ouvert* (aucune intégration) · *Has score* (aucun score n'existe ;
l'inventer créerait un chiffre que personne ne saurait expliquer).

---

## 4. Ce qui est fait, pour mémoire

| Couche | État |
| --- | --- |
| Dossier d'étude `docs/lemlist/` | 15 fichiers |
| 0 bis — `Reply-To`, en-têtes, `message_id` | livré (3 lignes irrattrapables) |
| 1 — L'objet Campagne | livré, `campagne_leads` peuplée (153) |
| 2 — Les conditions à trois verdicts | livré |
| 2 bis — Le canal SMS, en manuel | livré |
| 3 — Statuts de lead dérivés | **en service**, avec le motif du gel |
| 4 — Tâches en tableau + vues sauvegardées | livré |
| 4 bis — L'éditeur unique, tous canaux | 65 % |
| **4 ter — Lisser la base depuis l'app** | **livré** — voir `14-lissage.md` |
| **4 ter bis — L'écran de choix du SIRET** | **livré** — `/prospection/identite` |
| 5a — La conversation | livré |
| **5b — Recevoir** | **cœur livré** (module pur, base, route signée) — **attend le choix du facteur** |
| 6 — L'entonnoir en partition | 45 % |
| 7 — Le réchauffeur | complet en code, **attend §1.2 et §1.3** |
| **9 — Le canvas conditionnel** | **livré** — aiguillage à N voies, renvois et jonctions, fins écrites, fourches imbriquées, passage de relais entre séquences. Voir `17-canvas-conditionnel.md` |
| **9 bis — Les trois séquences** | **livré**, en `draft` — S1/S2/S3, 132 inscriptions repointées, les six anciennes archivées |
| `v_entreprises_presence_site` | **corrigée le 20/08** — 25 291 fiches ne sont plus « inconnu » à tort |
| Candidats SIRET orphelins | **régularisés le 20/08** — 458 tranchés en 7 + 96 + 355, archivés d'abord |
| DNS du `.fr` | **vérifié le 20/08** : DKIM, SPF sur `send.`, DMARC `p=none`, MX publiés |

⚠️ **La règle qui ne change jamais :** l'envoi part du `.fr`, les boîtes sont sur
le `.com`. Deux réputations, jamais confondues. **Ne jamais envoyer de
prospection depuis le `.com` par Resend** — son SPF est en `-all` sans Resend, et
son DMARC en `p=quarantine`.
