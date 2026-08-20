-- La signature d'un message n'est pas celle de celui qui l'a écrit.
--
-- CE QUI PARTAIT
-- Deux modèles WhatsApp se terminent par « Bilal », en dur :
--   · « Envoi du site démo »  — utilisé par la SEULE séquence active
--     (« WhatsApp seul — sans e-mail », 153 inscrits) ;
--   · « Accroche directe — le site tout de suite » — deux séquences en
--     brouillon.
--
-- Or l'attribution du parc est partagée : `entreprises.owner_id` donne 561
-- fiches à Matteo et 344 à Bilal. La majorité des prospects recevait donc un
-- message signé du prénom de quelqu'un qui ne suit pas leur fiche — et qui ne
-- pourra pas répondre au téléphone si on le rappelle.
--
-- CE QU'ON POSE
-- `{{owner.first_name}}` existe depuis toujours dans le catalogue
-- (`variables.ts`) et est REMPLI par le moteur (`lireOwnerPrenom`, engine.ts) :
-- c'est le prénom de celui qui suit l'entreprise, lu dans `user_profiles`.
--
-- Le repli `| "Sama"` n'est pas une coquetterie : `lireOwnerPrenom` rend une
-- chaîne vide quand personne ne suit le prospect (121 opportunités sont encore
-- orphelines), et un message qui se termine par une ligne blanche part quand
-- même. Signer « Sama » n'est faux pour personne ; signer d'un blanc a l'air
-- d'un bug, et signer « Bilal » est faux six fois sur dix.
--
-- ⚠️ ARCHIVER AVANT : on écrase du contenu rédigé, et `whatsapp_templates` ne
-- garde aucune version.
begin;

create table if not exists public.archive_modeles_whatsapp_20260820 as
select *, now() as archive_le from public.whatsapp_templates;

comment on table public.archive_modeles_whatsapp_20260820 is
  'Les modèles WhatsApp tels qu''ils étaient avant le remplacement de la signature en dur par {{owner.first_name}}, le 20/08/2026.';

update public.whatsapp_templates
   set body         = replace(body,         E'\nBilal', E'\n{{owner.first_name | "Sama"}}'),
       body_contact = replace(body_contact, E'\nBilal', E'\n{{owner.first_name | "Sama"}}')
 where coalesce(body, '') like ('%' || E'\nBilal' || '%')
    or coalesce(body_contact, '') like ('%' || E'\nBilal' || '%');

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.whatsapp_templates
--  where coalesce(body,'') || coalesce(body_contact,'') ilike '%bilal%';   -- 0
-- select name, right(body, 40) from public.whatsapp_templates
--  where body like '%owner.first_name%';
--   attendu : les deux modèles, terminés par {{owner.first_name | "Sama"}}
-- select count(*) from public.archive_modeles_whatsapp_20260820;
