-- Les entreprises d'un lot qui n'ont pas encore de plaquette.
--
-- ── POURQUOI CE N'EST PAS UNE REQUÊTE CÔTÉ APPELANT ──────────────────────
-- La question est « dans ce lot, lesquelles n'ont PAS de jeton » — une
-- anti-jointure. PostgREST ne sait pas l'exprimer : il faudrait lire les
-- membres du lot, lire les jetons existants, et faire la différence dans Node.
-- Sur un lot de 20 000 fiches, c'est quarante allers-retours pour choisir
-- trois cents lignes.
--
-- ── POURQUOI « SANS JETON » ET PAS « LES TROIS CENTS PREMIÈRES » ─────────
-- `assurer_jetons_plaquette` est idempotente : relancer sur une entreprise qui
-- a déjà son jeton ne fait rien (`coalesce` sur le conflit), et c'est voulu —
-- les liens déjà partis par WhatsApp doivent continuer d'ouvrir.
--
-- Mais du coup, prendre bêtement les trois cents premières du lot ferait
-- retomber sur les mêmes à chaque appel : le deuxième clic ne préparerait
-- RIEN, et le lot n'avancerait jamais au-delà de ses trois cents premières
-- fiches. Le tri par identifiant reste, il ne s'applique qu'à ce qui reste à
-- faire.
--
-- Le plafond est celui de la route agent (300) : au-delà, c'est une vague, et
-- une vague se prépare depuis le pipeline avec de quoi la relire.
begin;

create or replace function public.entreprises_sans_plaquette(
  p_lot_id  bigint,
  p_limite  integer default 300
)
returns table(entreprise_id bigint, restantes bigint)
language sql
stable
-- `search_path` ÉPINGLÉ : sans lui le chemin de recherche est celui de
-- l'APPELANT, et un schéma posé devant `public` ferait résoudre les tables
-- citées ici vers d'autres objets. Même motif qu'`assurer_jetons_plaquette`.
set search_path to 'public', 'extensions'
as $function$
  with manquantes as (
    select le.entreprise_id
      from public.lots_entreprises le
      left join public.entreprises_rapport_public r
             on r.entreprise_id = le.entreprise_id
     where le.lot_id = p_lot_id
       and r.plaquette_token is null
  )
  -- `restantes` voyage sur chaque ligne, comme le `total` de
  -- `chercher_entreprises` : c'est ce qui permet à l'écran de dire « 300
  -- préparées, il en reste 1 700 » sans un second aller-retour de comptage.
  select m.entreprise_id, (select count(*) from manquantes)
    from manquantes m
   order by m.entreprise_id
   limit greatest(1, least(p_limite, 300));
$function$;

comment on function public.entreprises_sans_plaquette is
  'Les entreprises d''un lot encore sans jeton de plaquette, plafonnées. `restantes` porte le total à faire, répété sur chaque ligne.';

revoke all on function public.entreprises_sans_plaquette from public, anon;
grant execute on function public.entreprises_sans_plaquette to service_role;

commit;
