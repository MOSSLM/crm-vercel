-- Templates email par défaut « humains » : pas d'emoji, pas de « ravi(e) »,
-- formulations directes.
-- 1. Dédoublonne les défauts (la seed avait tourné deux fois → 6 lignes).
-- 2. Met à jour les 3 défauts globaux (is_default + user_id null).
-- 3. Met à jour les copies perso restées strictement identiques à l'ancien
--    texte par défaut — les templates réellement personnalisés ne sont
--    jamais touchés.
-- Appliqué via Supabase MCP.

-- 1. Dédoublonnage (aucune FK ne référence email_templates)
delete from public.email_templates
where is_default and user_id is null
  and id not in (
    select distinct on (type) id
    from public.email_templates
    where is_default and user_id is null
    order by type, created_at, id
  );

-- 2. Nouveaux textes des défauts
update public.email_templates
set subject = 'Présence en ligne de {{company_name}}',
    body    = E'Bonjour {{contact_name}},\n\nJe me permets de vous contacter : en regardant la présence en ligne de {{company_name}}, j''ai repéré quelques pistes d''amélioration concrètes.\n\nAuriez-vous un créneau cette semaine pour que je vous les présente rapidement ?\n\nCordialement,',
    updated_at = now()
where is_default and user_id is null and type = 'premier_contact';

update public.email_templates
set subject = 'Suite à notre échange — {{company_name}}',
    body    = E'Bonjour {{contact_name}},\n\nJe reviens vers vous suite à notre dernier échange concernant {{company_name}}.\n\nAvez-vous eu le temps d''y réfléchir ? Je reste disponible si vous avez des questions.\n\nBonne journée,',
    updated_at = now()
where is_default and user_id is null and type = 'relance';

update public.email_templates
set subject = 'Votre audit — {{company_name}}',
    body    = E'Bonjour {{contact_name}},\n\nComme convenu, voici votre audit pour {{company_name}} :\n\n{{lead_magnet_url}}\n\nIl reprend les points d''amélioration identifiés et des pistes concrètes pour développer votre activité.\n\nDites-moi si vous avez des questions.\n\nBonne lecture,',
    updated_at = now()
where is_default and user_id is null and type = 'lead_magnet';

-- 3. Copies perso non modifiées (corps strictement identique à l'ancien défaut)
update public.email_templates
set subject = 'Présence en ligne de {{company_name}}',
    body    = E'Bonjour {{contact_name}},\n\nJe me permets de vous contacter : en regardant la présence en ligne de {{company_name}}, j''ai repéré quelques pistes d''amélioration concrètes.\n\nAuriez-vous un créneau cette semaine pour que je vous les présente rapidement ?\n\nCordialement,',
    updated_at = now()
where not is_default
  and body = E'Bonjour {{contact_name}},\n\nJe me permets de vous contacter car j''ai identifié plusieurs opportunités pour renforcer la présence en ligne de {{company_name}}.\n\nJe serais ravi(e) de vous présenter notre approche en quelques minutes — auriez-vous un créneau cette semaine ?\n\nCordialement,';

update public.email_templates
set subject = 'Suite à notre échange — {{company_name}}',
    body    = E'Bonjour {{contact_name}},\n\nJe reviens vers vous suite à notre dernier échange concernant {{company_name}}.\n\nAvez-vous eu le temps d''y réfléchir ? Je reste disponible si vous avez des questions.\n\nBonne journée,',
    updated_at = now()
where not is_default
  and body = E'Bonjour {{contact_name}},\n\nJe me permets de revenir vers vous suite à notre dernier échange concernant {{company_name}}.\n\nAvez-vous eu l''occasion de réfléchir à notre proposition ? Je serais ravi(e) d''échanger avec vous pour répondre à vos éventuelles questions.\n\nDans l''attente de vous lire,';

update public.email_templates
set subject = 'Votre audit — {{company_name}}',
    body    = E'Bonjour {{contact_name}},\n\nComme convenu, voici votre audit pour {{company_name}} :\n\n{{lead_magnet_url}}\n\nIl reprend les points d''amélioration identifiés et des pistes concrètes pour développer votre activité.\n\nDites-moi si vous avez des questions.\n\nBonne lecture,',
    updated_at = now()
where not is_default
  and body = E'Bonjour {{contact_name}},\n\nJ''espère que vous allez bien.\n\nSuite à notre échange, j''ai le plaisir de vous partager votre audit personnalisé pour {{company_name}} :\n\n👉 {{lead_magnet_url}}\n\nCe document vous donne une vision claire de vos opportunités d''amélioration et des leviers concrets pour développer votre activité.\n\nN''hésitez pas à me faire part de vos questions — je reste disponible pour en discuter.\n\nBonne lecture,';
