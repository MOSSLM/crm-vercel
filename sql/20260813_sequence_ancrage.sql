-- ── Ancrer les délais d'une séquence sur ce qui s'est réellement passé ──────
--
-- LE PROBLÈME
-- Toutes les dates d'une inscription se calculaient depuis `entered_at` :
--
--     next_run_at = entered_at + step.day jours
--
-- Tant qu'une séquence n'est faite que d'e-mails automatiques, c'est juste :
-- personne ne fait attendre le moteur. Dès qu'une étape passe par un humain
-- (WhatsApp, appel) ou par une attente de réponse, ça ne l'est plus. Une tâche
-- WhatsApp posée à J+1 et faite à J+8 laisse `entered_at + 3 jours` loin dans le
-- passé : l'étape suivante est due immédiatement, et le moteur la borne à
-- `now()`. Le prospect reçoit donc la démo dans la seconde qui suit l'accroche
-- — exactement ce qu'une séquence WhatsApp cherche à éviter.
--
-- LA CORRECTION
-- Une inscription retient désormais le dernier point de reprise réel : quand
-- elle a redémarré (`anchor_at`) et depuis quelle étape (`anchor_step`). Les
-- J+n restent ceux du builder ; ils se comptent simplement à partir de cette
-- ancre au lieu de l'inscription.
--
--     next_run_at = anchor_at + (etape_suivante.day - etape_ancre.day) jours
--
-- Les deux colonnes sont NULL par défaut, et le moteur retombe alors sur
-- `entered_at` : les inscriptions déjà en cours gardent leur comportement,
-- rien à rejouer.

alter table public.sequence_enrollments
  add column if not exists anchor_at   timestamptz,
  add column if not exists anchor_step int;

comment on column public.sequence_enrollments.anchor_at is
  'Dernière reprise réelle de l''inscription (tâche manuelle faite, réponse déclarée). Les J+n des étapes suivantes se comptent à partir de là. NULL = depuis entered_at, comme avant.';

comment on column public.sequence_enrollments.anchor_step is
  'Index 0-based de l''étape où l''ancre a été posée : son `day` est le zéro du calcul. NULL = zéro de la séquence.';
