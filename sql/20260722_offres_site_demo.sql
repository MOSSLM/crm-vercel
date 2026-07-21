-- Seed the two reference site offers used by the demo-site paywall and the audit.
-- Idempotent: safe to re-run (upsert on the stable `code`).
--
--  * site_demo_cle_en_main : "buy the demo site as-is" — 490 € setup (one-shot) +
--    19 €/month hosting. This is the offer charged by the demo-site paywall
--    (src/app/api/stripe/checkout-demo) and highlighted as the audit main card.
--    Stripe price ids live in metadata and must be filled from the Stripe
--    dashboard (one-time 490 setup price + recurring 19/mo hosting price).
--  * site_sur_mesure : fully custom build, client chooses the art direction —
--    from 1990 €.

begin;

insert into public.offres (type, code, nom, description, prix_ht, devise, billing_period, actif, visible_in_qualification, qualification_order, tags, metadata)
values
  (
    'package',
    'site_demo_cle_en_main',
    'Site clé en main (à partir de votre démo)',
    'On part de votre site démo : on adapte le copy, les images, les services et certifications, mais vous gardez toute la structure. Livraison rapide.',
    490,
    'EUR',
    'one_shot',
    true,
    true,
    10,
    array['site', 'demo', 'cle_en_main'],
    jsonb_build_object(
      'demo_as_is', true,
      'hosting_price_monthly', 19,
      'stripe_setup_price_id', null,
      'stripe_hosting_price_id', null
    )
  ),
  (
    'package',
    'site_sur_mesure',
    'Site sur mesure (direction artistique au choix)',
    'Un site conçu de A à Z pour votre marque : vous choisissez votre direction artistique. À partir de 1990 €.',
    1990,
    'EUR',
    'one_shot',
    true,
    true,
    20,
    array['site', 'sur_mesure'],
    jsonb_build_object('custom', true)
  )
on conflict (code) do update set
  type = excluded.type,
  nom = excluded.nom,
  description = excluded.description,
  prix_ht = excluded.prix_ht,
  devise = excluded.devise,
  billing_period = excluded.billing_period,
  actif = excluded.actif,
  visible_in_qualification = excluded.visible_in_qualification,
  qualification_order = excluded.qualification_order,
  tags = excluded.tags,
  -- Start from the seed defaults, then overlay the existing row so any Stripe
  -- price ids an operator already filled in are preserved on re-run.
  metadata = excluded.metadata || public.offres.metadata;

commit;
