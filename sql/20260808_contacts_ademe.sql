-- Coordonnées déclarées par l'entreprise à son organisme certificateur.
--
-- POURQUOI UNE TABLE À PART
-- Mesuré sur les 50 entreprises du parc qui ont des qualifications RGE :
-- l'ADEME fournit un email pour 50/50, et on en avait déjà un pour 50/50. Le
-- gain en ADRESSES NOUVELLES est donc NUL. En revanche 21 sur 50 DIVERGENT, et
-- le motif est net : nous avons l'adresse de façade (`contact@`), l'ADEME a
-- l'adresse de la personne qui a monté le dossier de certification
-- (`nathalie@solvac.fr`, `n.ruffin@emr-solutions.fr`, `administratif@ami-elec.fr`).
--
-- Ce n'est donc pas « un email de plus », c'est un email d'un AUTRE TYPE :
-- nominatif, et qui atterrit chez quelqu'un plutôt que dans une boîte générique.
-- Décider quoi en faire — créer un contact nommé, ajouter une adresse
-- secondaire, ignorer — demande un jugement que du code déterministe rendrait
-- mal. On stocke le fait ; un agent tranchera.
--
-- CE QU'ELLE NE FAIT PAS : elle n'écrit ni `entreprises.email`, ni `contacts`.
-- Même principe que le reste du socle — l'hydratation ne touche pas au saisi
-- humain, et ici la séparation est physique.
--
-- On stocke TOUJOURS, pas seulement quand ça diverge : « divergent » se calcule
-- par rapport à notre email, qui bouge ; le fait ADEME, lui, est stable.
--
-- Les 31 fiches du parc sans aucun email n'ont, elles, AUCUNE qualification RGE :
-- elles ne figurent pas dans le jeu ADEME, il n'y a rien à y récupérer pour
-- elles. L'espoir de §C6 de la passation est donc nul sur ce parc.

create table if not exists public.entreprise_contacts_ademe (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,

  -- Le SIRET porteur : avec le joker SIREN, deux établissements peuvent
  -- déclarer des coordonnées différentes.
  siret         text not null,

  email          text,
  telephone      text,
  site_internet  text,
  -- Le nom tel que l'ADEME le porte, parfois plus parlant que le nôtre.
  nom_entreprise text,

  premiere_vue_le timestamptz not null default now(),
  derniere_vue_le timestamptz not null default now(),

  -- Renseigné par l'agent qui exploitera ces lignes : 'contact_cree',
  -- 'ajoute_a_entreprise', 'ignore'… Laissé libre, c'est lui qui le définira.
  traite_le      timestamptz,
  traitement     text,

  created_at    timestamptz not null default now()
);

-- Une adresse par entreprise, quel que soit le nombre de lignes ADEME qui la
-- répètent (elle figure sur chaque qualification).
create unique index if not exists eca_email_unique
  on public.entreprise_contacts_ademe (entreprise_id, lower(email))
  where email is not null;

create index if not exists eca_a_traiter_idx
  on public.entreprise_contacts_ademe (entreprise_id) where traite_le is null;

comment on table public.entreprise_contacts_ademe is
  'Email/téléphone/site déclarés par l''entreprise à son certificateur (source ADEME). Gain en adresses nouvelles nul sur le parc actuel, mais 21 divergences sur 50 : nous avons contact@, l''ADEME a la personne. Matière première pour un agent de tri — n''écrit jamais entreprises.email ni contacts.';

alter table public.entreprise_contacts_ademe enable row level security;

drop policy if exists "staff read eca" on public.entreprise_contacts_ademe;
create policy "staff read eca" on public.entreprise_contacts_ademe
  for select using (public.is_staff());
