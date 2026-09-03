# Sama CRM — ce qu'il faut savoir avant de toucher à quoi que ce soit

Ce fichier est lu au démarrage de chaque session. Il ne décrit pas le code —
le code se lit — il porte ce qui ne se déduit **pas** en le lisant : les
outils qui existent déjà, et les pièges déjà payés.

## Avant de fabriquer un bot, lire le registre

**`src/lib/architecture/bots.ts`** catalogue tout ce qui collecte, cherche,
enrichit, mesure et fabrique : scripts locaux, edge function, routes, crons,
services externes. Chaque entrée porte son chemin, ce qu'elle coûte, si elle
écrit en base, et les règles qu'il ne faut pas réapprendre.

> **La règle : on ne crée pas un nouveau bot sans avoir lu l'entrée
> correspondante.** Si rien ne correspond, on ajoute l'entrée en même temps que
> le bot — pas six mois plus tard.

Visible dans le CRM : **Pilotage → Les bots**. Les schémas d'architecture
(`src/lib/architecture/diagrams.ts`) sont dans **Pilotage → Architecture**.

Quelques réflexes que le registre détaille :

- La recherche de présence web **existe déjà** (`scripts/prospection/`) et elle
  est aboutie. Ne pas réécrire un scraper Google : tout ce qui ne marche pas a
  déjà été essayé et est documenté.
- **Le CAPTCHA de Google ne se résout jamais** — ni par un script, ni en le
  demandant à un humain : il se réémet à l'infini face à un navigateur piloté.
- Chercher et écrire sont **deux scripts séparés**. Garder cette séparation :
  c'est elle qui rend une collecte relançable sans conséquence.
- **PageSpeed jamais en masse** : le quota est la ressource rare.

## Les pièges d'infrastructure

**Le dépôt n'est pas la vérité sur Supabase.** Les fonctions déployées et le
schéma réel peuvent diverger des fichiers. Vérifier en base avant de conclure.

**L'edge function n'est pas dans `supabase/functions/`** — ce dossier n'existe
pas ici. La source vit dans `edge function enrich/`, recopiée puis déployée via
`npx supabase functions deploy`. Ne pas la chercher ailleurs.

**Archiver avant toute écriture de masse.** Le trigger `updated_at` détruit la
preuve de ce qui était là. Une fois écrasée, elle ne revient pas.

**Les lignes filles se créent toutes seules.** Des triggers posent les projets
et les entreprises à la création d'une opportunité : faire `UPDATE`, jamais
`INSERT`, sous peine de doublons.

**Republier efface le CSS du site.** `shared_assets.css` est régénéré depuis le
gabarit : tout correctif CSS doit être cuit dans l'asset, sinon la republication
l'annule. Corollaire : un correctif qui vaut pour **tout** le parc se pose
plutôt dans `src/app/(public)/layout.tsx`, seul calque commun au site publié et
à l'aperçu brouillon — voir `src/lib/site-builder/defilement-lateral.ts`.

**`body { overflow-x: hidden }` ne clippe rien.** Tant que `html` reste en
`overflow: visible`, la valeur du `body` est *propagée au viewport* et `body`
garde un `visible` d'usage. Le gabarit croit se prémunir du débordement latéral,
il ne fait que masquer la barre : la page reste tirable au doigt. Il faut la
règle sur `html` **et** sur `body`, et en `clip` — `hidden` ferait du `body` un
conteneur de défilement et décollerait tous les en-têtes `sticky`.

**Mettre un site sur le domaine d'un client** a sa procédure :
`docs/site-builder/mise-en-ligne-domaine-client.md`. Un seul point ne se
rattrape pas — **le plan de redirection se construit AVANT la bascule du DNS** :
une fois le domaine pointé chez nous, `client.fr/sitemap.xml` rend le NÔTRE, et
le plan se bâtit sur les URLs du nouveau site sans que rien ne le signale. Tout
le reste (domaine, DNS, `noindex` de la démo, SEO par page) se corrige après
coup ; l'ancienneté des vieilles URLs, non.

