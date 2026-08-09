-- =====================================================================
-- Carte de partage v2 : capture mobile + lisibilité du logo
-- =====================================================================
-- Deux colonnes ajoutées après le premier envoi réel, chacune pour un
-- défaut constaté et non deviné.
--
-- `og_shot_mobile_url` — la carte montre désormais un téléphone en
-- superposition à côté du cadre navigateur. Y mettre la capture ORDINATEUR
-- rétrécie donnerait un site illisible dans un écran de 150 px de large,
-- et surtout mensonger : ce n'est pas ce que verra le prospect sur son
-- téléphone. D'où une seconde capture, à 390 px, prise EN PARALLÈLE de la
-- première pour ne pas doubler l'attente.
--
-- `og_logo_sombre` — le logo est maintenant posé nu sur le fond, sans la
-- plaque blanche qui l'enfermait. Mais un logo sombre (le cas le plus
-- fréquent : du texte noir ou bordeaux sur fond transparent) disparaît sur
-- un dégradé bleu nuit. On mesure donc sa clarté moyenne une fois, à la
-- conversion, et la carte ne pose une plaque que dans ce cas.
--
-- Rejouable : chaque instruction est `if not exists`.
-- Reprise dans `sql/RATTRAPAGE_colonnes_sites.sql`.
-- =====================================================================

begin;

alter table public.sites
  add column if not exists og_shot_mobile_url text,
  add column if not exists og_logo_sombre     boolean;

comment on column public.sites.og_shot_mobile_url is
  'Capture 390 px du démo, pour le téléphone en superposition de la carte.';
comment on column public.sites.og_logo_sombre is
  'Vrai quand le logo est trop sombre pour être posé nu sur le fond de la carte. null = pas encore mesuré.';

commit;
