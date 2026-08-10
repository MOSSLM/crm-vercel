-- =====================================================================
-- Le dossier PageSpeed : ce que Google a dit, mis de côté pour l'audit
-- =====================================================================
--
-- POURQUOI UNE TABLE À PART, ET PAS DES COLONNES DE PLUS.
--
-- `entreprises_audit_site` est lue par lots — le pipeline en charge trente
-- lignes en `select *` pour afficher un badge par entreprise. Y loger le dossier
-- PageSpeed, qui pèse de 20 à 150 Ko par site (les constats, leurs conseils, et
-- les ressources nommées une par une), ferait descendre plusieurs mégaoctets à
-- chaque ouverture d'écran pour n'afficher qu'une pastille de couleur.
--
-- Ici, le dossier ne se charge QUE quand on prépare un audit — un `join` qu'on
-- ne fait jamais par accident. C'est la même raison qui veut qu'on ne mette pas
-- les pièces jointes dans la table des messages.
--
-- CE QUE CETTE TABLE N'EST PAS : l'audit. C'est la matière première, le dossier
-- d'instruction. Le prospect ne voit que ce qu'on en retient ; la rédaction, elle,
-- a le droit d'y puiser en entier — et c'est précisément ce qu'on veut, parce que
-- c'est là que se trouvent les phrases que Google écrit et que nous ne pourrions
-- pas inventer : « ces requêtes bloquent l'affichage », « 1 040 Kio de JavaScript
-- inutilisé sur cette page ».
--
-- Un enregistrement par entreprise, écrasé à chaque nouvelle mesure : on ne garde
-- pas d'historique, la mesure la plus récente est la seule qui décrive le site tel
-- qu'il est aujourd'hui.
--
-- Idempotente.
-- =====================================================================

begin;

create table if not exists public.entreprises_audit_psi (
  entreprise_id      bigint primary key references public.entreprises(id) on delete cascade,

  -- L'URL RÉELLEMENT mesurée — celle que l'analyseur a atteinte après
  -- redirections. Sans elle, on ne peut pas savoir si le dossier porte bien sur
  -- la page qu'on montre au prospect.
  url                text,
  strategie          text not null default 'mobile',
  version_lighthouse text,

  -- Les quatre notes de Google : performance, seo, accessibility, best-practices.
  categories         jsonb not null default '{}'::jsonb,
  -- LCP, CLS, TBT, Speed Index… avec la valeur telle que Google l'affiche.
  metriques          jsonb not null default '[]'::jsonb,
  -- Les audits en échec : titre français, valeur, gain estimé, conseil, et les
  -- ressources visées. C'est le cœur de la table.
  constats           jsonb not null default '[]'::jsonb,
  -- Les identifiants des audits qui passent : de quoi ne pas reprocher à
  -- quelqu'un ce qu'il fait déjà bien.
  reussis            jsonb not null default '[]'::jsonb,

  recupere_le        timestamptz not null default now(),
  maj_le             timestamptz not null default now()
);

comment on table public.entreprises_audit_psi is
  'Dossier PageSpeed Insights par entreprise : matière première de la rédaction d''audit, jamais affichée telle quelle.';
comment on column public.entreprises_audit_psi.constats is
  'Audits Lighthouse en échec, triés par gain décroissant, avec le conseil de Google et les ressources visées.';

-- Retrouver les dossiers à rafraîchir sans parcourir la table.
create index if not exists idx_audit_psi_recupere_le
  on public.entreprises_audit_psi (recupere_le desc);

-- ---------------------------------------------------------------------
-- RLS — comme les tables voisines
-- ---------------------------------------------------------------------
alter table public.entreprises_audit_psi enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entreprises_audit_psi'
      and policyname = 'audit_psi_authenticated'
  ) then
    create policy audit_psi_authenticated on public.entreprises_audit_psi
      for all using (auth.role() = 'authenticated');
  end if;
end $$;

commit;

-- Contrôle après application :
--   select entreprise_id, url, recupere_le,
--          categories->>'performance' as perf,
--          jsonb_array_length(constats) as nb_constats,
--          pg_size_pretty(length(constats::text)::bigint) as poids_constats
--   from public.entreprises_audit_psi
--   order by recupere_le desc limit 10;
