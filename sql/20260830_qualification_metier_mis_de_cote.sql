-- Un métier mis de côté ne peut pas être qualifié — et ce qui l'était cesse de l'être.
--
-- LE BESOIN, MOT POUR MOT : « les entreprises avec isolation tu peux les
-- déqualifier et supprimer l'opportunité, et interdire leur qualification tant
-- qu'on a pas décoché dans les paramètres. Et que si on enrichit une entreprise
-- et qu'on trouve ce service, on supprime l'opportunité et on enlève qualified
-- true. Comme ça on est certains de travailler avec des qualifiés propres une
-- fois qu'on rentre en séquence. »
--
-- ── POURQUOI DES TRIGGERS ET PAS DES ROUTES ────────────────────────────────
-- `qualifie` est écrit par au moins trois chemins : la file de qualification,
-- `assignProspectToAgent` (attribuer QUALIFIE, invariant du 17/08) et les
-- écritures de masse. `service_tags`, lui, est écrit par l'EDGE FUNCTION, dont
-- le code ne vit même pas dans ce dépôt. Une garde posée dans les routes aurait
-- donc un trou par construction, et c'est précisément le trou qui compte : le
-- cas « on enrichit, on découvre isolation ». La règle vit donc en base, où
-- aucun appelant ne peut la contourner.
--
-- ── ON ARCHIVE, ON NE SUPPRIME PAS ─────────────────────────────────────────
-- La demande dit « supprimer l'opportunité ». L'effet demandé — elle quitte
-- tous les pipelines — est obtenu par `archived_at`, et le `delete` coûterait
-- deux choses qu'on ne peut pas rendre :
--   · L'INTERRUPTEUR DEVIENDRAIT MENTEUR. Tout ce dispositif promet qu'un métier
--     rouvert ramène ses fiches. Une opportunité supprimée ne revient pas, et en
--     recréer une rejouerait `opportunity_created` et ses automatisations.
--   · LA PREUVE DISPARAÎTRAIT. `unassignProspectFromAgent` a déjà tranché ce
--     débat : « le `delete` d'origine effaçait la preuve — une tâche supprimée
--     n'a jamais existé, donc plus personne ne peut dire qu'une approche avait
--     été prévue ni pourquoi elle n'a pas eu lieu. »
-- Mesuré avant d'écrire : les 101 opportunités concernées sont toutes en amont
-- (73 « Nouveau lead », 26 « Qualifié », 2 « Approche »), aucune au rendez-vous
-- ni au gagné, et 2 seulement ont reçu un message.
--
-- ── LE TRIGGER COERCE, IL NE LÈVE PAS ──────────────────────────────────────
-- `qualifie := false` plutôt qu'un `raise exception`. Une exception ferait
-- échouer TOUT lot contenant une seule fiche isolation — un enrichissement de
-- 500, une attribution de 50 — et le message se perdrait dans un rollback. La
-- coercition rend l'invariant vrai quoi qu'il arrive ; c'est la file de
-- qualification qui DIT à l'humain pourquoi son clic n'a rien donné, parce que
-- c'est le seul endroit où quelqu'un attend une réponse.
--
-- Contrôles à relire après application :
--   select count(*) from entreprises e
--    where e.qualifie and porte_metier_mis_de_cote(e.service_tags);
--   -- doit valoir 0, définitivement : c'est l'invariant que les triggers tiennent.
--   select count(*) from opportunites o join entreprises e on e.id = o.entreprise_id
--    where o.archived_at is null and porte_metier_mis_de_cote(e.service_tags);
--   -- doit valoir 0 également.
--   select count(*) from metiers_mis_de_cote_journal;
--   -- ce qui a été retiré, et de quoi tout rendre.
--
-- Mesuré le 30/08/2026, juste après application : 101 fiches journalisées, 101
-- affaires archivées, 101 déqualifiées — et les deux invariants à 0. La
-- réversibilité a été vérifiée dans une transaction annulée : rouvrir les dix
-- métiers rend 101 requalifiées, 0 affaire encore archivée, journal entièrement
-- soldé.

/* ── Le prédicat, en un seul endroit ────────────────────────────────────────
 * Recopié nulle part : les triggers, les contrôles et la restauration
 * l'appellent tous. `stable` et non `immutable` — il lit une table de réglages
 * qui change, c'est même tout l'intérêt.
 *
 * `search_path` épinglé sans risque ici : aucun index partiel n'a de prédicat à
 * faire reconnaître par inlining, contrairement à `host_est_generique` et
 * `chercher_entreprises` qu'il ne faut JAMAIS épingler (cf. CLAUDE.md).
 */
create or replace function porte_metier_mis_de_cote(p_tags jsonb)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from jsonb_array_elements_text(
             case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end
           ) as t(tag)
      join enrichment_tag_settings s on s.tag = t.tag
     where s.demarchable = false
  );
$$;

grant execute on function porte_metier_mis_de_cote(jsonb) to authenticated, service_role;

