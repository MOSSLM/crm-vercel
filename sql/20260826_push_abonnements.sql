-- Les abonnements aux notifications poussées.
--
-- POURQUOI CETTE TABLE MAINTENANT
-- `notifications` existe depuis des mois, est écrite par trois appelants
-- (`booking.ts`, `bounce-guard.ts`, `notificationsApi`) — et n'est LUE que par
-- un panneau qu'il faut penser à ouvrir. Autrement dit : le CRM sait déjà
-- fabriquer l'information « il s'est passé quelque chose », et n'a jamais eu de
-- moyen de la faire arriver. Un service worker abonné est ce moyen ; cette table
-- est son carnet d'adresses.
--
-- ── UN ABONNEMENT EST UN APPAREIL, PAS UNE PERSONNE ──────────────────────
-- Le même compte en produit un par navigateur et par téléphone. `endpoint` est
-- ce qui les distingue et c'est donc lui la clé naturelle : on ne sait pas
-- nommer un appareil autrement (l'`agent` est indicatif, deux Chrome sur deux
-- machines rendent la même chaîne). Un `unique` sur `endpoint` fait qu'un
-- réabonnement écrase au lieu d'empiler.
--
-- ── POURQUOI `echecs` ────────────────────────────────────────────────────
-- Un endpoint révoqué répond 404 ou 410, et pour toujours. Sans compteur, on
-- pousserait vers lui à chaque notification jusqu'à la fin des temps, sans
-- qu'aucune erreur ne remonte à personne — le mode de panne exact des systèmes
-- de push mal tenus. Cinq échecs et l'abonnement sort de l'index de lecture.
--
-- ── LA POLITIQUE RLS EST VOLONTAIREMENT PLUS STRICTE QUE LE RESTE ────────
-- Le projet ouvre l'essentiel de ses tables à tout compte `authenticated`
-- (cf. `docs/site-builder/securite-et-exploitation.md`). Ici, non : un
-- abonnement lisible par tous permettrait d'envoyer une notification à
-- n'importe qui sous la marque du CRM. Chacun ne voit que ses appareils.
begin;

create table if not exists public.push_abonnements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  agent       text,
  cree_le     timestamptz not null default now(),
  dernier_ok  timestamptz,
  echecs      smallint not null default 0
);

-- L'index porte la condition de lecture : on ne pousse jamais vers un
-- abonnement déjà mort cinq fois.
create index if not exists push_abonnements_user_idx
  on public.push_abonnements (user_id)
  where echecs < 5;

alter table public.push_abonnements enable row level security;

drop policy if exists push_abonnements_proprietaire on public.push_abonnements;
create policy push_abonnements_proprietaire on public.push_abonnements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.push_abonnements is
  'Un appareil abonné aux notifications poussées. Clé naturelle : endpoint.';

commit;
