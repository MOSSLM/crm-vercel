-- Les métiers MIS DE CÔTÉ — un troisième axe sur `enrichment_tag_settings`.
--
-- LE BESOIN, MOT POUR MOT : « je veux les trier, comme ça on doit avoir un
-- filtre qui reste jusqu'à ce que j'aie préparé les pages services en rapport
-- avec l'isolation, que je débloquerais en autorisant isolation. »
--
-- CE QUI EST DEMANDÉ N'EST PAS UN FILTRE, C'EST UN INTERRUPTEUR. Un filtre se
-- recoche à chaque écran et s'oublie au premier oubli ; ces fiches doivent
-- sortir des files de TOUT LE MONDE, y compris de celle d'un agent à qui elles
-- sont déjà attribuées. Et le jour où le gabarit sait faire une page
-- « isolation », UNE bascule doit toutes les faire revenir — d'où une décision
-- portée par le TAG et jamais par la fiche. Figer la liste des fiches
-- obligerait à la refaire à chaque enrichissement ; la liste des métiers, elle,
-- tient toute seule.
--
-- ⚠️ TROIS AXES INDÉPENDANTS, ET LES CONFONDRE CASSE QUELQUE CHOSE.
--   · `allowed`         : l'enrichissement a-t-il le droit de POSER ce tag ?
--   · `knownToTemplate` : une page du gabarit le reconnaît-elle ? (dans le code)
--   · `demarchable`     : VEND-ON à ce métier aujourd'hui ?  ← ce fichier
-- Passer l'isolation en `allowed = false` n'aurait rien écarté : ces libellés
-- viennent de l'import ADEME et des catégories Google, pas de l'enrichissement.
-- On ne les empêche pas d'être posés — ils sont VRAIS — on décide seulement de
-- ne pas leur vendre pour l'instant.
--
-- LE DÉFAUT EST « DÉMARCHABLE », comme `allowed` : une ligne absente ne bloque
-- rien. C'est ce qui permet d'ajouter un métier à la base sans qu'il disparaisse
-- des files en silence — l'inverse rendrait chaque nouveau libellé invisible.
--
-- ⚠️ LA PRÉSENCE SUFFIT, ET IL N'Y A PAS D'EXCEPTION « IL FAIT AUSSI DE LA
-- CLIM ». C'est la règle du propriétaire, et sa raison est plus forte que
-- l'arithmétique : « isolation les exclut pour le moment, c'est un service FORT,
-- on peut pas présenter un site démo sans ça. » Un poseur d'isolation qui fait
-- aussi de la clim recevrait une démo où son métier principal n'a aucune page —
-- c'est pire qu'aucune démo. Garder les « mixtes » au nom d'un métier autorisé
-- reviendrait à leur envoyer précisément ce site-là.
--
-- ON DÉCLARE QUAND MÊME LES MÉTIERS ADEME QU'ON VEND, mais pour COMPTER, jamais
-- pour rattraper : ils disent combien de fiches reviendront en premier le jour
-- où l'isolation sera débloquée. Les paramètres ne connaissaient que 120
-- libellés, dont 9 autorisés — les 9 tags de la taxonomie du gabarit — et
-- ignoraient totalement « Pompe à chaleur : chauffage » (15 303 fiches) ou
-- « Chauffe-Eau Thermodynamique » (15 220). Sans eux, « celle-ci fait aussi un
-- métier qu'on vend » resterait indécidable.
--
-- Contrôles à relire après application :
--   select demarchable, count(*) from enrichment_tag_settings group by 1;
--   -- 10 en false (7 ADEME/Google isolation + menuiserie, 1 catégorie Google,
--   --  2 libellés de niche), le reste en true.
--   select count(*) from entreprises e where exists (
--     select 1 from jsonb_array_elements_text(
--       case when jsonb_typeof(e.service_tags)='array' then e.service_tags else '[]'::jsonb end) t(tag)
--     join enrichment_tag_settings s on s.tag = t.tag where s.demarchable = false);
--   -- la population mise de côté sur toute la base. Mesuré le 29/08/2026 juste
--   -- après application : 28 364 fiches sur 60 445, soit près de la moitié du
--   -- parc. C'est le chiffre qu'on comparera le jour du déblocage — et c'est
--   -- aussi la mesure de ce que vaudra une page « isolation » au gabarit.

alter table enrichment_tag_settings
  add column if not exists demarchable boolean not null default true;

comment on column enrichment_tag_settings.demarchable is
  'Vend-on à ce métier aujourd''hui ? Axe INDÉPENDANT de `allowed` (qui dit si '
  'l''enrichissement peut poser le tag). false = les fiches qui le portent '
  'sortent des files de démarchage, sans être ni supprimées ni archivées. Le '
  'jour où le gabarit sait servir ce métier, repasser à true les fait revenir.';

-- ── Ce qu'on met de côté : l'isolation et la menuiserie ──────────────────────
-- Sept libellés ADEME, deux libellés de niche, une catégorie Google. Ils
-- écartent 28 364 fiches sur 60 445 — c'est beaucoup, et c'est le prix d'une
-- page de service qui n'existe pas encore. Sur le lot 2 : 93 fiches, dont 10
-- font aussi un métier qu'on vend.
insert into enrichment_tag_settings (tag, allowed, demarchable, updated_at)
values
  ('Isolation par l''intérieur des murs ou rampants de toitures  ou plafonds', true, false, now()),
  ('Isolation des combles perdus', true, false, now()),
  ('Isolation des murs par l''extérieur', true, false, now()),
  ('Isolation des toitures terrasses ou des toitures par l''extérieur', true, false, now()),
  ('Isolation des planchers bas', true, false, now()),
  ('Poseur d''isolation', true, false, now()),
  ('Fenêtres, volets, portes donnant sur l''extérieur', true, false, now()),
  ('Fenêtres de toit', true, false, now()),
  ('Menuisier fenêtres', true, false, now())
on conflict (tag) do update set demarchable = excluded.demarchable, updated_at = now();

-- Celui-ci existait déjà, bloqué à l'enrichissement. Les deux axes se règlent
-- séparément : on le laisse bloqué ET on le met de côté.
update enrichment_tag_settings
   set demarchable = false, updated_at = now()
 where tag = 'Entrepreneur spécialisé dans l''isolation';

-- ── Les métiers ADEME qu'on vend — déclarés pour COMPTER ────────────────────
-- Ils ne rattrapent personne : une fiche qui porte l'isolation sort quoi
-- qu'elle porte à côté. Ils servent à dire combien reviendront en premier, et à
-- distinguer « fait aussi de la clim » de « on ne sait pas ».
--
-- « Travaux d'efficacité énergétique » (35 979 fiches) n'y est PAS, et c'est
-- délibéré : c'est une étiquette RGE générique qui ne dit aucun métier. La
-- déclarer ferait passer pour un installateur de clim n'importe quel poseur
-- d'isolation qui la porte aussi.
insert into enrichment_tag_settings (tag, allowed, demarchable, updated_at)
values
  ('Pompe à chaleur : chauffage', true, true, now()),
  ('Chauffe-Eau Thermodynamique', true, true, now()),
  ('Ventilation mécanique', true, true, now()),
  ('Chaudière condensation ou micro-cogénération gaz ou fioul', true, true, now())
on conflict (tag) do nothing;