/* ── Le journal : l'archive d'avant l'écriture, ET la source de la restauration
 *
 * « Archiver avant toute écriture de masse » — le trigger `updated_at` détruit
 * la preuve de ce qui était là. Mais ce journal sert deux fois : il dit ce
 * qu'on a retiré, et il est la SEULE façon de savoir quoi rendre le jour du
 * déblocage. Sans lui, rouvrir l'isolation ne saurait pas distinguer une fiche
 * qu'on a déqualifiée d'une fiche qui ne l'a jamais été.
 */
create table if not exists metiers_mis_de_cote_journal (
  id bigserial primary key,
  entreprise_id bigint not null references entreprises(id) on delete cascade,
  /** Les métiers fermés que portait la fiche au moment du retrait. */
  tags text[] not null default '{}',
  /** `qualifie` avant le retrait : c'est lui qu'on rendra, pas un `true` supposé. */
  qualifie_avant boolean,
  /** Les affaires archivées par ce retrait — pour ne désarchiver qu'elles. */
  opportunites uuid[] not null default '{}',
  retire_le timestamptz not null default now(),
  /** Posé au déblocage. Une ligne rendue n'est pas effacée : elle est datée. */
  rendu_le timestamptz
);

create index if not exists metiers_mis_de_cote_journal_ent_idx
  on metiers_mis_de_cote_journal (entreprise_id) where rendu_le is null;

comment on table metiers_mis_de_cote_journal is
  'Ce qu''un métier mis de côté a retiré à une entreprise, et de quoi le lui '
  'rendre. Écrit par trg_metier_mis_de_cote_retire, relu par rouvrir_metier.';

/* ── 1. LA GARDE : on ne qualifie pas un métier mis de côté ─────────────────
 *
 * BEFORE, donc rien n'est jamais écrit. La clause WHEN limite le coût à ce qui
 * compte : une fiche qui n'est pas (ou plus) marquée qualifiée ne déclenche
 * rien, et les 60 000 mises à jour de routine ne paient pas la lecture des
 * réglages.
 */
create or replace function trg_refuse_qualification_metier_mis_de_cote()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if porte_metier_mis_de_cote(new.service_tags) then
    new.qualifie := false;
  end if;
  return new;
end;
$$;

drop trigger if exists entreprises_refuse_qualification_metier on entreprises;
create trigger entreprises_refuse_qualification_metier
  before insert or update on entreprises
  for each row
  when (new.qualifie is true)
  execute function trg_refuse_qualification_metier_mis_de_cote();

/* ── 2. LE RETRAIT : l'affaire est archivée, et le geste est journalisé ─────
 *
 * AFTER, parce qu'il touche une AUTRE table. Il se déclenche à la création et
 * à tout changement de `service_tags` — c'est-à-dire exactement au moment où
 * l'enrichissement découvre le métier, le cas qu'aucune route ne pouvait
 * couvrir.
 *
 * IDEMPOTENT : `archived_at is null` dans le WHERE, et rien à journaliser quand
 * rien n'a été archivé. Une fiche enrichie trois fois ne produit pas trois
 * lignes de journal.
 */
create or replace function trg_metier_mis_de_cote_retire()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_opps uuid[];
  v_tags text[];
begin
  if not porte_metier_mis_de_cote(new.service_tags) then
    return null;
  end if;

  update opportunites
     set archived_at = now(),
         archive_reason = 'metier_mis_de_cote',
         archive_note = 'Métier mis de côté dans les Paramètres : le gabarit n''a pas de page pour ce service.'
   where entreprise_id = new.id
     and archived_at is null;

  -- Relu APRÈS l'archivage plutôt que par `returning into` : celui-ci n'affecte
  -- qu'une seule ligne, et une entreprise peut porter deux affaires.
  select array_agg(o.id) into v_opps
    from opportunites o
   where o.entreprise_id = new.id
     and o.archive_reason = 'metier_mis_de_cote'
     and o.archived_at is not null;

  select array_agg(t.tag) into v_tags
    from jsonb_array_elements_text(
           case when jsonb_typeof(new.service_tags) = 'array' then new.service_tags else '[]'::jsonb end
         ) as t(tag)
    join enrichment_tag_settings s on s.tag = t.tag
   where s.demarchable = false;

  -- Une seule ligne ouverte par entreprise : le journal dit un ÉTAT à rendre,
  -- pas une suite d'événements.
  if not exists (
    select 1 from metiers_mis_de_cote_journal j
     where j.entreprise_id = new.id and j.rendu_le is null
  ) then
    -- `old` n'existe pas sur INSERT : y toucher lèverait. Sur une création, la
    -- valeur d'avant EST celle qu'on vient de refuser — la garde BEFORE a déjà
    -- ramené `new.qualifie` à false, donc on lit l'intention, pas le résultat.
    insert into metiers_mis_de_cote_journal (entreprise_id, tags, qualifie_avant, opportunites)
    values (
      new.id,
      coalesce(v_tags, '{}'),
      case when tg_op = 'UPDATE' then old.qualifie else null end,
      coalesce(v_opps, '{}')
    );
  end if;

  return null;