Deux documents voisins portent ce qui a été **mesuré** autour de ces sites :
`docs/site-builder/securite-et-exploitation.md` (dont les 21 routes
`site-builder/[siteId]` ouvertes à tout compte authentifié) et
`docs/site-builder/performance-des-sites-publies.md` (d'où viennent les 5 à 8 s
d'affichage, et ce qui se gagne sans toucher au rendu).

**Resend interdit le cold outreach, nommément — et tout ESP transactionnel
aussi.** Sa politique d'usage (`resend.com/legal/acceptable-use`, mise à jour le
27/08/2026) proscrit « *unsolicited messages of any kind, including cold
outreach, purchased lists, or scraped contact data* », plafonne les plaintes à
**0,08 %** (quatre fois plus sévère que Gmail) et se réserve de fermer le compte
« *without warning* ». Nos 57 744 adresses viennent d'un enrichissement de
sites : elles cochent deux de ces trois mots. Postmark, Mailgun, Brevo et
**Amazon SES — la couche sous Resend** — l'interdisent pareillement ; passer en
direct ne change que qui applique la règle. Ce qui rend la sanction chère n'est
pas la prospection perdue : **le même compte porte les démos, les plaquettes,
les confirmations de RDV et le portail client**. D'où la ligne de partage posée
sur l'étape (`SequenceStep.transport`) : `resend` pour le SOLLICITÉ — une
plaquette demandée au téléphone n'est pas du courrier non sollicité —, `smtp`
pour le FROID, qui part de nos propres boîtes sur un domaine consommable. Une
étape marquée `smtp` est **retenue** (`transport_indisponible`) tant que la
flotte n'existe pas : elle ne retombe JAMAIS sur Resend « en attendant », et
c'est ce repli silencieux que `transport-froid.test.ts` verrouille.

**Le domaine qui envoie et le domaine des liens ne doivent pas être le même.**
La Domain Blocklist de Spamhaus est interrogée sur « les domaines apparaissant
dans les en-têtes **et le corps** », et elle liste « au niveau du domaine
principal, **tous ses sous-domaines** rendant également un résultat listé ». Or
`samadigitalstudio.fr` envoie ET porte toutes les démos
(`{label}.samadigitalstudio.fr`) : s'il se dégrade en prospectant, ses liens
sont pénalisés **y compris dans les emails partis d'un autre domaine**, et
Gmail comme Outlook peuvent désactiver les liens d'un message par ailleurs
délivré — aucune métrique d'envoi ne bouge, et plus personne n'ouvre sa démo.
Un sous-domaine n'isole rien. Les démos sont un actif durable, les domaines de
prospection des consommables : on ne loge pas l'un sur l'autre. Corollaire de
routage : `/desabonnement` est servi sur **tout** hôte
(`deciderDestination`), pour que le lien de désinscription porte le domaine
d'envoi et non celui des démos.

**Le GET d'un lien de désinscription ne doit rien écrire.** Les passerelles
antispam et les aperçus de lien SUIVENT les URL d'un message : un GET qui
désabonne désinscrirait un lot entier sans qu'un prospect ait cliqué, et on
chercherait la cause dans le contenu. C'est la raison d'être de la RFC 8058 —
`List-Unsubscribe-Post` impose un POST, qu'un scanner n'émet pas. Deux portes,
donc, partageant une seule écriture : `POST /api/desabonnement/{jeton}` (le
bouton natif de Gmail) et `GET /desabonnement/{jeton}` (une page, un bouton).
Le jeton est **signé, pas stocké** — la leçon de `liensDesPieces` : fabriquer un
jeton au rendu transforme une lecture en écriture. Il porte l'INSCRIPTION et
jamais l'adresse, pour qu'aucune donnée personnelle ne circule dans une URL. Et
la route rend `fait: false` quand elle n'a rien pu écrire : un 200 ne prouve pas
la suppression, et annoncer « c'est fait » à tort laisserait le prospect se
croire tranquille pendant qu'une autre séquence lui écrit.

**Les images d'un artisan sont à lui seul.** Jamais versées dans le fonds
commun — `entreprise_id` est un mur, pas un tri.

