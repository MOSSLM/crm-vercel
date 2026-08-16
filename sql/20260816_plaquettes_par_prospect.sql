-- =====================================================================
-- Une plaquette par prospect — `entreprises_rapport_public` étendue
-- =====================================================================
-- CE QUI MANQUE, ET CE QUE ÇA COÛTE
-- `/plaquette` a UNE seule URL pour les 300 entreprises de la cohorte B.
-- GA4 est branché sur tout le groupe `(public)` et alimente l'étage
-- « document ouvert » de l'entonnoir de campagne : avec une URL unique,
-- une ouverture ne s'attribue à personne. Cet étage resterait donc vide
-- pour la moitié de la campagne, et un entonnoir plat se lit comme un
-- désintérêt des prospects alors qu'il ne dit que notre aveuglement.
-- Il faut le MÊME document, une URL par entreprise.
--
-- POURQUOI ON ÉTEND CETTE TABLE PLUTÔT QUE D'EN CRÉER UNE JUMELLE
-- `entreprises_rapport_public` fait déjà exactement ce travail pour le
-- rapport d'audit : un jeton non devinable par entreprise, révocable,
-- avec un compteur de vues (42 jetons en base au 16/08, 7 actifs). Une
-- table jumelle recopierait le jeton, le compteur, la politique RLS et
-- la cascade de suppression — quatre choses à tenir d'accord, qui
-- divergeraient à la première correction faite d'un seul côté.
--
-- POURQUOI DES COLONNES ET NON UNE LIGNE PAR TYPE DE DOCUMENT
-- C'est le choix qu'on aurait fait sur une table neuve : une clé
-- (entreprise_id, document) est plus propre. Ici elle CASSE le rapport.
-- La clé primaire est `entreprise_id` seul, et `assurerJetonRapport`
-- (src/lib/audit-site/rapport.ts) lit la ligne d'une entreprise avec
-- `.maybeSingle()` — deux lignes pour une même entreprise, et cette
-- lecture renvoie une erreur au lieu du jeton. Le moteur de séquences
-- en dépend pour interpoler `{{company.audit_url}}` : le jour où on
-- préparerait les plaquettes de la cohorte B, les rapports de la
-- cohorte A partiraient avec un lien vide. La forme 1:1 de la table est
-- donc un contrat déjà signé par ses lecteurs, pas un détail.
--
-- CONSÉQUENCE VOULUE : le jeton du rapport et celui de la plaquette
-- sont DISTINCTS. Un prospect qui a reçu la plaquette ne peut pas
-- deviner l'autre document depuis son lien, et réciproquement.
--
-- AUCUNE RÉÉCRITURE DE TABLE : `plaquette_token` n'a pas de `default`
-- (il est produit par `assurer_jetons_plaquette`, à la demande), donc
-- les 42 lignes existantes n'héritent d'aucune URL de plaquette qu'on
-- n'a jamais préparée. `plaquette_vues` a un défaut constant, chemin
-- rapide lui aussi.
--
-- Tout est ADDITIF : aucune colonne existante n'est touchée, aucune
-- ligne supprimée. Rollback en fin de fichier.
--
-- EFFET DE BORD CONNU, MESURÉ, ET DÉLIBÉRÉMENT NON CORRIGÉ
-- Préparer une plaquette pour une entreprise qui n'a pas encore de ligne
-- en CRÉE une, et `token` comme `actif` prennent alors leur défaut : elle
-- repart donc avec un jeton de rapport d'audit actif, pour un audit qui
-- n'existe pas. Sur les 300 de la cohorte B, le compteur « rapports
-- actifs » passera de 7 à ~300 — tout écran qui l'affiche dira une chose
-- fausse.
--
-- Ce n'est PAS une fuite : le moteur de séquences refuse déjà une étape
-- qui promet `{{company.audit_url}}` à une entreprise sans mesures
-- (`etapePromettantUnAuditAbsent`, src/lib/automations/engine.ts:518), et
-- personne d'autre ne distribue cette URL.
--
-- Et forcer `actif = false` à l'insertion serait PIRE : `assurerJetonRapport`
-- rend la ligne existante sans jamais la réactiver, donc une entreprise de
-- la cohorte B à qui on ferait un vrai audit plus tard ne pourrait plus le
-- partager du tout. On échangerait un compteur faux contre un document
-- impossible à envoyer.
-- =====================================================================

begin;

