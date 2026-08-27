-- Le fil d'activité — une seule fenêtre sur ce qui s'est passé avec une boîte.
--
-- CE QUI MANQUAIT, ET POURQUOI ÇA NE SE VOYAIT PAS
-- Rien ne manquait aux données : neuf tables enregistrent déjà consciencieusement
-- ce qu'on fait d'une entreprise. Ce qui manquait, c'est de pouvoir les LIRE
-- ensemble. `CompanyDetailPage` fait 1265 lignes et n'a aucun historique ; pour
-- répondre à « qu'est-ce qui s'est passé avec eux ? » il faut ouvrir quatre
-- écrans et recomposer l'ordre de tête. Le schéma d'architecture le savait —
-- `diagrams.ts` annonce une brique « Historique et prochaine action » — elle
-- n'avait simplement jamais été construite.
--
-- ── POURQUOI UNE VUE, ET PAS UNE TABLE `evenements` ──────────────────────
-- Une table d'événements imposerait d'écrire DEUX FOIS à chaque geste : dans la
-- table métier et dans le fil. Le jour où un appelant oublie la seconde écriture
-- — et il oubliera, il y a neuf appelants — le fil ment par omission, ce qui est
-- pire que pas de fil du tout : on croit avoir tout vu.
--
-- La vue, elle, ne peut pas mentir. Elle lit les tables métier là où elles sont
-- déjà écrites ; une source qui reçoit une ligne apparaît dans le fil sans que
-- personne n'ait rien à brancher. C'est le même raisonnement que celui déjà tenu
-- deux fois pour refuser une table `messages` séparée (`20260815_notes_de_
-- demarchage.sql`, puis `20260820_conversation.sql`) : « une table séparée aurait
-- obligé chacun de ces écrans à fusionner deux sources dans le bon ordre — trois
-- occasions de diverger ».
--
-- Le coût est une lecture par source. Il est tenable parce que le fil se lit
-- TOUJOURS pour une entreprise à la fois : chaque branche de l'UNION reçoit le
-- prédicat `entreprise_id = ?` et le sert par index. Les trois index manquants
-- sont posés plus bas. Un fil « toutes entreprises » n'est pas prévu et ne doit
-- pas l'être — ce serait un tri de 60 726 boîtes.
--
-- ── `security_invoker` N'EST PAS UN DÉTAIL ───────────────────────────────
-- Par défaut une vue s'exécute avec les droits de SON PROPRIÉTAIRE, donc
-- contourne les RLS des tables sous-jacentes. Ici ça ne changerait rien
-- aujourd'hui (les politiques du projet ouvrent tout à `authenticated`), mais ça
-- fabriquerait une porte dérobée qui survivrait au jour où ces politiques seront
-- resserrées — et personne ne penserait à la fermer. La vue est donc en
-- `security_invoker`, ce qui la fait obéir aux règles de celui qui lit.
--
-- ── CE QUI EST VOLONTAIREMENT ABSENT ─────────────────────────────────────
-- Les gestes annulés (`prospection_gestes.annule_le`) ne sont pas dans le fil.
-- Le geste annulé n'a pas eu lieu ; le montrer ferait compter deux fois une
-- action reprise. `20260823_annuler_un_geste.sql` a posé cette colonne pour
-- qu'on puisse défaire, pas pour qu'on garde une trace visible.
begin;

-- ─────────────────────────────────────────────────────────────────────────
-- Les trois index qui manquaient pour lire par entreprise.
-- `email_logs` a déjà le sien (`email_logs_fil_idx`), les autres non : leurs
-- index existants portent sur `opportunite_id` ou sur la date seule, ce qui
-- ferait un parcours complet dès qu'on demande une boîte.
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists activity_log_entreprise_idx
  on public.activity_log (entreprise_id, occurred_at desc)
  where entreprise_id is not null;

create index if not exists pipeline_events_entreprise_idx
  on public.pipeline_events (entreprise_id, event_at desc)
  where entreprise_id is not null;

create index if not exists prospection_gestes_entreprise_idx
  on public.prospection_gestes (entreprise_id, fait_le desc)
  where entreprise_id is not null and annule_le is null;

-- ─────────────────────────────────────────────────────────────────────────
-- Et les quatre index D'EXPRESSION, qui ne sont pas une coquetterie.
--
-- Quatre tables portent `entreprise_id` en `integer` quand `entreprises.id` est
-- `bigint`. La vue doit unifier le type pour que l'UNION tienne, donc elle
-- caste — et un cast rend le filtre non-sargable : `(entreprise_id)::bigint = ?`
-- ne sait pas lire un index posé sur la colonne `integer` brute. Vérifié au
-- EXPLAIN : les quatre branches tombaient en Seq Scan, y compris `email_logs`
-- qui a pourtant déjà son `email_logs_fil_idx`.
--
-- Invisible sur 227 e-mails. Ça ne le restera pas : c'est le canal principal.
--
-- On indexe donc l'expression EXACTEMENT telle que la vue la produit. Élargir
-- les colonnes en `bigint` serait plus propre, mais réécrirait les tables —
-- dont `form_submissions`, alimentée par les sites publiés des clients. On ne
-- touche pas à ce chemin pour un gain de planification.
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists email_logs_fil_bigint_idx
  on public.email_logs (((entreprise_id)::bigint), sent_at desc)
  where entreprise_id is not null;

