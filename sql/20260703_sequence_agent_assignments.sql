-- ── Séquences attribuées aux agents freelance ────────────────────────────────
-- L'admin attribue des séquences (automations kind='sequence') à des agents ;
-- l'agent les lance sur ses propres prospects et exécute les étapes manuelles
-- (WhatsApp / LinkedIn / appel) depuis son espace agent.

-- 1. Attributions admin -> agent --------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequence_agent_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, agent_id)
);
CREATE INDEX IF NOT EXISTS seq_agent_assignments_agent_idx
  ON public.sequence_agent_assignments(agent_id);

ALTER TABLE public.sequence_agent_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all seq assignments" ON public.sequence_agent_assignments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "freelance read own seq assignments" ON public.sequence_agent_assignments
  FOR SELECT USING (public.is_freelance() AND agent_id = (SELECT auth.uid()));

-- 2. Qui a lancé l'inscription ------------------------------------------------
-- created_by est propagé par le moteur vers prospection_tasks.assignee_id pour
-- que les tâches manuelles d'une séquence lancée par un agent lui reviennent.
ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sequence_enrollments_created_by_idx
  ON public.sequence_enrollments(created_by);

-- 3. Durcissement RLS sur automations -----------------------------------------
-- L'ancienne policy au_all_authenticated laissait tout utilisateur authentifié
-- écrire dans automations. Le CRUD admin passe par le client navigateur
-- (is_admin() requis pour écrire) ; la lecture reste ouverte aux authentifiés
-- car les pages admin lisent côté client. Les autres tables du domaine
-- (sequence_enrollments, prospection_tasks, templates…) gardent leur policy
-- permissive pour l'instant : l'espace agent n'y accède que via les routes API
-- service-role — durcissement à prévoir dans une migration dédiée.
DROP POLICY IF EXISTS au_all_authenticated ON public.automations;

CREATE POLICY "automations read authenticated" ON public.automations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "automations insert admin" ON public.automations
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "automations update admin" ON public.automations
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "automations delete admin" ON public.automations
  FOR DELETE USING (public.is_admin());
