-- Sélection des deux cohortes de la campagne — APPLIQUÉ EN PRODUCTION LE 16/08/2026.
-- Ce fichier décrit ce qui A ÉTÉ FAIT, et comment le défaire.
--
-- RÉSULTAT
--   A_site_faible  300 fiches — notes mesurées de 37 à 71, 300 téléphones, 138 emails
--   B_sans_site    300 fiches — 300 téléphones, 200 emails
--   Les 600 sont attribuées à l'agent 76353de0-ac50-4645-9530-8be2db55c7a3.
--
-- CE QUE LA MESURE A APPRIS, ET QUI A CHANGÉ LA SÉLECTION
--
-- 1. « 448 sites notés ≤ 50 » était un mirage. 431 de ces fiches sont notées
--    EXACTEMENT 0, et un 0 n'est jamais un site faible : 306 sites ne répondent
--    pas, 56 renvoient un 403 au crawler (le site marche, c'est la mesure qui
--    échoue), 67 sont des pages mortes en 4xx/5xx, 215 pointent vers un annuaire
--    ou un constructeur (solocal, webnode, glide, sites.google). DEUX seulement
--    sont de vrais sites méritant un 0.
--    Appeler un des 56 « bloqués » pour lui dire que son site est mauvais serait
--    le pire appel de la semaine. D'où l'exclusion stricte, dans la cohorte A,
--    de `note_globale = 0`, `bloque`, `injoignable` et des hôtes génériques.
--
-- 2. La vraie population mesurée : 51 fiches sous 60, 244 sous 70, 710 sous 80.
--    Une cohorte de 300 impose donc d'aller jusqu'à 80, les pires d'abord.
--
-- 3. Les fiches à site cassé sont de la matière pour B, pas pour A : elles n'ont
--    pas de site utilisable, et portent en plus une accroche factuelle.
--    MAIS elles viennent de Google Maps et n'ont presque jamais d'email — une
--    première composition de B n'en avait que 49 sur 300. Sans email, 100
--    touches par jour ne tiennent pas : il ne reste que le téléphone, plafonné
--    par ce qu'un humain peut faire. B a donc été rééquilibrée : tous les cassés
--    qui ont un email, l'accroche complétée jusqu'à 100 fiches, et le reste pris
--    dans l'ADEME (99 % d'emails). L'accroche reste, le volume revient.
--
-- L'ÉTAT D'AVANT EST CONSERVÉ
-- `archive_cohortes_20260816` porte, pour chacune des 600 : son `owner_id` et son
-- `updated_at` d'avant, sa note et le motif de sa sélection. C'est ce qui rend le
-- retour arrière possible ligne à ligne malgré le trigger `updated_at`, qui
-- détruit sinon la preuve.

-- ── Cohorte A : les 300 pires notes RÉELLEMENT mesurées ──────────────────────
-- (rejoué à l'identique ci-dessous, `on conflict do nothing` le rend idempotent)
/*
with candidats as (
  select e.id, s.note_globale,
         row_number() over (order by s.note_globale asc, e.id) as rang
    from public.entreprises e
    join public.entreprises_audit_site s on s.entreprise_id = e.id
   where e.merged_into_id is null
     and coalesce(e.hidden_in_qualification,false) = false
     and e.telephone is not null
     and s.note_globale > 0 and s.note_globale < 80
     and not coalesce(s.bloque,false)
     and not coalesce(s.injoignable,false)
     and not public.host_est_generique(public.host_key(s.url_analysee))
)
insert into public.archive_cohortes_20260816
       (entreprise_id, cohorte, owner_id_avant, updated_at_avant, note_globale, motif)
select c.id, 'A_site_faible', e.owner_id, e.updated_at, c.note_globale,
       'note mesuree < 80, pires d abord'
  from candidats c join public.entreprises e on e.id = c.id
 where c.rang <= 300
on conflict (entreprise_id) do nothing;
*/

-- ── Écriture sur la fiche ────────────────────────────────────────────────────
/*
update public.entreprises e
   set cohorte_demarchage = a.cohorte,
       owner_id = coalesce(e.owner_id, '76353de0-ac50-4645-9530-8be2db55c7a3'::uuid)
  from public.archive_cohortes_20260816 a
 where a.entreprise_id = e.id;
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — rend les 600 fiches exactement à leur état d'avant
-- ─────────────────────────────────────────────────────────────────────────────
-- Décommenter pour jouer. `updated_at` est remis à sa valeur d'avant EN DERNIER,
-- sinon le trigger la réécrirait à `now()` et on perdrait la seule preuve que
-- ces lignes n'avaient pas été touchées depuis.
/*
update public.entreprises e
   set cohorte_demarchage = null,
       owner_id = a.owner_id_avant
  from public.archive_cohortes_20260816 a
 where a.entreprise_id = e.id;

update public.entreprises e
   set updated_at = a.updated_at_avant
  from public.archive_cohortes_20260816 a
 where a.entreprise_id = e.id;
*/

-- Défaire la structure (voir 20260816_campagne_cohortes_et_journal_etapes.sql) :
/*
drop trigger if exists trg_journaliser_etape_opportunite on public.opportunites;
drop function if exists public.tg_journaliser_etape_opportunite();
drop table if exists public.opportunite_etapes_journal;
alter table public.agent_settings drop column if exists quotas_demarchage;
alter table public.entreprises
  drop column if exists cohorte_demarchage,
  drop column if exists premiere_touche_le;
*/