create index if not exists calls_fil_bigint_idx
  on public.calls (((entreprise_id)::bigint), started_at desc)
  where entreprise_id is not null;

create index if not exists sms_threads_fil_bigint_idx
  on public.sms_threads (((entreprise_id)::bigint))
  where entreprise_id is not null;

create index if not exists form_submissions_fil_bigint_idx
  on public.form_submissions (((enterprise_id)::bigint), created_at desc)
  where enterprise_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- La vue.
--
-- `canal` est normalisé sur un vocabulaire fermé (appel, email, sms, whatsapp,
-- rdv, note, etape, formulaire, systeme) pour que l'écran filtre sur UNE valeur
-- et non sur neuf orthographes. `source` garde le nom de la table d'origine :
-- c'est ce qui permet de remonter à la ligne quand un fil paraît faux.
--
-- `ref` porte l'identifiant d'origine en texte. Les sources ont des clés de
-- types différents (bigint, uuid) ; le fil n'a pas besoin de les distinguer, il
-- a besoin d'une clé React stable et d'un moyen de retrouver la ligne.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.vue_fil_activite
with (security_invoker = true) as

-- 1. Le journal d'activité maison — le seul qui soit déjà « du fil » par nature.
select
  a.entreprise_id::bigint            as entreprise_id,
  a.opportunite_id                   as opportunite_id,
  a.occurred_at                      as survenu_le,
  'activity_log'                     as source,
  -- LE CANAL RÉEL VIT DANS `metadata`, PAS DANS `activity_type`.
  -- `activity_type` est un enum de NATURE d'événement (appel, devis, signature,
  -- encaissement, note…) : il répond à « qu'est-ce qui s'est passé », pas à
  -- « par quel moyen ». Le moyen est écrit à côté depuis toujours, par
  -- `enregistrerJournal` (`api/make-server-5c06d9e7`), sur le vocabulaire
  -- `contact_channel` — qui, lui, connaît WhatsApp et LinkedIn.
  --
  -- Sans cette lecture, un WhatsApp envoyé depuis une fiche s'afficherait en
  -- « note » : le canal le plus utilisé du démarchage deviendrait invisible
  -- alors qu'il est enregistré.
  --
  -- `pas_defini` et `autre` ne comptent pas comme un canal — ce sont les
  -- valeurs par défaut (33 des 104 lignes existantes). Les accepter effacerait
  -- la nature de l'événement au profit d'un « non renseigné ».
  coalesce(
    case a.metadata->>'channel'
      when 'telephone' then 'appel'
      when 'email'     then 'email'
      when 'sms'       then 'sms'
      when 'whatsapp'  then 'whatsapp'
      when 'linkedin'  then 'linkedin'
      else null
    end,
    case a.activity_type::text
      when 'appel' then 'appel'
      when 'email' then 'email'
      when 'sms'   then 'sms'
      when 'rdv'   then 'rdv'
      when 'note'  then 'note'
      else 'systeme'
    end
  )                                  as canal,
  null::text                         as sens,
  coalesce(nullif(a.title, ''), a.activity_type::text) as titre,
  left(a.description, 500)           as detail,
  a.owner_id                         as acteur_id,
  a.id::text                         as ref
from public.activity_log a
where a.entreprise_id is not null

union all

-- 2. Les changements d'étape. La table porte les numéros, pas les noms : sans
--    la double jointure sur `etapes_pipeline`, le fil dirait « 3 → 4 ».
select
  j.entreprise_id::bigint,
  j.opportunite_id,
  j.survenu_le,
  'opportunite_etapes_journal',
  'etape',
  null::text,
  'Étape : ' || coalesce(av.nom, '—') || ' → ' || coalesce(ap.nom, '—'),
  null::text,
  j.owner_id,
  j.id::text
from public.opportunite_etapes_journal j
left join public.etapes_pipeline av on av.id = j.stage_avant
left join public.etapes_pipeline ap on ap.id = j.stage_apres
where j.entreprise_id is not null

union all

-- 3. Les événements de pipeline (montants franchis). Recouvre en partie le
--    journal d'étapes, mais porte le montant — c'est ce qui en fait autre chose.
select
  e.entreprise_id::bigint,
  e.opportunite_id,
  e.event_at,
  'pipeline_events',
  'etape',
  null::text,
  'Pipeline : ' || coalesce(e.stage::text, '—')
    || case when e.amount is not null then ' (' || round(e.amount)::text || ' €)' else '' end,
  null::text,
  e.owner_id,
  e.id::text