**Le fil d'activité est une vue, et elle ne se lit qu'entreprise par
entreprise.** `vue_fil_activite` unifie neuf tables en UNION ALL. Interrogée
sans `entreprise_id`, chaque branche parcourt sa table entière. La route
`/api/entreprises/:id/fil` est le seul appelant, et le filtre y est posé.
Corollaire déjà payé : quatre de ces tables portent `entreprise_id` en
`integer` quand `entreprises.id` est `bigint`, la vue caste pour unifier le
type, et **un cast rend le filtre non-sargable** — d'où les index d'expression
`((entreprise_id)::bigint)` de `sql/20260826_fil_activite.sql`. Sans eux, Seq
Scan sur les quatre, y compris `email_logs`.

**Le service worker ne peut pas atteindre les sites publiés, et c'est
structurel.** Le CRM vit sur `app.{SITE_DOMAIN}`, les sites clients sur
d'autres hôtes : la portée d'un service worker s'arrête à son origine.
`public/sw.js` est bien servi partout (le middleware laisse passer tout chemin
contenant un point) mais **un fichier n'est un service worker que si une page
l'enregistre** — et seul `(crm)/providers` l'enregistre. Ne jamais monter
`ServiceWorkerBridge` ni déclarer le manifeste dans `(public)`. Et ne jamais
ajouter de `respondWith` dans le gestionnaire `fetch` : il est vide exprès,
un service worker qui met les navigations en cache sert des écrans périmés
qu'on cherche ensuite dans le mauvais code.

**Le seuil de « pourrissement » d'une affaire vit dans le code, pas en base.**
`vue_opportunites_suivi` rend des durées (`jours_sans_echange`,
`jours_de_retard`) et jamais de verdict ; le classement est dans
`src/lib/opportunites/suivi.ts`, parce qu'un seuil commercial change et qu'il
ne doit pas coûter une migration. Deux pièges y sont verrouillés par des
tests : `jours_sans_echange` **nul n'est pas zéro** (nul = jamais aucun
échange, le cas de la grande majorité du fichier), et un déplacement de carte
n'est **pas** un échange — sinon ranger son pipeline rajeunirait tout le
portefeuille.

**Un filtre lu dans un CTE est invisible au planificateur.** `explorateur_entreprises`
croisait ses vingt-sept filtres depuis un CTE `f` d'une ligne : `f.qualifie` n'est
alors pas une valeur mais une colonne opaque, aucun des prédicats n'est estimable,
et les sélectivités par défaut se multiplient. L'estimation tombait à quelques
dizaines de lignes pour 60 078, les six jointures repassaient en boucle imbriquée,
et la fonction est passée de 2 s à **199 s** sans que rien ne change dans les
données. Le SQL est donc assemblé (`explorateur_base_sql`, `sql/20260828_…`) et
n'émet que les prédicats demandés — 0,5 s sans filtre, 40 à 280 ms avec. Deux
corollaires à ne pas réapprendre : un `coalesce(colonne, false)` n'est pas
estimable non plus (0,5 par défaut) là où `is not true` lit les statistiques ; et
**le symptôme à surveiller n'est pas un temps, c'est une estimation qui
s'effondre** — le contrôle est en fin de fichier de migration.

**Un filtre coûteux sans index se paie dix fois.** `chercher_entreprises`
plafonne à 200 lignes par appel, donc tout traitement de masse le rappelle en
boucle — et chaque appel refaisait le balayage des 60 726 fiches. Une passe de
lissage de 2 000 coûtait une vingtaine de secondes avant
`entreprises_sans_site_idx`. **Le prédicat de l'index recopie celui de la
fonction mot pour mot** : le planificateur inline `host_est_generique`, et la
moindre variation d'écriture lui fait cesser de prouver l'implication — sans
rien signaler. Contrôle en une ligne dans `sql/20260826_index_sans_site.sql`.

**Ne jamais épingler le `search_path` de `host_est_generique`, `host_key` ni
`chercher_entreprises`.** Les advisors Supabase les signalent en
`function_search_path_mutable`, et le correctif réflexe est un
`alter function … set search_path`. Mais une fonction SQL portant une clause
`SET` **ne peut plus être inlinée** — et c'est l'inlining qui fait reconnaître
le prédicat de `entreprises_sans_site_idx`. Les épingler ferait silencieusement
retomber l'explorateur de 351 ms à 6 461 ms, index toujours présent et inutile.
Les autres fonctions du projet sont épinglées sans risque : aucune n'a de
prédicat à faire reconnaître par un index partiel.

