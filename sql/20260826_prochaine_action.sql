-- La prochaine action, et de quoi voir une affaire mourir avant qu'elle meure.
--
-- ── LE CONSTAT QUI A DÉCLENCHÉ CETTE MIGRATION ───────────────────────────
-- `opportunites.date_prochain_suivi` existe depuis toujours. Le pipeline
-- l'affiche, la fiche contact la propose, `SalesDashboard` en tire même une
-- liste de relances. Elle est renseignée sur **0 des 882 opportunités**.
--
-- Une colonne que personne ne remplit n'est pas un manque de discipline, c'est
-- un défaut de conception : une DATE seule ne dit pas quoi faire. « Le 3
-- septembre » n'est pas une décision ; « rappeler pour le devis toiture, le 3
-- septembre » en est une. Sans l'intitulé, remplir la date ne sert à rien —
-- alors personne ne la remplit.
--
-- D'où `prochaine_action`. Les deux se lisent ensemble : un intitulé sans date
-- ne se rappelle jamais, une date sans intitulé ne dit pas quoi faire.
--
-- ── LA VUE REND DES DURÉES, JAMAIS DES VERDICTS ──────────────────────────
-- Le seuil à partir duquel une affaire « pourrit » est une politique
-- commerciale, et elle changera — 14 jours en prospection froide, 3 après un
-- devis envoyé. L'enfermer dans la vue obligerait à une migration pour passer
-- de 14 à 10. La vue rend donc `jours_sans_echange` et `jours_de_retard` ; le
-- classement vit dans `src/lib/opportunites/suivi.ts`, à côté de l'écran qui
-- l'affiche.
--
-- ── « DERNIER ÉCHANGE » EXCLUT LES TRACES SYSTÈME, ET C'EST TOUT LE SUJET ─
-- Si un déplacement de carte comptait comme un échange, ranger son pipeline un
-- dimanche soir rajeunirait toutes ses affaires d'un coup — et l'indicateur
-- mesurerait le ménage plutôt que le travail. Seuls les canaux de contact réel
-- comptent (appel, e-mail, SMS, WhatsApp, LinkedIn, RDV, note, formulaire),
-- c'est-à-dire exactement les `CANAUX_ECHANGE` de `lib/fil-activite.ts`.
--
-- ── `jours_sans_echange` NUL N'EST PAS ZÉRO ──────────────────────────────
-- Nul veut dire « jamais aucun échange ». Le confondre avec zéro ferait passer
-- une affaire jamais touchée pour une affaire touchée aujourd'hui — soit
-- exactement l'inverse. Sur les 877 opportunités vivantes, seules 180
-- entreprises portent le moindre échange : c'est le cas majoritaire, pas un
-- cas limite.
begin;

alter table public.opportunites
  add column if not exists prochaine_action text;

comment on column public.opportunites.prochaine_action is
  'Ce qu''on a décidé de faire ensuite, en clair. Se lit avec date_prochain_suivi : une date sans intitulé ne dit pas quoi faire, un intitulé sans date ne se rappelle jamais.';

create or replace view public.vue_opportunites_suivi
with (security_invoker = true) as
with echanges as (
  select
    entreprise_id,
    max(survenu_le) as dernier_echange_le
  from public.vue_fil_activite
  where canal in ('appel', 'email', 'sms', 'whatsapp', 'linkedin', 'rdv', 'note', 'formulaire')
  group by entreprise_id
)
select
  o.id                                as opportunite_id,
  o.entreprise_id                     as entreprise_id,
  e.name                              as entreprise_nom,
  e.ville                             as ville,
  o.name                              as intitule,
  o.stage_id                          as stage_id,
  ep.nom                              as etape_nom,
  ep.ordre                            as etape_ordre,
  o.montant                           as montant,
  o.mrr                               as mrr,
  o.priorite                          as priorite,
  o.owner_id                          as owner_id,
  o.prochaine_action                  as prochaine_action,
  o.date_prochain_suivi               as date_prochain_suivi,
  x.dernier_echange_le                as dernier_echange_le,
  case
    when x.dernier_echange_le is null then null
    else (current_date - x.dernier_echange_le::date)
  end                                 as jours_sans_echange,
  case
    when o.date_prochain_suivi is null then null
    else (current_date - o.date_prochain_suivi)
  end                                 as jours_de_retard,
  o.created_at                        as creee_le
from public.opportunites o
join public.entreprises e on e.id = o.entreprise_id
left join public.etapes_pipeline ep on ep.id = o.stage_id
left join echanges x on x.entreprise_id = o.entreprise_id
where o.archived_at is null
  and coalesce(o.is_test, false) = false;

comment on view public.vue_opportunites_suivi is
  'Une ligne par opportunité vivante, avec l''ancienneté du dernier échange RÉEL et le retard sur la prochaine action. Rend des durées, jamais des verdicts : le seuil est une politique, il vit dans le code.';

grant select on public.vue_opportunites_suivi to authenticated;

commit;
