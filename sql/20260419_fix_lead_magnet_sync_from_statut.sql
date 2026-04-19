-- Fix: decouple opportunites.lead_magnet from lead_magnet_projects.pret_pour_lm.
--
-- Problem:
--   Trigger `trg_sync_opportunity_from_lm_project` was copying
--   `lead_magnet_projects.pret_pour_lm` → `opportunites.lead_magnet` 1:1.
--   `pret_pour_lm` is the *input* signal ("ready to enrich"), not the *output*
--   state. The edge function `enrich-lead-magnet` rejected every enrichment
--   with `lead_magnet_already_done` because the trigger had already set
--   `opportunites.lead_magnet = true` before enrichment could run.
--
-- Fix:
--   `opportunites.lead_magnet` now reflects the final delivered state — it
--   becomes true only when the project reaches `statut IN ('ready','published')`
--   (i.e., after manual handoff on Framer). During `draft`/`processing`/
--   `framer`/`failed`, it stays false so the edge function can actually run.

-- 1) Drop the old trigger and function that caused the premature sync.
drop trigger if exists trg_sync_opportunity_from_lm_project on public.lead_magnet_projects;
drop function if exists public.sync_opportunity_lead_magnet_from_project();

-- 2) New function: sync opportunites.lead_magnet from lead_magnet_projects.statut.
create or replace function public.sync_opportunity_lead_magnet_from_lmp_statut()
returns trigger
language plpgsql
as $$
declare
  v_done boolean;
begin
  v_done := coalesce(new.statut in ('ready', 'published'), false);

  update public.opportunites
  set lead_magnet = v_done,
      updated_at = now()
  where id = new.opportunite_id
    and coalesce(lead_magnet, false) is distinct from v_done;

  return null;
end;
$$;

-- 3) Trigger on statut changes (AFTER update so it doesn't fight other triggers).
create trigger trg_sync_opportunity_lead_magnet_from_lmp_statut
after insert or update of statut on public.lead_magnet_projects
for each row
execute function public.sync_opportunity_lead_magnet_from_lmp_statut();

-- 4) Backfill: align opportunites.lead_magnet with the current project statut.
update public.opportunites o
set lead_magnet = (lmp.statut in ('ready','published')),
    updated_at = now()
from public.lead_magnet_projects lmp
where lmp.opportunite_id = o.id
  and coalesce(o.lead_magnet, false) is distinct from (lmp.statut in ('ready','published'));