**Un lot se fige depuis des critères, mais jamais en silence.** La règle
d'origine (« depuis une liste d'identifiants, jamais depuis des critères »)
visait le silence d'une divergence, pas la résolution côté serveur — et à
34 633 lignes, ce que l'humain voit est un NOMBRE, pas une liste. Les deux
fonctions de figeage comparent donc ce nombre et **refusent de créer quoi que ce
soit** s'il a bougé. Deux pièges y sont écrits : un paramètre de SORTIE plpgsql
nommé comme une colonne rend la clause `on conflict` ambiguë (et seul le chemin
de création échoue, pas les refus) ; et un segment né du pipeline marketing porte
`services`/`filtres`, que `chercher_entreprises` ne sait pas trancher — le
matérialiser rendrait une population bien plus large.

**Trois portes pour figer, et aucune ne remplace les autres.** Par identifiants
(cocher dans le pipeline marketing ou l'explorateur, plafond 500) ; par critères
`chercher_entreprises` (`figer_lot_depuis_criteres`, la porte de l'atelier, neuf
drapeaux) ; par filtres d'explorateur (`figer_lot_depuis_explorateur`, les
vingt-sept familles). **Elles ne disent pas la même chose** : `sans_site` chez
`chercher_entreprises` passe par `host_est_generique` — une page Facebook compte
comme « pas de site » — quand `site = ['absent']` chez l'explorateur lit
`site_web_canonique` et les constats. Les fusionner changerait en silence ce que
« sans site » veut dire, sur les deux écrans à la fois. Ce qui rend la troisième
sûre est qu'elle n'a **aucune définition à elle** : elle appelle le même
`explorateur_base_sql` que l'affichage, depuis le même objet de filtres validé
par le même schéma (`api/entreprises/explorateur/_filtres.ts`).

**« Sans site » a maintenant un TROISIÈME lecteur, et il lit la définition de
l'explorateur.** Le filtre Site de « Ma journée »
(`src/lib/agent-portal/etat-site.ts`) rend les trois états de
`v_entreprises_presence_site` — une URL en base fait foi, sinon le dernier
`constats_presence`, sinon `inconnu`. Il n'invente donc rien, mais il faut
savoir ce qu'il dit : une page Facebook ou `sites.google.com` compte « avec
site » ici et « sans site » chez `chercher_entreprises` (15 tâches dans ce cas
au 01/09/2026). Deux pièges y sont verrouillés par des tests : la vue fait un
`nullif(btrim(…), '')` que l'explorateur ne fait PAS — `site_web_canonique`
vaut la chaîne vide sur sept tâches, dont six portent un constat « absent »,
qu'un `is not null` rangerait « avec site » contre leur propre constat ; et
**la cohorte ne répond pas à cette question** — elle est figée au jour du
démarchage, 115 lignes étiquetées `B_sans_site` portaient une URL au
01/09/2026, d'où l'étiquette « a un site » qui dément la ligne plutôt que de
laisser seule la version périmée. La séparation vérifié / non vérifié n'est pas
une coquetterie : 74 absences constatées en base contre 34 244 fiches jamais
regardées.

**Le seul endroit du CRM où un HUMAIN pose un constat de présence, c'est la
ligne « Site » de « Ma journée »** (`DemSiteWeb`,
`/api/agent/demarchage/site`). Deux règles y sont verrouillées par des tests :
le constat s'écrit AVANT la fiche — la table est append-only, elle est la
trace ; la colonne, elle, s'écrase, et si la seconde écriture échoue l'état
calculé reste celui d'avant plutôt qu'une absence inventée. Et **cocher « aucun
site » EFFACE `site_web_canonique`** : c'est le troisième piège de
`20260817_constats_presence_trois_etats` — un constat « absent » sur une fiche
qui garde une URL est contredit par sa propre table, l'URL gagne, et l'agent
recocherait trois fois sans rien voir changer. L'adresse effacée ou corrigée ne
survit que dans `preuve.url_precedente`. Le bouton « Google » n'appelle rien :
il ouvre un onglet, parce que le CAPTCHA ne se résout jamais.

