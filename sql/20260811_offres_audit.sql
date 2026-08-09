-- =====================================================================
-- Les offres que l'audit a le droit de proposer, et ce qu'elles réparent
-- =====================================================================
--
-- TROIS CHOSES, DONT UNE RÉPARATION URGENTE.
--
-- 1. LE SEED PERDU. `sql/20260722_offres_site_demo.sql` n'a jamais été appliquée
--    en production : ni `site_demo_cle_en_main` ni `site_sur_mesure` n'existent
--    en base. Or `src/app/api/stripe/checkout-demo/route.ts` cherche la première
--    PAR SON CODE — ce parcours de paiement est donc cassé aujourd'hui. Ce
--    fichier la rejoue, en idempotent.
--
-- 2. LE RÔLE DANS L'AUDIT (`metadata.role_audit`).
--    On vend le démo, obligatoirement ; le reste s'ajoute et se conseille. La
--    page 5 a déjà les trois emplacements qu'il faut :
--
--      socle       → `page5.services`             le site basé sur le démo
--      addition    → `page5.additional_services`  ce qu'on conseille en plus
--      alternative → `page5.secondary_card`       le sur-mesure
--
--    Une offre SANS `role_audit` n'apparaît jamais dans un audit. C'est
--    volontairement un opt-in : les offres préparatoires du catalogue restent
--    invisibles tant qu'on ne leur a pas donné de rôle, et rien ne devient
--    vendable par accident.
--
-- 3. CE QUE CHAQUE OFFRE RÉPARE (`metadata.repond_a`).
--    La relation problème → offre est portée par l'OFFRE, pas par une table de
--    correspondance tenue à côté. Conséquence voulue : ajouter une offre ne
--    touche jamais au code de l'audit, et il n'existe pas deux endroits à garder
--    alignés — c'est exactement la divergence qui a produit un abonnement
--    annoncé 19 €/mois dans l'audit et facturé 30 € au catalogue.
--
--    Les clés citées sont celles de `src/data/auditIssues.ts`.
--
-- Idempotente : `on conflict (code)` et `jsonb ||` (fusion, pas écrasement).
-- =====================================================================

-- ── 1. Le socle et son alternative ───────────────────────────────────────
insert into public.offres (type, code, nom, description, prix_ht, billing_period, actif, slug, metadata)
values
  (
    'package', 'site_demo_cle_en_main',
    'Site clé en main (base démo)',
    'On part du site démo déjà construit pour vous : recadrage des services, réécriture des textes, vos photos. La direction artistique ne change pas — c''est ce qui permet ce prix et ce délai.',
    490, 'one_shot', true, 'site-demo-cle-en-main',
    jsonb_build_object(
      'demo_as_is', true,
      -- « À partir de » : le tarif monte à 690 € selon le nombre de pages, et
      -- c'est l'agent qui l'ajuste au devis. Un seul code plutôt que des paliers
      -- à maintenir cohérents avec Stripe.
      'from', true,
      'prix_max', 690,
      'hosting_price_monthly', 19,
      'role_audit', 'socle',
      'repond_a', jsonb_build_array(
        'no_site_or_unreachable', 'outdated_or_not_mobile', 'slow_site', 'heavy_page',
        'no_https', 'zoom_blocked', 'tiny_fonts', 'blocking_scripts', 'no_compression',
        'form_not_accessible', 'phone_not_clickable', 'weak_cta', 'no_reviews_on_site',
        'weak_title', 'no_meta_description', 'no_h1', 'images_no_alt',
        'no_structured_data', 'incomplete_nap', 'no_social_links', 'no_local_seo'
      )
    )
  ),
  (
    'package', 'site_sur_mesure',
    'Site sur mesure',
    'Un site conçu de A à Z pour votre marque : vous choisissez votre direction artistique.',
    1990, 'one_shot', true, 'site-sur-mesure',
    jsonb_build_object('role_audit', 'alternative', 'repond_a', jsonb_build_array())
  )
on conflict (code) do update
  set nom            = excluded.nom,
      description    = excluded.description,
      prix_ht        = excluded.prix_ht,
      billing_period = excluded.billing_period,
      actif          = true,
      -- Fusion : on n'écrase pas les clés Stripe posées à la main.
      metadata       = public.offres.metadata || excluded.metadata;

