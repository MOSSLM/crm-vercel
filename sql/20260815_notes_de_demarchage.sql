-- ── Ce que le prospect a dit, dans le même fil que ce qu'on lui a envoyé ────
--
-- CE QUE ÇA AJOUTE
-- Une note de démarchage : l'issue d'une étape (« a répondu », « pas le bon
-- moment », « pas intéressé »…) et, en clair, ce que la personne a dit.
--
-- ELLE VIT DANS `email_logs`, PAS DANS UNE TABLE À PART
-- `email_logs` n'est plus un journal d'e-mails depuis `20260722_message_channel`
-- : c'est LE fil d'échanges d'une entreprise, tous canaux confondus, et c'est
-- lui que lisent la fiche entreprise (`AgentExchangeHistory`), la messagerie
-- (`EmailHistory`) et le dernier échange du pipeline commercial. Une table
-- séparée aurait obligé chacun de ces écrans à fusionner deux sources dans le
-- bon ordre — trois occasions de diverger, pour un fil qui doit se lire d'une
-- seule traite. La note y entre donc comme un échange de plus.
--
-- ⚠️ `20260722_message_channel.sql` N'A JAMAIS ÉTÉ APPLIQUÉE : `channel`
-- n'existait pas en base au 12/08. Deux conséquences visibles, silencieuses
-- jusqu'ici parce que les deux chemins échouent côté serveur — PostgREST rejette
-- la requête entière sur une colonne inconnue :
--   · `/api/agent/history` sélectionne `channel` → l'historique d'échanges de la
--     fiche entreprise ne rendait RIEN ;
--   · `/api/messages/log` insère `channel` → aucun clic « Ouvrir WhatsApp »
--     n'était journalisé, donc aucun message WhatsApp n'apparaissait dans le fil.
-- La colonne est donc (re)posée ici, à l'identique et de façon idempotente, pour
-- que ce fichier suffise à remettre le fil d'aplomb.

alter table public.email_logs add column if not exists channel text not null default 'email';
create index if not exists email_logs_channel_idx on public.email_logs using btree (channel);

-- L'issue retenue, et l'étape d'où elle vient.
--
-- `step_id` est l'identifiant d'étape DANS la définition de la séquence
-- (`s1`, `s2`…), pas une clé étrangère : les étapes vivent dans le `jsonb` de
-- `automations.definition`, elles n'ont pas de table. C'est ce qui permet à la
-- carte du pipeline de retrouver SA dernière note plutôt que la dernière note
-- du prospect, toutes étapes confondues.
alter table public.email_logs add column if not exists outcome text;
alter table public.email_logs add column if not exists step_id text;

comment on column public.email_logs.channel is
  'email · whatsapp · note — le fil d''échanges est multicanal.';
comment on column public.email_logs.outcome is
  'Issue de l''étape pour une ligne `channel = ''note''` (cf. STEP_OUTCOMES).';
comment on column public.email_logs.step_id is
  'Étape de séquence d''où vient la note (`automations.definition`, pas une FK).';

-- Retrouver la dernière note d'une étape sans balayer tout le fil du prospect.
create index if not exists email_logs_notes_idx
  on public.email_logs using btree (opportunite_id, step_id)
  where channel = 'note';

-- `to_email` est `not null` : une note n'a pas de destinataire, elle rapporte ce
-- qu'on a ENTENDU. Plutôt que de relâcher la contrainte — d'autres écrans
-- comptent dessus pour un vrai envoi —, l'écriture pose une chaîne vide, et
-- c'est `channel` qui distingue les deux natures de ligne.