**« Prêt pour la démo » et « couverture » ne se déduisent pas l'un de l'autre.**
Les sept axes comptent des PIÈCES (SIRET, constat, démo…) ;
`pretes_pour_demo_des_lots()` compte des fiches FABRICABLES. Une entreprise peut
avoir toutes ses pièces et rester impossible à mettre en site faute de code
postal. La définition de « prête » est donc recopiée en SQL depuis
`missingForSite` et `SITE_REQUIRED` — troisième copie assumée, parce qu'appliquer
des règles TypeScript à 60 000 fiches pour rendre un compteur n'est pas tenable ;
`pret-demo.test.ts` tient la couture, comme `missing-for-site.test.ts` tient
l'autre.

**Le logo n'est plus une exigence, et il ne doit pas le redevenir.** 738 fiches
sur 60 445 en ont un. Un artisan sans logo n'a jamais payé de graphiste, et
`hydrate-logo` compose son nom dans la police du design. Ce qui se travaille
n'est donc pas « combien en ont un » mais le clivage : celles dont le logo est
sur un vrai site (à prendre) contre celles qui n'ont aucune URL (rien à
chercher). Les additionner ferait passer une impossibilité pour du retard. Les
drapeaux `avec_logo` / `sans_logo` de `chercher_entreprises` rendent ce tri
adressable — **ajouter une VALEUR à `p_flags` ne change pas la signature**, donc
pas de surcharge ; ajouter un PARAMÈTRE, si, et c'est le piège de
`20260820_chercher_entreprises_owner.sql`.

**Ce qui exige le poste local n'est pas une dette.** Onze bots sur trente-trois
sont des scripts locaux, et c'est la raison pour laquelle ils marchent :
Playwright, un profil Chrome persistant, des CAPTCHA, Chromium qui ne tient pas
dans une fonction Vercel. L'atelier (`/atelier`) ne cherche pas à les déplacer —
il les COMPTE par `lissage_leads.lieu` (`serveur` / `local` / `humain`) pour que
l'absence soit productive. Corollaire côté plaquettes : la préparation du LIEN
est une route API (donc mobile), seul le PDF reste au bureau.

**Un écran absent de `spaces.ts` n'existe pour personne.** Le rail, le
sous-menu ET la palette ⌘K lisent tous ce fichier (`getAllTools`) : une route
qui répond parfaitement mais n'y est pas déclarée n'a AUCUN chemin, et rien ne
le signale — un menu incomplet ne casse jamais rien, il perd juste des écrans.
L'atelier a vécu ainsi plusieurs jours. `navigation-mobile.test.ts` tient
désormais les deux sens : pas de lien mort, et pas de destination mobile
absente des espaces.

**La barre du bas ne montre que ce qui a été vérifié au pouce.** Elle versait
tout le menu de bureau dans un téléphone, feuille « Plus » comprise : trois taps
menaient au Site builder. `src/components/layout/mobile.ts` porte la liste, et
chaque entrée porte la RAISON de sa présence — sans ce critère écrit, la liste
regonfle jusqu'à redevenir le menu. Une ligne, cinq places, aucun débordement :
ce qui n'y est pas passe par la recherche du haut. **Le dégagement sous la barre
est posé dans les deux coques** (`StudioShell`, `AgentPortalLayout`), avec le
même `env(safe-area-inset-bottom)` que la barre — jamais par écran, sinon il
faut s'en souvenir à chaque nouvelle page.

**Un admin satisfait une porte `freelance`, jamais l'inverse.** `requireRole`
testait l'égalité stricte : le propriétaire du CRM recevait 403 sur ses propres
écrans de travail. Ce qui rend le passage sûr, et qu'il faut vérifier avant
d'ajouter une route : **aucune route `/api/agent/*` ne lit d'identifiant d'agent
dans ses paramètres**, toutes se cadrent sur `user.id`. Une route qui accepterait
un `agent_id` exigerait `role: "admin"` et un contrôle explicite. Le pendant
existe pour l'autre besoin : `requireStaff` quand les données couvrent tout le
parc plutôt que le périmètre du caller.

