-- Le filtre « sans site » se calculait sur les 60 726 fiches, à chaque requête.
--
-- ── CE QUI A ÉTÉ MESURÉ ──────────────────────────────────────────────────
-- `chercher_entreprises(null, ['vivantes','sans_site'], …)` :
--
--     avant   6 461 ms pour résoudre les 34 633 identifiants
--     après     351 ms                       — 18×
--
--     avant   1 662 ms pour UNE page de 200
--     après     348 ms                       — 4,8×
--
-- Le second chiffre est le vrai sujet. `populationDesCriteres`
-- (`api/lissage/_lissage.ts`) pagine par 200 parce que la RPC plafonne là :
-- une passe de 2 000 fiches faisait donc DIX appels, chacun refaisant le
-- balayage complet et le tri. Vingt secondes pour créer une passe, sur une
-- route qui ne déclare aucun `maxDuration`. C'est ce qui rendait le lissage
-- impraticable depuis un téléphone — pas une limite de nature, un index absent.
--
-- ── POURQUOI CE PRÉDICAT-LÀ, ET LUI SEUL ─────────────────────────────────
-- Les autres drapeaux testent une colonne (`siret is null`,
-- `google_place_id is null`) : mesuré, `sans_siret` rend ses 2 579 lignes en
-- 60 ms par simple balayage. Rien à gagner, et un index de plus se paie à
-- chaque écriture. Le seul prédicat coûteux est celui-ci : trois
-- `regexp_replace`, un `split_part` et une comparaison de motif, par ligne.
--
-- `host_est_generique` et `host_key` sont `IMMUTABLE` (vérifié dans
-- `pg_proc`), condition sans laquelle un index d'expression est refusé.
--
-- ── L'INDEX EST PARTIEL, ET IL DOIT L'ÊTRE ───────────────────────────────
-- Il ne porte que les 34 633 lignes qui satisfont le prédicat — 776 ko contre
-- plusieurs mégaoctets pour un index complet. Le planificateur le reconnaît
-- bien qu'il inline `host_est_generique` dans la requête : vérifié au EXPLAIN,
-- « Bitmap Index Scan on entreprises_sans_site_idx ». Ce n'était pas acquis, et
-- c'est la raison pour laquelle le prédicat est recopié ICI mot pour mot depuis
-- `chercher_entreprises` : la moindre variation d'écriture et le planificateur
-- cesse de prouver l'implication, sans rien signaler — on retomberait à 6 s en
-- croyant avoir un index.
--
-- ⚠️ SI LE PRÉDICAT DE `chercher_entreprises` CHANGE (un domaine générique
-- ajouté à `host_est_generique`, par exemple), CET INDEX SE RECONSTRUIT SEUL —
-- il appelle la même fonction. Mais s'il change de FORME dans la fonction
-- (un `coalesce` déplacé, une colonne ajoutée), il faut le refaire ici. Le
-- contrôle tient en une ligne :
--
--   explain select id from public.chercher_entreprises(null, array['vivantes','sans_site'], '{}', 200, 0, null);
--
-- Si « Seq Scan » apparaît à la place de « Bitmap Index Scan », l'index a
-- décroché.
--
-- ⚠️ NE JAMAIS ÉPINGLER LE `search_path` DE `host_est_generique`, `host_key`
-- NI DE `chercher_entreprises`. C'est contre-intuitif, et un audit de sécurité
-- bien intentionné le fera un jour : les advisors Supabase signalent ces trois
-- fonctions en `function_search_path_mutable`, et le correctif habituel est un
-- `alter function … set search_path`.
--
-- Sauf qu'une fonction SQL portant une clause `SET` ne peut PLUS être inlinée
-- par le planificateur. Or c'est précisément l'inlining qui fait apparaître le
-- prédicat en clair dans la requête, donc qui permet à Postgres de prouver
-- qu'il implique celui de cet index partiel. Les épingler ferait disparaître
-- « Bitmap Index Scan on entreprises_sans_site_idx » du plan, et on retomberait
-- à 6 461 ms — sans aucun message, avec un index toujours présent et inutile.
--
-- Les fonctions que le projet épingle (`figer_lot_depuis_criteres`,
-- `entreprises_sans_plaquette`, `assurer_jetons_plaquette`) n'ont pas ce
-- problème : aucune n'a de prédicat à faire reconnaître par un index partiel.
--
-- ── CE QUE ÇA COÛTE ──────────────────────────────────────────────────────
-- Une évaluation du prédicat par écriture sur `entreprises`. Les bots qui
-- écrivent cette table font tous des appels HTTP par ligne ; un regex local est
-- sans commune mesure. Rien à archiver : un index ne touche à aucune donnée.
begin;

create index if not exists entreprises_sans_site_idx
  on public.entreprises (id)
  where merged_into_id is null
    and archived_at is null
    and public.host_est_generique(public.host_key(coalesce(site_web_canonique, canonical_url)));

comment on index public.entreprises_sans_site_idx is
  'Sert le filtre sans_site de chercher_entreprises (6 461 ms → 351 ms). Le prédicat doit rester identique à celui de la fonction, sinon le planificateur cesse de le reconnaître en silence.';

commit;
