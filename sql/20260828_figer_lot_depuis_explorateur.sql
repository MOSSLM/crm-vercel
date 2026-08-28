-- Figer un lot depuis l'explorateur, avec SES filtres — la troisième porte.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE TROISIÈME, ALORS QUE DEUX EXISTENT DÉJÀ
-- ─────────────────────────────────────────────────────────────────────────────
-- L'explorateur est l'écran où l'on VOIT une population : vingt-sept familles
-- de filtres, le total en grand, les répartitions à côté. C'est donc lui qui
-- doit fabriquer les lots. Aucune des deux portes existantes ne le permettait :
--
--   · PAR IDENTIFIANTS (`corpsSchema`) — plafonnée à ce qui est coché, donc
--     cinq cents fiches au mieux, et une page à la fois. Sur un résultat de
--     34 633 lignes, c'est sans objet.
--
--   · PAR CRITÈRES (`figer_lot_depuis_criteres`) — elle ne parle que le
--     vocabulaire de `chercher_entreprises` : neuf drapeaux et quatre sources.
--     Figer « WordPress abandonnés, en Gironde, sans SIRET » par cette porte
--     rendrait TOUT LE PARC, puisque ni la technologie ni le département ne s'y
--     traduisent. C'est le mensonge que le dépôt nomme déjà pour `services` et
--     `filtres` du pipeline marketing, et il se refuse au lieu de se subir.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI REND CELLE-CI SÛRE : ELLE N'A PAS DE DÉFINITION À ELLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Elle appelle `explorateur_base_sql`, exactement comme
-- `explorateur_entreprises`. Le nombre affiché à l'écran et la population figée
-- sortent donc du MÊME texte SQL, construit à partir du MÊME objet de filtres,
-- validé par le MÊME schéma Zod (`api/entreprises/explorateur/_filtres.ts`).
-- Il n'y a rien à faire diverger — c'est la seule raison pour laquelle on peut
-- se permettre une porte de plus.
--
-- ON NE RETIRE PAS LES DEUX AUTRES, ET CE N'EST PAS DE LA PRUDENCE. Les trois
-- désignent des choses différentes : cocher trente fiches précises dans le
-- pipeline marketing reste légitime ; et surtout `sans_site` chez
-- `chercher_entreprises` (qui passe par `host_est_generique`, donc une page
-- Facebook compte comme « pas de site ») N'EST PAS `site = ['absent']` chez
-- l'explorateur (qui lit `site_web_canonique` et les constats). Fusionner les
-- deux changerait en silence ce que « sans site » veut dire, sur les deux
-- écrans à la fois.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA GARDE, REPRISE TELLE QUELLE
-- ─────────────────────────────────────────────────────────────────────────────
-- `p_total_attendu` porte le compte affiché au moment du clic. S'il ne
-- correspond plus, ON NE CRÉE RIEN et on rend les deux nombres : la divergence
-- devient bruyante au lieu d'être muette. C'est ce qui permet d'assouplir la
-- règle « on fige depuis une liste d'identifiants » sans perdre ce qu'elle
-- protégeait — le danger qu'elle nommait était le SILENCE, pas la résolution
-- côté serveur.
--
-- UNE SEULE INSTRUCTION POUR COMPTER ET COLLECTER, et c'est délibéré. Compter
-- puis relire serait deux instantanés en `read committed` : la garde
-- comparerait un nombre à une population qui n'est plus la même. Les
-- identifiants sont donc ramenés dans un tableau par la même requête que le
-- compte — 20 000 bigints font 160 ko, et cette porte plafonne bien avant.

begin;

-- ⚠️ LA SORTIE S'APPELLE `lot`, PAS `lot_id`. Un paramètre de sortie plpgsql a
-- le statut d'une variable : nommé `lot_id`, il entre en collision avec la
-- colonne dans `on conflict (lot_id, entreprise_id)`, et Postgres refuse. Le
-- piège est celui de `figer_lot_depuis_criteres`, et il ne se manifeste que sur
-- le chemin de CRÉATION — les trois refus passent très bien.
drop function if exists public.figer_lot_depuis_explorateur(
  text, text, uuid, jsonb, integer, integer
);