**`prospection_tasks.status = 'skipped'` ne dit pas QUI a écarté.** Quatre
chemins l'écrivent et deux sont des machines (réattribution dans
`api/admin/_assign.ts`, canal impossible dans `demarchage/hors-canal`). Aucune
colonne ne les distingue — ni `done_at`, ni `routing_reason`. Sur les 722 lignes
écartées au 27/08, **706 sont des tâches d'appel abandonnées en masse** quand le
canal téléphone a été laissé de côté : les compter comme du travail d'agent
mentirait de 70 %. `/equipe` les rend à part, sous une séparation, « toutes
causes ».

**Une séquence ne voit que le canal sur lequel elle écrit.** Un prospect qui
répond AILLEURS — il rappelle au téléphone après une accroche WhatsApp — est
invisible pour elle : l'attente n'est pas levée, et la voie du SILENCE part
quand même. Azur Climat Froid (29/08/2026) a reçu de la file une relance « je me
permets de revenir vers vous […] si ce n'est pas le bon moment, dites-le moi »
deux heures après avoir appelé, reçu la démo et la plaquette. Rien n'était en
panne : le CRM n'avait qu'un message sortant, parce que consigner l'échange
coûtait quatre gestes dans quatre écrans, et que personne n'en fait quatre en
raccrochant. D'où **« Il m'a rappelé »** sur la carte de démarchage
(`/api/agent/demarchage/il-a-rappele`), qui les fait tous d'un clic et bascule
vers **S4 — Il a rappelé** (`sql/20260829_sequence_il_a_rappele.sql`) : elle
n'envoie rien de plus — il a déjà tout —, elle pose l'appel de suite avec le
script qui correspond, et laisse les issues décider. Deux règles y sont
verrouillées par `hors-scenario.test.ts` : **on inscrit dans la cible AVANT de
sortir de la courante** (un prospect sans inscription vivante n'est sur aucun
écran, et rien ne le signale), et la note est **obligatoire** — un « il a
rappelé » vide ne vaut pas mieux que le silence qu'il remplace.