-- ── 2. La relance d'avis ─────────────────────────────────────────────────
-- Produit d'appel volontairement bas. Sans références encore constituées, c'est
-- lui qui fabrique les preuves permettant de vendre plus cher ensuite.
--
-- Formulation prudente et assumée : on met en place la SOLLICITATION, on ne
-- promet pas les avis. Promettre un résultat qu'on ne maîtrise pas est le plus
-- court chemin vers un client déçu — et vers un avis négatif de plus.
insert into public.offres (type, code, nom, description, prix_ht, billing_period, actif, slug, metadata)
values (
  'service', 'GMB_RELANCE_AVIS',
  'Relance d''avis clients (mensuel)',
  'Sollicitation régulière de vos clients — y compris les anciens — par SMS et e-mail, avec le lien qui va directement au formulaire d''avis. Suivi mensuel du nombre d''avis et de la note.',
  49, 'monthly', true, 'relance-avis-clients',
  jsonb_build_object(
    'role_audit', 'addition',
    'repond_a', jsonb_build_array('too_few_reviews', 'low_rating')
  )
)
on conflict (code) do update
  set prix_ht  = excluded.prix_ht,
      actif    = true,
      metadata = public.offres.metadata || excluded.metadata;

-- ── 3. Les additions déjà au catalogue ───────────────────────────────────
-- Prestations livrables tout de suite, chacune rattachée au constat qui la
-- justifie. Une addition proposée sans constat correspondant serait une vente
-- forcée : c'est le `repond_a` qui l'en empêche.
update public.offres o
-- `|| jsonb_build_object(...)` et non `|| m.repond_a` : concaténer un TABLEAU à
-- un objet jsonb ne pose pas la clé, il écrase l'objet. La distinction ne se
-- voit qu'à l'exécution, et elle coûterait toutes les métadonnées Stripe.
set metadata = o.metadata || jsonb_build_object('repond_a', m.repond_a)
from (values
  ('ADD_LEGAL_PAGES',       jsonb_build_array('no_legal_pages', 'no_cookie_banner')),
  ('ADD_FORM_CRM',          jsonb_build_array('form_not_accessible')),
  ('ADD_FORM_EMAIL',        jsonb_build_array('form_not_accessible')),
  ('ADD_SPEED_OPT',         jsonb_build_array('slow_site', 'heavy_page', 'blocking_scripts', 'no_compression')),
  ('ADD_SCHEMA_MARKUP',     jsonb_build_array('no_structured_data')),
  ('ADD_SEO_TECH_BASE',     jsonb_build_array('no_sitemap', 'blocked_from_google', 'no_canonical')),
  ('ADD_GSC_SETUP',         jsonb_build_array('no_sitemap')),
  ('ADD_WHATSAPP_CTA',      jsonb_build_array('weak_cta', 'phone_not_clickable')),
  ('ADD_SECTION_PROOFS',    jsonb_build_array('no_reviews_on_site')),
  ('ADD_REDIRECTS_PLAN',    jsonb_build_array('no_canonical')),
  ('ADD_COPY_LIGHT',        jsonb_build_array('weak_title', 'no_meta_description', 'no_h1')),
  ('GMB_OPTIM',             jsonb_build_array('no_local_seo', 'rge_not_highlighted', 'incomplete_nap')),
  -- Les abonnements SEO : conseillables quand les constats de référencement
  -- s'accumulent. Google Ads reste hors audit — c'est une dépense média, pas la
  -- réparation d'un constat, et la mélanger affaiblirait tout le reste.
  ('SEO_ABO_START',         jsonb_build_array('no_local_seo', 'weak_title', 'no_meta_description')),
  ('SEO_ABO_GROWTH',        jsonb_build_array('no_local_seo', 'no_structured_data', 'no_sitemap'))
) as m(code, repond_a)
where o.code = m.code;

-- Le rôle, en une passe : toutes celles qu'on vient de rattacher.
update public.offres
set metadata = metadata || jsonb_build_object('role_audit', 'addition')
where metadata ? 'repond_a'
  and coalesce(metadata->>'role_audit', '') = ''
  and code <> 'site_sur_mesure';

-- ── 4. Une addition n'est pas une affaire ────────────────────────────────
-- `visible_in_qualification` vaut `true` par défaut : les offres insérées
-- ci-dessus apparaîtraient donc dans le sélecteur d'offre de la qualification,
-- où l'on choisit ce qu'on VEND à une entreprise. Un abonnement de relance
-- d'avis à 49 € n'y a pas sa place — il se conseille en plus d'un site, il ne
-- fonde pas une opportunité, et l'y laisser fausserait les montants du pipeline.
update public.offres
set visible_in_qualification = false
where metadata->>'role_audit' = 'addition'
  and visible_in_qualification = true;

-- Contrôle après application :
--   select code, nom, prix_ht, billing_period,
--          metadata->>'role_audit' as role,
--          jsonb_array_length(coalesce(metadata->'repond_a','[]'::jsonb)) as nb_constats
--   from public.offres
--   where metadata ? 'role_audit'
--   order by metadata->>'role_audit', prix_ht desc;
