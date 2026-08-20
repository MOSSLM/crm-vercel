-- La liste de leads d'une campagne.
--
-- POURQUOI CETTE TABLE EXISTE
-- Une campagne, chez lemlist, c'est quatre choses en un objet : la séquence
-- (ce qu'on dit), la liste (à qui on le dit), le lancement (quand) et le
-- rapport (ce que ça a donné). Chez nous, `automations` (kind='sequence')
-- porte déjà TOUT sauf la liste — la séquence, les plages d'envoi, le public
-- visé, la priorité de file, le plafond, l'étape de reprise commerciale,
-- l'accès par agent. Il ne manquait que le « à qui ».
--
-- Faute de liste, on inscrivait un prospect depuis quatre écrans différents
-- (marketing pipeline, pipeline commercial, poste de démarchage, espace agent)
-- et PERSONNE ne pouvait répondre à « qui est dans cette campagne ». C'est le
-- seul manque structurel de notre prospection ; le reste en découle.
--
-- LA CAMPAGNE EST L'AUTOMATION. Pas de table `campagnes` : elle serait 1-1 avec
-- `automations` et forcerait six lecteurs à apprendre une nouvelle clé
-- (`sales-pipeline/_board.ts`, `week/_view.ts`, `regulator-db.ts`,
-- `sequences/stats/_view.ts`, `sequence_agent_assignments`,
-- `/api/agent/sequences`). On ajoute la liste, on ne déplace rien.
--
-- POURQUOI PAS `lots_entreprises`
-- Tentant : la table existe et elle est vide. Mais un LOT est une photo qui ne
-- bouge plus — c'est précisément ce dénominateur stable qui rend une campagne
-- mesurable. Une liste de campagne, elle, bouge : on écarte un lead, on
-- rafraîchit depuis le segment, on note pourquoi il n'est pas parti. Y écrire
-- cet état détruirait le seul objet du CRM dont la population est figée.
-- Le lot reste la photo, cette table est la liste de travail, et elle
-- RÉFÉRENCE son origine (`origine` + `origine_ref`).
--
-- CE QU'ELLE N'APPREND À PERSONNE
-- Le lien va de la liste vers l'inscription (`enrollment_id`, nullable,
-- `on delete set null`). Aucune clé étrangère dans l'autre sens : le moteur, le
-- régulateur et les tableaux ne voient strictement aucune différence. C'est ce
-- qui rend cette couche livrable seule, sans rien casser.
--
-- ON NE STOCKE AUCUN STATUT DÉRIVABLE. `statut` dit où en est la LISTE
-- (à lancer / inscrit / écarté / terminé), pas où en est le prospect. Les seize
-- statuts de lead de lemlist se dérivent de `sequence_enrollments`,
-- `email_events`, `prospection_tasks` et `sales_pipeline_state` — une colonne
-- de plus divergerait au premier UPDATE manqué, comme `pipeline_events`
-- (abandonnée après 18 écritures).
--
-- Appliquée en production le 19/08/2026. Idempotente.

begin;

