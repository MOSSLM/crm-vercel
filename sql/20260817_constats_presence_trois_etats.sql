-- « Absent » et « inconnu » cessent d'être le même NULL.
--
-- LA QUESTION, posée par le propriétaire le 17/08 :
--   « Comment tu fais pour confirmer que l'on a vérifié et qu'elles n'ont aucun
--     site, ces entreprises-là ? Est-ce qu'on a un moyen d'approuver quand les
--     choses sont NULL ? Est-ce qu'on écrit NULL ? Est-ce qu'on ajoute une
--     colonne pour dire ça ? »
--
-- Elle n'avait pas de réponse. `entreprises.canonical_url is null` dit à la fois
-- « elle n'a pas de site » et « on n'a jamais regardé », avec le même silence.
-- C'est aussi ce que la vision du CRM réclamait depuis le début : un statut à
-- trois états, avec sa source, sa date et sa preuve.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE TABLE ET NON UNE COLONNE
-- ─────────────────────────────────────────────────────────────────────────────
-- Une colonne `site_statut` aurait exigé quatre colonnes voisines — source,
-- date, confiance, preuve — et se serait fait écraser à chaque repasse. Or c'est
-- justement l'historique qui répond à « depuis quand ? » et « sur quelle
-- preuve ? ». La table est donc APPEND-ONLY : on n'efface pas un constat, on en
-- pose un plus récent. `v_presence_actuelle` rend le dernier.
--
-- Le même mécanisme servira aux autres sujets (fiche Google, avis, téléphone,
-- e-mail) : d'où `sujet`, plutôt qu'une table par question.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE CHAQUE ÉTAT SIGNIFIE — ET LE PIÈGE QU'IL ÉVITE
-- ─────────────────────────────────────────────────────────────────────────────
--   present  une URL existe : trouvée par le bot, ou déjà en base.
--
--   absent   CHERCHÉ ET NON TROUVÉ. Deux conditions cumulées : la fiche Google
--            existe et ne déclare aucun site, ET une recherche web a bien eu
--            lieu sans rendre autre chose que des annuaires.
--
--   inconnu  tout le reste — et il n'y a pas de honte à l'écrire.
--
-- LE PIÈGE, mesuré : avant la recherche web, la cohorte B comptait 83 fiches
-- « sans site ». ZÉRO était une absence confirmée. 59 d'entre elles n'avaient
-- jamais été cherchées, parce qu'un CAPTCHA avait coupé la passe web. Les
-- compter « absentes » aurait fabriqué un mensonge de plus, écrit celui-là dans
-- une colonne, et personne n'aurait pu le voir.
--
-- DEUXIÈME PIÈGE, trouvé en écrivant : une recherche INFRUCTUEUSE est une
-- information. Le script ne reportait d'une passe à l'autre que les recherches
-- ayant TROUVÉ quelque chose ; une repasse a donc effacé le fait qu'on avait
-- fouillé le web pour 47 fiches, et les absences confirmées sont redevenues des
-- « inconnu ». Le champ `web` de l'index porte désormais le fait de la
-- recherche, fructueuse ou non.
--
-- TROISIÈME PIÈGE : un constat « absent » posé sur une fiche dont le CRM détient
-- déjà une URL contredit sa propre table. Une URL en base fait foi.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAT DE LA COHORTE B APRÈS APPLICATION (17/08)
-- ─────────────────────────────────────────────────────────────────────────────
--   présent .... 242   dont 66 URL écrites ce jour, après relecture humaine
--   absent .....   7   cherché, fiche Google muette, rien trouvé
--   inconnu ....  48   jamais cherché — Google a coupé la passe web
--   ─────────────────
--   total ...... 297
--
-- Les 48 « inconnu » sont le reste à faire, et le modèle le dit tout seul :
--   select entreprise_id from public.v_entreprises_presence_site
--    where cohorte_demarchage = 'B_sans_site' and statut_site = 'inconnu';

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉCRITURES DÉJÀ APPLIQUÉES le 17/08 via execute_sql. Consigné pour la trace.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.constats_presence (
  id bigserial primary key,
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,
  sujet text not null check (sujet in ('site_web','fiche_google','avis','telephone','email')),
  etat text not null check (etat in ('present','absent','inconnu')),
  valeur text,
  confiance text not null default 'moyenne' check (confiance in ('certaine','haute','moyenne','faible')),
  source text not null,
  preuve jsonb not null default '{}'::jsonb,
  constate_le timestamptz not null default now(),
  constate_par text not null default 'systeme',
  -- Un constat « présent » sans sa valeur ne prouve rien ; un « absent » avec
  -- une valeur se contredit lui-même.
  constraint constat_coherent check (
    (etat = 'present' and valeur is not null and length(btrim(valeur)) > 0)
    or (etat <> 'present' and valeur is null)
  )
);

create index if not exists constats_presence_entreprise_sujet_idx
  on public.constats_presence (entreprise_id, sujet, constate_le desc);
create index if not exists constats_presence_sujet_etat_idx
  on public.constats_presence (sujet, etat);

-- Le constat COURANT : le dernier posé, par entreprise et par sujet.
create or replace view public.v_presence_actuelle as
select distinct on (entreprise_id, sujet)
       entreprise_id, sujet, etat, valeur, confiance, source, preuve, constate_le, constate_par
  from public.constats_presence
 order by entreprise_id, sujet, constate_le desc, id desc;

-- Ce que les écrans doivent lire : l'état du site, constat compris.
create or replace view public.v_entreprises_presence_site as
select e.id as entreprise_id, e.name, e.ville, e.cohorte_demarchage,
       coalesce(nullif(btrim(e.site_web_canonique), ''), nullif(btrim(e.canonical_url), '')) as url_crm,
       c.etat, c.valeur as url_constatee, c.confiance, c.source, c.constate_le,
       case
         when coalesce(nullif(btrim(e.site_web_canonique), ''), nullif(btrim(e.canonical_url), '')) is not null
           then 'present'
         when c.etat is not null then c.etat
         else 'inconnu'
       end as statut_site
  from public.entreprises e
  left join public.v_presence_actuelle c
    on c.entreprise_id = e.id and c.sujet = 'site_web'
 where e.archived_at is null;

grant select on public.v_presence_actuelle, public.v_entreprises_presence_site to service_role, authenticated;
grant select, insert on public.constats_presence to service_role;
grant usage, select on sequence public.constats_presence_id_seq to service_role;

alter table public.constats_presence enable row level security;
create policy constats_presence_lecture_staff on public.constats_presence
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles
-- ─────────────────────────────────────────────────────────────────────────────
-- select statut_site, count(*) from public.v_entreprises_presence_site
--  where cohorte_demarchage = 'B_sans_site' group by 1;   -- 242 / 48 / 7
--
-- Rien à défaire : la table est append-only et n'a écrasé aucune colonne
-- existante. Pour repartir de zéro : truncate public.constats_presence.
