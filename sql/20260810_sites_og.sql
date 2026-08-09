-- =====================================================================
-- Preview sociale des liens démo : les colonnes qui portent la carte OG
-- =====================================================================
-- POURQUOI
-- `buildPageMetadata` retombait sur `sites.logo_url` en l'annonçant en
-- 1200×630 : un logo carré déclaré au format bannière. Sur WhatsApp, une
-- vignette étirée — ou rien du tout. Et l'aperçu brouillon
-- ({uuid}.samadigitalstudio.fr) n'exportait qu'un `robots: noindex`, donc
-- s'affichait en URL nue.
--
-- Ces quatre colonnes portent les images pré-fabriquées, déposées dans le
-- bucket `site-builder-assets` :
--   og_image_url  la carte OG finale (1200×630 PNG)
--   og_shot_url   la capture du site démo intégrée à la carte
--   og_logo_url   le logo du client normalisé en PNG (satori ne sait
--                 afficher ni WebP ni SVG distant)
--
-- LE NOM DE FICHIER PORTE UN HASH DU CONTENU, et c'est délibéré : WhatsApp
-- met en cache PAR URL. Un chemin fixe servi en `immutable` resterait
-- éternellement périmé — l'opérateur republierait sans que la vignette
-- change jamais, et le symptôme ressemblerait à « le correctif n'a pas
-- marché ». Chaque régénération produit donc une URL neuve.
--
-- Rejouable : chaque instruction est `if not exists`.
-- Ces colonnes sont aussi reprises dans `sql/RATTRAPAGE_colonnes_sites.sql`.
-- =====================================================================

begin;

alter table public.sites
  add column if not exists og_image_url     text,
  add column if not exists og_shot_url      text,
  add column if not exists og_logo_url      text,
  add column if not exists og_generated_at  timestamptz,
  add column if not exists og_shot_at       timestamptz;

comment on column public.sites.og_image_url is
  'Carte OpenGraph pré-générée (URL storage, nom haché). null = à régénérer.';
comment on column public.sites.og_shot_url is
  'Capture du site démo intégrée à la carte OG. null = carte rendue sans mockup.';
comment on column public.sites.og_logo_url is
  'Logo client normalisé en PNG pour satori (ni WebP ni SVG).';

commit;