from public.pipeline_events e
where e.entreprise_id is not null

union all

-- 4. Les e-mails ET les notes de démarchage : `email_logs.channel = 'note'` sert
--    de note depuis `20260815_notes_de_demarchage.sql`. Les séparer ici
--    recréerait exactement la fusion à deux sources que ce choix évitait.
select
  m.entreprise_id::bigint,
  m.opportunite_id,
  coalesce(m.recu_le, m.sent_at, m.created_at),
  'email_logs',
  case when m.channel = 'note' then 'note' else coalesce(nullif(m.channel, ''), 'email') end,
  case when m.direction = 'entrant' then 'entrant' else 'sortant' end,
  coalesce(nullif(m.subject, ''), case when m.channel = 'note' then 'Note' else '(sans objet)' end),
  left(coalesce(nullif(m.body_text, ''), ''), 500),
  m.auteur_id,
  m.id::text
from public.email_logs m
where m.entreprise_id is not null

union all

-- 5. Les appels. `duration_sec` à 0 sur un appel décroché est un raccroché
--    immédiat, pas une donnée manquante : on l'affiche tel quel.
select
  c.entreprise_id::bigint,
  c.opportunite_id,
  coalesce(c.started_at, c.created_at),
  'calls',
  'appel',
  case when c.direction = 'inbound' then 'entrant' else 'sortant' end,
  'Appel ' || case when c.direction = 'inbound' then 'reçu' else 'passé' end
    || case when c.disposition is not null then ' — ' || c.disposition else '' end,
  case when c.duration_sec is not null then c.duration_sec::text || ' s' else null end,
  c.agent_id,
  c.id::text
from public.calls c
where c.entreprise_id is not null

union all

-- 6. Les SMS. Seul le fil de discussion porte l'entreprise, pas le message.
select
  t.entreprise_id::bigint,
  null::uuid,
  coalesce(s.sent_at, s.created_at),
  'sms_messages',
  'sms',
  case when s.direction = 'inbound' then 'entrant' else 'sortant' end,
  'SMS ' || case when s.direction = 'inbound' then 'reçu' else 'envoyé' end,
  left(s.body, 500),
  s.agent_id,
  s.id::text
from public.sms_messages s
join public.sms_threads t on t.id = s.thread_id
where t.entreprise_id is not null

union all

-- 7. Les gestes de prospection. Les annulés sont exclus : un geste défait n'a
--    pas eu lieu (cf. l'en-tête).
select
  g.entreprise_id::bigint,
  g.opportunite_id,
  g.fait_le,
  'prospection_gestes',
  case
    when g.geste ilike '%whatsapp%' then 'whatsapp'
    when g.geste ilike '%sms%'      then 'sms'
    when g.geste ilike '%appel%'    then 'appel'
    when g.geste ilike '%mail%'     then 'email'
    else 'systeme'
  end,
  'sortant',
  g.geste,
  null::text,
  g.fait_par,
  g.id::text
from public.prospection_gestes g
where g.entreprise_id is not null
  and g.annule_le is null

union all

-- 8. Les comptes-rendus de rendez-vous. `prochaine_etape` est recopiée dans le
--    détail : c'est le seul endroit où une décision de suite est écrite en clair.
select
  r.entreprise_id::bigint,
  r.opportunite_id,
  coalesce(r.demarre_le, r.created_at),
  'rdv_comptes_rendus',
  'rdv',
  null::text,
  coalesce(nullif(r.titre, ''), 'Compte-rendu de rendez-vous')
    || case when r.issue is not null then ' — ' || r.issue else '' end,
  left(
    coalesce(nullif(r.resume, ''), '')
      || case when nullif(r.prochaine_etape, '') is not null
              then ' · Suite : ' || r.prochaine_etape else '' end,
    500),
  r.auteur_id,
  r.id::text
from public.rdv_comptes_rendus r
where r.entreprise_id is not null

union all

-- 9. Les formulaires reçus depuis les sites publiés. C'est la seule source où
--    l'entreprise est le DESTINATAIRE et non la cible : un prospect de notre
--    client. Elle appartient au fil quand même — c'est ce qui prouve que le site
--    qu'on lui a vendu rapporte.
select
  f.enterprise_id::bigint,
  null::uuid,
  f.created_at,
  'form_submissions',
  'formulaire',
  'entrant',
  'Formulaire reçu depuis le site',
  left(f.contact::text, 500),
  null::uuid,
  f.id::text
from public.form_submissions f
where f.enterprise_id is not null;

comment on view public.vue_fil_activite is
  'Fil d''activité unifié d''une entreprise. À interroger TOUJOURS avec un filtre entreprise_id : sans lui, chaque branche parcourt sa table entière.';

grant select on public.vue_fil_activite to authenticated;

commit;