create or replace function public.figer_lot_depuis_explorateur(
  p_nom            text,
  p_note           text,
  p_cree_par       uuid,
  p_filtres        jsonb,
  p_total_attendu  integer default null,
  p_plafond        integer default 20000
)
returns table(statut text, lot bigint, membres integer, total_trouve integer)
language plpgsql
-- `search_path` épinglé pour la même raison qu'ailleurs : sans lui, le chemin
-- de recherche est celui de l'appelant. Le faire ici ne coûte rien — cette
-- fonction n'a aucun prédicat à faire reconnaître par un index partiel, à la
-- différence de `chercher_entreprises` et de ses voisines (cf. CLAUDE.md).
set search_path to 'public', 'extensions'
as $fn$
declare
  v_sql   text;
  v_ids   bigint[];
  v_total integer;
  v_lot   bigint;
begin
  -- Le même texte que celui de l'écran. Le tri est sans objet ici — on prend
  -- tout — mais le paramètre est obligatoire, et 'nom' est son défaut.
  v_sql := public.explorateur_base_sql(p_filtres, 'nom');

  execute 'select array_agg(x.id), count(*)::integer from (' || v_sql || ') x'
    into v_ids, v_total;

  if v_total = 0 then
    return query select 'vide'::text, null::bigint, 0, 0;
    return;
  end if;

  -- La garde passe AVANT le plafond : « la population a changé » explique mieux
  -- un refus que « trop grand », quand les deux sont vrais.
  if p_total_attendu is not null and p_total_attendu <> v_total then
    return query select 'population_a_change'::text, null::bigint, 0, v_total;
    return;
  end if;

  if v_total > p_plafond then
    return query select 'trop_grand'::text, null::bigint, 0, v_total;
    return;
  end if;

  -- `criteres` reçoit l'objet de filtres ENTIER. C'est ce qui rend lisible, six
  -- mois plus tard, pourquoi ce lot contient ces fiches-là — et ce qui
  -- permettra un jour de le rejouer pour mesurer ce qui a bougé depuis.
  insert into public.lots (nom, note, cree_par, criteres)
  values (p_nom, p_note, p_cree_par, p_filtres)
  returning id into v_lot;

  insert into public.lots_entreprises (lot_id, entreprise_id)
  select v_lot, unnest(v_ids)
  on conflict (lot_id, entreprise_id) do nothing;

  return query
    select 'cree'::text, v_lot,
           (select count(*)::integer from public.lots_entreprises le where le.lot_id = v_lot),
           v_total;
end;
$fn$;

comment on function public.figer_lot_depuis_explorateur is
  'Fige un lot depuis les filtres de l''explorateur, résolus par explorateur_base_sql — donc sur exactement la population que l''écran montrait. Refuse sans rien créer si le total a bougé, ou s''il dépasse le plafond.';

revoke all on function public.figer_lot_depuis_explorateur from public, anon;
grant execute on function public.figer_lot_depuis_explorateur to service_role;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Les trois refus, puis la création. À jouer dans une transaction qu'on annule,
-- pour ne pas laisser de lot d'essai derrière soi :
--
--   begin;
--   -- population inchangée mais total faux → refus, rien de créé
--   select * from figer_lot_depuis_explorateur(
--     'essai', null, null, '{"departements":["75"]}'::jsonb, 1);
--   --   statut = population_a_change, total_trouve = 1180
--
--   -- au-dessus du plafond → refus
--   select * from figer_lot_depuis_explorateur(
--     'essai', null, null, '{}'::jsonb, 60078, 20000);
--   --   statut = trop_grand
--
--   -- le bon compte → création
--   select * from figer_lot_depuis_explorateur(
--     'essai', null, null, '{"departements":["75"]}'::jsonb, 1180);
--   --   statut = cree, membres = 1180
--   rollback;
--
-- ET LE CONTRÔLE QUI COMPTE VRAIMENT : la population figée est-elle bien celle
-- que l'écran annonçait ? Les deux chiffres doivent être égaux pour n'importe
-- quel jeu de filtres.
--
--   select (explorateur_entreprises('{"site":["absent"]}'::jsonb))->>'total' as a_l_ecran,
--          (select total_trouve from figer_lot_depuis_explorateur(
--             'sonde', null, null, '{"site":["absent"]}'::jsonb, -1)) as a_figer;
--   -- `-1` comme total attendu : la fonction refuse donc de créer quoi que ce
--   -- soit, mais rend quand même ce qu'elle a compté.
