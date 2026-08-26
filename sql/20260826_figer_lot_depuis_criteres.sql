-- Figer un lot depuis des critères, sans faire transiter les identifiants.
--
-- ── LA RÈGLE QU'ON ASSOUPLIT, ET POURQUOI ELLE TIENT QUAND MÊME ──────────
-- `api/entreprises/lots` porte une règle explicite : « ON FIGE DEPUIS UNE
-- LISTE D'IDENTIFIANTS, jamais depuis des critères. C'est l'appelant qui a déjà
-- résolu sa requête et sait exactement ce qu'il a sous les yeux. Refaire la
-- requête ici rendrait un lot différent de ce que l'humain a vu défiler, sans
-- que rien ne le signale. »
--
-- Le danger nommé est le SILENCE, pas la résolution côté serveur. Et la
-- prémisse — « ce que l'humain a vu défiler » — ne tient plus à cette échelle :
-- personne ne fait défiler 34 633 lignes. Ce que l'humain voit, c'est un NOMBRE
-- et des filtres. C'est donc ce nombre qu'on protège.
--
-- `p_total_attendu` porte le compte affiché à l'écran au moment du clic. S'il
-- ne correspond plus, **on ne crée rien** et on rend les deux nombres. La
-- divergence devient bruyante au lieu d'être muette, ce qui est exactement ce
-- que la règle d'origine cherchait à obtenir. Le passer à `null` désactive la
-- garde — réservé aux appelants qui n'ont rien montré à personne (un cron).
--
-- ── CE QUE ÇA DÉBLOQUE ───────────────────────────────────────────────────
-- Avant : pour figer un lot de 20 000 fiches, le client devait parcourir cent
-- pages de l'explorateur puis poster 20 000 entiers — environ 150 ko de JSON.
-- Infaisable depuis un téléphone en 4G, et de toute façon soumis au plafond de
-- durée de la route.
--
-- Après : un appel, une instruction SQL, mesuré à ~350 ms sur les 34 633 fiches
-- « sans site » (grâce à `entreprises_sans_site_idx`, cf.
-- `sql/20260826_index_sans_site.sql` — sans lui c'était 6,5 s).
--
-- ── ON NE DUPLIQUE PAS LE FILTRE ─────────────────────────────────────────
-- La fonction APPELLE `chercher_entreprises`. Recopier ses conditions ici
-- créerait une deuxième définition de « sans site », et le dépôt a déjà écrit
-- deux fois que deux définitions divergent toujours. Le tri et le calcul des
-- motifs qualité de la RPC sont du gaspillage pour notre usage — mais 350 ms
-- de gaspillage valent mieux qu'une divergence.
--
-- ── ELLE REND UN STATUT, ELLE NE LÈVE PAS D'EXCEPTION ────────────────────
-- Un refus (population changée, lot trop grand) n'est pas une panne : c'est une
-- réponse. La lever en exception obligerait l'appelant à reconnaître un message
-- d'erreur au texte — le genre de couplage qui casse à la première traduction.
begin;

-- D'où vient le lot. Nul pour un lot figé depuis une sélection à la main, et
-- c'est une information : ce lot-là ne se rejoue pas.
alter table public.lots
  add column if not exists criteres jsonb;

comment on column public.lots.criteres is
  'Les critères d''explorateur qui ont produit ce lot. Nul = lot figé depuis une sélection cochée à la main, non rejouable.';

-- Le `drop` est obligatoire : renommer un paramètre de SORTIE change le type de
-- retour, et `create or replace` le refuse. Les paramètres d'ENTRÉE ne bougent
-- pas, donc aucune surcharge n'est créée — le piège documenté dans
-- `20260820_chercher_entreprises_owner.sql` ne s'applique pas ici.
drop function if exists public.figer_lot_depuis_criteres(
  text, text, uuid, text, text[], text[], uuid, jsonb, integer, integer
);

create or replace function public.figer_lot_depuis_criteres(
  p_nom            text,
  p_note           text,
  p_cree_par       uuid,
  p_recherche      text,
  p_flags          text[],
  p_sources        text[],
  p_owner          uuid,
  p_criteres       jsonb,
  p_total_attendu  integer default null,
  p_plafond        integer default 20000
)
-- ⚠️ LA SORTIE S'APPELLE `lot`, PAS `lot_id`, ET CE N'EST PAS UN CAPRICE.
-- Un paramètre de sortie plpgsql porte le même statut qu'une variable. Nommé
-- `lot_id`, il entre en collision avec la colonne `lots_entreprises.lot_id`
-- dans la clause `on conflict (lot_id, entreprise_id)`, et Postgres refuse :
-- « column reference "lot_id" is ambiguous ». L'erreur ne survient qu'à
-- L'EXÉCUTION du chemin de création — les trois chemins de refus passent très
-- bien — donc un contrôle qui ne testerait que les refus la manquerait.
returns table(statut text, lot bigint, membres integer, total_trouve integer)
language plpgsql
-- `search_path` ÉPINGLÉ : sans lui le chemin de recherche est celui de
-- l'APPELANT, et un schéma posé devant `public` ferait résoudre les tables
-- citées ici vers d'autres objets. Même motif qu'`assurer_jetons_plaquette`.
set search_path to 'public', 'extensions'
as $$
declare
  v_ids   bigint[];
  v_total integer;
  v_lot   bigint;
begin
  -- Un seul appel. `total` est rendu par la RPC sur chaque ligne : il porte le
  -- compte RÉEL, y compris quand la limite tronque le résultat.
  select array_agg(c.id), coalesce(max(c.total), 0)
    into v_ids, v_total
  from public.chercher_entreprises(
         p_recherche,
         coalesce(p_flags, '{}'::text[]),
         coalesce(p_sources, '{}'::text[]),
         p_plafond,
         0,
         p_owner
       ) c;

  if v_total = 0 then
    return query select 'vide'::text, null::bigint, 0, 0;
    return;
  end if;

  -- La garde. Elle passe AVANT le plafond : « la population a changé » explique
  -- mieux un refus que « trop grand », quand les deux sont vrais.
  if p_total_attendu is not null and p_total_attendu <> v_total then
    return query select 'population_a_change'::text, null::bigint, 0, v_total;
    return;
  end if;

  if v_total > p_plafond then
    return query select 'trop_grand'::text, null::bigint, 0, v_total;
    return;
  end if;

  insert into public.lots (nom, note, cree_par, criteres)
  values (p_nom, p_note, p_cree_par, p_criteres)
  returning id into v_lot;

  -- `on conflict do nothing` : la clé primaire porte sur le couple, et rejouer
  -- un enregistrement interrompu ne doit pas échouer.
  insert into public.lots_entreprises (lot_id, entreprise_id)
  select v_lot, unnest(v_ids)
  on conflict (lot_id, entreprise_id) do nothing;

  return query
    select 'cree'::text, v_lot,
           (select count(*)::integer from public.lots_entreprises le where le.lot_id = v_lot),
           v_total;
end;
$$;

comment on function public.figer_lot_depuis_criteres is
  'Fige un lot en résolvant les critères côté base. Refuse (sans rien créer) si le total a bougé depuis l''affichage, ou s''il dépasse le plafond.';

revoke all on function public.figer_lot_depuis_criteres from public, anon;
grant execute on function public.figer_lot_depuis_criteres to service_role;

commit;