**Entre deux étapes, un prospect n'a AUCUNE surface — et ça ne se lit pas comme
une attente, ça se lit comme une disparition.** Une séquence ne pose de carte
qu'aux dates qu'elle a prévues ; entre deux, l'inscription est `active` avec un
`next_run_at` dans le futur, donc pas de tâche, donc pas de carte, donc aucun
écran. 214 inscriptions étaient dans cet état au 01/09/2026. JM2C, ce jour-là :
la démo part à 10h50, `waDemo` bascule sur S2 dont la première étape porte
`day: 2` — prochaine carte le 03/09. Une minute plus tard le gérant répond
« nous n'avons pas besoin ». Rien de tout ça ne pouvait entrer, pas même le lien
de la plaquette qu'on était en train de lui annoncer : il ne vivait que dans la
charge utile de la carte disparue. Le 03/09, la file aurait rendu « Plaquette —
ce que ça coûte » à un homme qui venait de dire non. D'où
`/api/agent/demarchage/echange` et `DemEchange`, sur la fiche hors file : où il
en est et **quand il revient**, les trois liens à jeton préparés à la demande,
et l'échange consigné avec son issue. **Ce n'est pas « il m'a rappelé »** — pas
de bascule de scénario, pas d'appel de suite : on consigne, et on décide
seulement du sort de la séquence en cours (on continue, on repousse, on arrête).
Trois règles y sont verrouillées par `echange/__tests__/route.test.ts` :
**`answered` ne pose PAS `replied`** (le piège de `reply.ts` — un accusé de
réception éteindrait les cellules WhatsApp et Appel, c'est-à-dire les étapes
qu'on veut jouer), **sans issue la séquence ne bouge pas**, et une pièce sans
lien n'est pas journalisée. Corollaire côté lecture : le GET ne prépare les
liens que sur `?pieces=1`, parce que `liensDesPieces` CRÉE les jetons manquants
et qu'ouvrir une fiche ne doit pas écrire en base.

**La DA lemlist ne se réinvente pas : `lem-skin.css` existe.** Palette relevée
le 19/08/2026 sur lemlist.com en lisant les styles CALCULÉS, jetons préfixés
`--lem-` (hors skin, `--accent` est une surface de survol, pas une couleur de
marque — une collision repeindrait des boutons ailleurs), thème sombre inclus.
Une forme qui manque s'ajoute DANS ce fichier avec ses jetons ; un douzième skin
serait un skin de plus à faire converger le jour du re-skin global.

## Où vivent les données qui trompent

| Ce qu'on cherche | Où c'est vraiment |
| --- | --- |
| CA, effectif | `entreprises_donnees_publiques` (les colonnes `*_band` d'`entreprises` sont de la prose libre, presque toujours nulles) |
| Site présent / absent / inconnu | `constats_presence` — « absent » et « inconnu » ne s'écrivent pas comme le même `NULL` |
| Technologie, ancienneté du site | `entreprises_audit_site` |
| Ce qui s'est passé avec une boîte | `vue_fil_activite` — neuf tables unifiées, **jamais sans filtre `entreprise_id`** |
| Ce qui reste à faire sur un lot | `couverture_des_lots()` (les sept axes) et `vue_opportunites_suivi` (le pipeline) |
| Combien sont fabricables tout de suite | `pretes_pour_demo_des_lots()` — les axes comptent des PIÈCES, celle-ci des fiches |
| Ce qui attend le poste local | `lissage_leads.lieu = 'local'` avec `statut = 'a_faire'` |
| Le canal d'un geste journalisé | `activity_log.metadata->>'channel'`, pas `activity_type` (qui dit la NATURE, pas le moyen) |
| Ce que fait l'équipe | `activite_des_agents()` — file, terminées, gestes par nature sur 30 j. Les verdicts sont dans `src/lib/equipe/activite.ts` |
| Un geste à coup sûr humain | `agent_activity_events` — seules les routes agent y écrivent. `prospection_tasks.status` ne dit pas l'auteur |

## Conventions

- **Le code et les commentaires sont en français**, y compris les noms de
  variables métier. Les en-têtes de fichier expliquent le *pourquoi*, pas le
  *quoi* — s'y conformer en ajoutant du code.
- **Écrire comme le code voisin** : même densité de commentaire, même idiome.
- `npm run typecheck` avant de considérer un travail terminé.
- Le travail se fait **sur `main`, en ajoutant plutôt qu'en réécrivant**, pour
  qu'un déploiement n'annule jamais ce qui tourne déjà.

## Points ouverts

- Le secret pg_cron est **en clair** dans
  `sql/20260808_donnees_publiques_cron.sql`. Les migrations cron suivantes
  utilisent un placeholder ; celle-ci est restée en arrière et le secret est à
  tourner.
- `edge function enrich/enrich-lead-magnet(1).zip` ressemble à un export
  ponctuel oublié — à confirmer avant suppression.
- `DemRail.test.tsx` échoue sur `main` depuis avant le 26/08 (la mise de côté
  ne pose plus `.st.cote`). Un seul test sur 4 257 ; à reprendre avec le
  contexte du démarchage.
- Les notifications poussées ne partent que si `VAPID_*` est posé en
  production (`node scripts/pwa/vapid.mjs` fabrique la paire). Sans les clés,
  tout fonctionne à l'identique, sans push et sans erreur.
- La grille du **boost SEO local** (`src/lib/audit/prix-seo-local.ts`) est la
  seule de la plaquette écrite dans le code : aucune ligne `offres` ne porte ce
  produit. Le jour où elle existe, c'est là qu'elle se branche — le reste des
  prix vient du catalogue, et l'en-tête de `prix-site.ts` dit ce que coûte un
  tarif figé.
- **ProÉco** figure dans le schéma des sources et dans les libellés de
  l'explorateur, mais aucun bot du dépôt ne l'interroge : les fiches portant
  cette source viennent d'un versement antérieur.