create table if not exists public.campagne_leads (
  id            bigserial primary key,
  automation_id uuid   not null references public.automations(id) on delete cascade,
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,
  contact_id    uuid   references public.contacts(id) on delete set null,
  enrollment_id uuid   references public.sequence_enrollments(id) on delete set null,

  origine       text not null
    check (origine in ('segment', 'lot', 'explorateur', 'manuel', 'reprise')),
  origine_ref   text,

  statut        text not null default 'a_lancer'
    check (statut in ('a_lancer', 'inscrit', 'ecarte', 'termine')),
  motif_ecart   text
    check (motif_ecart is null or motif_ecart in (
      'sans_canal',          -- aucun moyen de le joindre : enrichir avant
      'public_non_atteint',  -- a des canaux, pas ceux que la séquence exige
      'desabonne',           -- suppression e-mail ou numéro blacklisté
      'deja_inscrit',        -- une inscription vivante ailleurs
      'a_deja_reagi',        -- a répondu, pris RDV, ou dit non
      'sans_affaire',        -- aucune opportunité : invisible de tous les tableaux
      'archive',             -- fiche archivée depuis l'ajout
      'manuel'               -- écarté à la main, à la revue
    )),

  ajoute_le     timestamptz not null default now(),
  ajoute_par    uuid,
  updated_at    timestamptz not null default now(),

  -- Un lead ne figure qu'une fois dans une campagne. C'est cette contrainte
  -- qui rend le rafraîchissement d'un segment sûr : un `insert ... on conflict
  -- do nothing` du delta ne peut pas créer de doublon.
  constraint campagne_leads_unique unique (automation_id, entreprise_id),

  -- Un écart sans motif est un écart qu'on ne saura pas expliquer dans trois
  -- semaines ; un motif sans écart est un motif qui ment. Même règle que
  -- `entreprises.archive_reason`.
  constraint campagne_leads_motif_coherent
    check ((statut = 'ecarte') = (motif_ecart is not null))
);

comment on table public.campagne_leads is
  'La liste de leads d''une campagne. La CAMPAGNE est l''automation (kind=''sequence'') : cette table n''ajoute que le « à qui ». Le lien vers l''inscription est nullable et à sens unique — le moteur ne connaît pas cette table.';

comment on column public.campagne_leads.origine is
  'D''où vient ce lead : segment (requête nommée, dynamique), lot (photo figée), explorateur (sélection à la main), manuel (ajouté un par un), reprise (rattaché à posteriori depuis l''existant).';

comment on column public.campagne_leads.origine_ref is
  'L''identifiant du segment ou du lot d''origine. Une TRACE, pas une dépendance : le lead reste dans la campagne même si le segment change ou disparaît.';

comment on column public.campagne_leads.statut is
  'Où en est la LISTE, pas le prospect : a_lancer (en attente de revue) | inscrit (parti en séquence) | ecarte (ne partira pas, voir motif_ecart) | termine. Les seize statuts de lead se DÉRIVENT ailleurs et ne sont jamais stockés ici.';

comment on column public.campagne_leads.enrollment_id is
  'L''inscription née de ce lead, si elle existe. `on delete set null` : supprimer une inscription ne doit pas effacer la trace qu''on avait ciblé ce prospect — c''est ce qui garde le dénominateur de la campagne stable.';

-- Le tableau de la campagne trie et compte par statut : c'est la lecture de
-- loin la plus fréquente.
create index if not exists campagne_leads_campagne_idx
  on public.campagne_leads (automation_id, statut);

-- « Dans quelles campagnes ce prospect figure-t-il ? » — la question que pose
-- la fiche d'une entreprise, et celle qui empêche de le démarcher deux fois.
create index if not exists campagne_leads_entreprise_idx
  on public.campagne_leads (entreprise_id);

-- Le chemin inverse : d'une inscription vers sa ligne de liste.
create index if not exists campagne_leads_enrollment_idx
  on public.campagne_leads (enrollment_id)
  where enrollment_id is not null;

-- `updated_at` par le déclencheur maison déjà utilisé par `automations`,
-- `sequence_enrollments` et `prospection_tasks` — pas une quatrième fonction.
drop trigger if exists campagne_leads_touch on public.campagne_leads;
create trigger campagne_leads_touch
  before update on public.campagne_leads
  for each row execute function public.tg_au_updated_at();

-- RLS active SANS policy : seule la clé de service lit et écrit, comme
-- `segments_entreprises`, `prospection_tasks` et `opportunite_etapes_journal`.
-- Le cloisonnement par agent se fait dans les routes, sur `entreprises.owner_id`.
alter table public.campagne_leads enable row level security;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.campagne_leads;                                   -- 0 au départ
-- select relrowsecurity from pg_class where oid = 'public.campagne_leads'::regclass;  -- t
-- select tgname from pg_trigger where tgrelid = 'public.campagne_leads'::regclass and not tgisinternal;
--   -- campagne_leads_touch
--
-- La cohérence écart/motif se vérifie par sonde, dans une transaction annulée :
--   begin;
--     insert into public.campagne_leads (automation_id, entreprise_id, origine, statut)
--     values ('0e7a1f20-0000-4000-8000-000000000001', 1, 'manuel', 'ecarte');  -- doit ÉCHOUER
--   rollback;