end;
$$;

drop trigger if exists entreprises_metier_mis_de_cote_retire on entreprises;
create trigger entreprises_metier_mis_de_cote_retire
  after insert or update of service_tags on entreprises
  for each row
  execute function trg_metier_mis_de_cote_retire();

/* ── 3. LA BRETELLE : une affaire NEUVE ne peut pas naître non plus ────────
 *
 * Le trigger 2 ne se déclenche qu'au changement de `service_tags` : il ne voit
 * donc rien quand une affaire est créée APRÈS coup sur une fiche déjà mise de
 * côté. Le chemin existe — `assignProspectToAgent` crée l'affaire de toute
 * entreprise qui n'en a aucune, et il pose `qualifie` dans la foulée. Le pool
 * ne sert que des fiches qualifiées, donc le cas est étroit ; mais un invariant
 * qui tient « sauf par une porte » n'est pas un invariant.
 *
 * ON ARCHIVE PLUTÔT QUE DE REFUSER L'INSERTION : lever ici ferait échouer toute
 * une attribution en lot pour une fiche, et `assignProspectsToAgent` perdrait
 * les quarante-neuf autres. L'affaire naît puis s'archive dans la même
 * transaction — invisible partout, et journalisée par son motif.
 */
create or replace function trg_opportunite_metier_mis_de_cote()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tags jsonb;
begin
  select e.service_tags into v_tags from entreprises e where e.id = new.entreprise_id;
  if v_tags is not null and porte_metier_mis_de_cote(v_tags) then
    update opportunites
       set archived_at = now(),
           archive_reason = 'metier_mis_de_cote',
           archive_note = 'Métier mis de côté dans les Paramètres : le gabarit n''a pas de page pour ce service.'
     where id = new.id and archived_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists opportunites_metier_mis_de_cote on opportunites;
create trigger opportunites_metier_mis_de_cote
  after insert on opportunites
  for each row
  when (new.entreprise_id is not null and new.archived_at is null)
  execute function trg_opportunite_metier_mis_de_cote();

/* ── 4. LE DÉBLOCAGE : rouvrir un métier rend ce qu'il avait pris ───────────
 *
 * C'est la moitié qui manquait au dispositif. Sans elle, « décocher dans les
 * Paramètres » lèverait l'interdiction pour l'avenir et laisserait 28 364
 * fiches déqualifiées derrière — l'interrupteur ne serait réversible qu'en
 * apparence.
 *
 * ON NE REND QUE CE QU'ON A PRIS : `qualifie_avant` (et non `true`), et les
 * seules affaires que ce retrait a archivées. Une fiche qui n'était pas
 * qualifiée avant ne le devient pas parce qu'on rouvre son métier.
 *
 * ON NE REND RIEN TANT QU'UN AUTRE MÉTIER FERMÉ SUBSISTE : une fiche isolation
 * + menuiserie ne revient qu'à la réouverture des deux.
 */
create or replace function rouvrir_metier(p_tag text)
returns table (entreprises_rendues bigint, opportunites_desarchivees bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_ents bigint := 0;
  v_opps bigint := 0;
begin
  update enrichment_tag_settings set demarchable = true, updated_at = now() where tag = p_tag;

  -- PAS DE TABLE TEMPORAIRE ICI, et c'est un test qui l'a imposé : `on commit
  -- drop` ne libère qu'au COMMIT, donc rouvrir « isolation » puis « menuiserie »
  -- d'un même geste échouait sur « relation _a_rendre already exists ». Les CTE
  -- modifiantes voient toutes le même instantané — exactement ce qu'on veut,
  -- les trois écritures portant sur la même population.
  with a_rendre as (
    select j.id, j.entreprise_id, j.qualifie_avant, j.opportunites
      from metiers_mis_de_cote_journal j
      join entreprises e on e.id = j.entreprise_id
     where j.rendu_le is null
       and not porte_metier_mis_de_cote(e.service_tags)
  ),
  opps as (
    update opportunites o
       set archived_at = null, archive_reason = null, archive_note = null
      from a_rendre r
     where o.id = any (r.opportunites)
       and o.archive_reason = 'metier_mis_de_cote'
    returning 1
  ),
  ents as (
    update entreprises e
       set qualifie = r.qualifie_avant
      from a_rendre r
     where e.id = r.entreprise_id and r.qualifie_avant is true
    returning 1
  ),
  clos as (
    update metiers_mis_de_cote_journal j
       set rendu_le = now()
      from a_rendre r
     where j.id = r.id
    returning 1
  )
  select (select count(*) from ents), (select count(*) from opps) into v_ents, v_opps;

  return query select v_ents, v_opps;
end;
$$;

grant execute on function rouvrir_metier(text) to service_role;
