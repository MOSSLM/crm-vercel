-- Les deux identifiants de prix Stripe de l'offre vendue par le paywall démo.
--
-- POURQUOI CE FICHIER. `src/app/api/stripe/checkout-demo/route.ts` lit
-- `metadata.stripe_hosting_price_id` et `metadata.stripe_setup_price_id` sur
-- l'offre `site_demo_cle_en_main`. Aucune des deux clés n'a jamais été posée en
-- base : les seeds (20260722_offres_site_demo, 20260811_offres_audit) les
-- laissent à null ou ne les mentionnent pas. La route répond donc
-- `offer_missing_stripe_price` (400) et le visiteur voit « Le paiement est
-- momentanément indisponible ». Le schéma, lui, est complet — rien à rattraper
-- de ce côté.
--
-- CE QU'IL FAUT AVANT DE L'EXÉCUTER. Deux prix créés dans le dashboard Stripe,
-- sur le MÊME compte que la clé `STRIPE_SECRET_KEY` configurée dans Vercel
-- (un price_… de test ne fonctionne pas avec une clé live, et inversement) :
--
--   * frais de mise en place : 490 € HT, paiement unique
--   * hébergement            : 19 € HT, récurrent mensuel
--
-- Copiez leurs identifiants (`price_…`, PAS les `prod_…`) ci-dessous.
--
-- Le setup seul suffit à débloquer le paiement : sans hébergement la route bascule
-- en mode `payment` (encaissement unique, pas d'abonnement). L'inverse marche
-- aussi. Renseigner les deux donne le parcours voulu — abonnement mensuel avec
-- les 490 € ajoutés à la première facture.
--
-- Fusion (`||`) et non écrasement : le reste du metadata — `role_audit`,
-- `repond_a`, `prix_max`… — est préservé. Rejouable pour corriger un id.

begin;

update public.offres
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'stripe_setup_price_id',   'price_REMPLACER_setup_490',
  'stripe_hosting_price_id', 'price_REMPLACER_hosting_19'
)
where code = 'site_demo_cle_en_main';

commit;

-- Vérification : les deux clés doivent apparaître, sans « REMPLACER ».
--   select metadata->>'stripe_setup_price_id'   as setup,
--          metadata->>'stripe_hosting_price_id' as hosting
--   from public.offres where code = 'site_demo_cle_en_main';