alter table public.entreprises_rapport_public
  add column if not exists plaquette_token   text,
  add column if not exists plaquette_cree_le timestamptz,
  add column if not exists plaquette_vues    int not null default 0,
  add column if not exists plaquette_vu_le   timestamptz;

comment on column public.entreprises_rapport_public.plaquette_token is
  'Jeton de la plaquette (document générique de la cohorte sans site). Null = aucune plaquette préparée pour cette entreprise. Distinct de `token`, qui ouvre le rapport d''audit.';
comment on column public.entreprises_rapport_public.plaquette_cree_le is
  'Quand la plaquette a été préparée — pas quand la ligne a été créée : une entreprise peut avoir un jeton de rapport depuis des semaines.';
comment on column public.entreprises_rapport_public.plaquette_vues is
  'Compteur d''ouvertures de la plaquette. Séparé de `vues` : « il a ouvert le rapport trois fois » et « il a ouvert la plaquette trois fois » n''appellent pas la même relance, et confondus ils ne veulent plus rien dire.';

-- Partiel, et c'est ce qui rend la colonne utilisable : `unique` accepte
-- autant de NULL qu'on veut, mais un index plein indexerait aussi les
-- lignes sans plaquette. Le prédicat est impliqué par la recherche
-- `where plaquette_token = $1`, donc l'index sert bien la page publique.
create unique index if not exists entreprises_rapport_public_plaquette_token_idx
  on public.entreprises_rapport_public (plaquette_token)
  where plaquette_token is not null;

-- ─────────────────────────────────────────────────────────────────────
-- Préparer les jetons d'un LOT, sans jamais en créer deux
-- ─────────────────────────────────────────────────────────────────────
-- POURQUOI EN SQL. L'action de masse traite une sélection entière — 300
-- entreprises le 20 août. En TypeScript il faudrait lire, trier, écrire :
-- trois allers-retours et une fenêtre pendant laquelle deux agents qui
-- cliquent en même temps produisent deux jetons pour la même entreprise,
-- dont un envoyé à personne. `on conflict` ferme la fenêtre, et le
-- `coalesce` est ce qui rend l'appel REJOUABLE : un jeton déjà posé n'est
-- jamais remplacé, donc un lien déjà envoyé par WhatsApp ne meurt pas
-- parce qu'on a recliqué sur le bouton.
--
-- `deja_prete` sort de la même requête que l'écriture : c'est ce qui
-- permet à l'écran d'annoncer « 12 créées, 288 déjà prêtes » sans une
-- seconde lecture qui, elle, verrait déjà l'état d'après.
--
-- La jointure sur `entreprises` n'est pas décorative : sans elle, un
-- identifiant disparu entre l'affichage du board et le clic viole la
-- clé étrangère et fait échouer LE LOT ENTIER. Avec elle, la ligne
-- manque simplement du résultat, et l'appelant la signale seule.
create or replace function public.assurer_jetons_plaquette(
  p_entreprise_ids bigint[],
  p_cree_par uuid default null
)
returns table (entreprise_id bigint, jeton text, deja_prete boolean)
language sql
security definer
-- `extensions` EST OBLIGATOIRE ICI, et son absence ne se voit qu'à
-- l'exécution : pgcrypto est installé dans ce schéma sur Supabase, donc
-- `gen_random_bytes` reste introuvable avec `search_path = public` seul.
-- Le `default` de la colonne `token`, lui, s'en passe — une expression de
-- défaut garde la référence résolue au moment du CREATE TABLE, alors que
-- le corps d'une fonction est résolu à l'appel, sous CE search_path.
set search_path = public, extensions
as $$
  with vise as (
    select distinct e.id
      from unnest(p_entreprise_ids) as demande(id)
      join public.entreprises e on e.id = demande.id
  ),
  -- Les CTE d'une même requête voient le MÊME instantané : `avant` lit
  -- donc bien l'état d'avant l'écriture, même si `ecrit` s'exécute.
  avant as (
    select r.entreprise_id as id
      from public.entreprises_rapport_public r
     where r.entreprise_id in (select v.id from vise v)
       and r.plaquette_token is not null
  ),
  ecrit as (
    insert into public.entreprises_rapport_public as r
           (entreprise_id, cree_par, plaquette_token, plaquette_cree_le)
    select v.id, p_cree_par, encode(gen_random_bytes(16), 'hex'), now()
      from vise v
    on conflict (entreprise_id) do update
       set plaquette_token   = coalesce(r.plaquette_token, excluded.plaquette_token),
           plaquette_cree_le = coalesce(r.plaquette_cree_le, excluded.plaquette_cree_le)
    returning r.entreprise_id as id, r.plaquette_token as jeton
  )
  select e.id, e.jeton, exists (select 1 from avant a where a.id = e.id)
    from ecrit e;
$$;

comment on function public.assurer_jetons_plaquette(bigint[], uuid) is
  'Prépare le jeton de plaquette d''un lot d''entreprises. Idempotente : un jeton existant n''est jamais remplacé. Rend `deja_prete` pour distinguer créées et déjà prêtes.';

-- ─────────────────────────────────────────────────────────────────────
-- Le compteur d'ouvertures
-- ─────────────────────────────────────────────────────────────────────
-- Atomique et en SQL, pour la même raison que `rapport_public_vu` : deux
-- ouvertures simultanées perdraient une vue en lecture-modification-
-- écriture, et ce chiffre décide d'une relance.
--
-- SANS `and actif`, DÉLIBÉRÉMENT, et c'est la différence de fond avec le
-- rapport. `actif` protège un document qui NOMME une entreprise et lui
-- attribue une note ; la plaquette est le même dépliant commercial pour
-- les trois cents, sans une donnée client dedans. Il n'y a rien à
-- révoquer, donc rien à contrôler ici — et une entreprise dont le
-- rapport a été coupé (35 des 42 lignes) continue de compter ses
-- ouvertures de plaquette, ce qui est exactement ce qu'on veut mesurer.
create or replace function public.plaquette_vue(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.entreprises_rapport_public
     set plaquette_vues  = plaquette_vues + 1,
         plaquette_vu_le = now()
   where plaquette_token = p_token;
$$;

comment on function public.plaquette_vue(text) is
  'Incrémente le compteur d''ouvertures d''une plaquette. Un jeton inconnu ne met rien à jour : la page publique n''a pas à savoir si le jeton existe.';

-- `security definer` sans garde de rôle laisserait `anon` appeler ces
-- fonctions par PostgREST — donc insérer des lignes pour n'importe quel
-- identifiant d'entreprise. Les deux appelants réels (la route agent et
-- la page publique) passent par la clé de service ; l'écran admin, lui,
-- est authentifié. Personne n'a besoin d'`anon`.
revoke execute on function public.assurer_jetons_plaquette(bigint[], uuid) from public;
grant  execute on function public.assurer_jetons_plaquette(bigint[], uuid) to authenticated, service_role;
revoke execute on function public.plaquette_vue(text) from public;
grant  execute on function public.plaquette_vue(text) to authenticated, service_role;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────
-- Ce fichier a été joué en blanc sur la base de production le 16/08 —
-- tout dans une transaction annulée. Observé : 3 identifiants demandés
-- dont un inexistant ⇒ 2 lignes rendues sans échec du lot ; premier
-- appel `deja_prete` faux, second appel `deja_prete` vrai avec LE MÊME
-- jeton ; un identifiant en double ne produit qu'une ligne ; jeton de
-- 32 caractères ; `plaquette_vue` sur un jeton inconnu ne compte rien ;
-- `token` et `actif` du rapport inchangés.
--
-- Aucune plaquette préparée par la migration elle-même (attendu : 0) :
-- select count(*) from public.entreprises_rapport_public
--  where plaquette_token is not null;
--
-- Les jetons de rapport n'ont pas bougé (attendu : 42 dont 7 actifs) :
-- select count(*) total, count(*) filter (where actif) actifs
--   from public.entreprises_rapport_public;
--
-- Rejouer un lot ne crée jamais un second jeton (attendu : deja_prete
-- faux au 1er appel, vrai au 2e, et le MÊME jeton les deux fois) :
-- select * from public.assurer_jetons_plaquette(array[<id>]::bigint[]);
-- select * from public.assurer_jetons_plaquette(array[<id>]::bigint[]);

-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK — retire la plaquette sans toucher au rapport d'audit
-- ─────────────────────────────────────────────────────────────────────
-- drop function if exists public.plaquette_vue(text);
-- drop function if exists public.assurer_jetons_plaquette(bigint[], uuid);
-- drop index if exists public.entreprises_rapport_public_plaquette_token_idx;
-- alter table public.entreprises_rapport_public
--   drop column if exists plaquette_token,
--   drop column if exists plaquette_cree_le,
--   drop column if exists plaquette_vues,
--   drop column if exists plaquette_vu_le;
-- -- Les liens déjà envoyés cessent alors de s'ouvrir sur une plaquette
-- -- nominative ; `/plaquette` sans jeton, lui, continue de servir.
