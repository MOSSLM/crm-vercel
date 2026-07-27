-- Attribution des prospects : `entreprises.owner_id` fait autorité.
--
-- Problème réparé ici : l'admin lit les entreprises (`entreprises.owner_id`)
-- alors que le portail agent lit les affaires (`opportunites.owner_id`). Les
-- deux colonnes étaient écrites séparément par le retrait d'un prospect, donc
-- un retrait à moitié appliqué (erreur avalée, écriture directe en SQL,
-- policy RLS « freelance update own or claim ») laissait l'affaire attribuée :
-- 0 entreprise côté admin, une carte fantôme dans le pipeline de l'agent, et
-- un bouton « Retirer » devenu inopérant.
--
-- 1. remise à plat des lignes déjà désynchronisées
-- 2. trigger qui fait suivre les affaires à chaque changement de propriétaire
--
-- À exécuter dans l'éditeur SQL Supabase. Idempotent.

-- 1. Rattrapage ---------------------------------------------------------------

-- Les affaires suivent le propriétaire de leur entreprise (attribution comme
-- libération).
UPDATE public.opportunites o
   SET owner_id = e.owner_id
  FROM public.entreprises e
 WHERE o.entreprise_id = e.id
   AND o.owner_id IS DISTINCT FROM e.owner_id;

-- Affaire sans entreprise : plus rien ne peut justifier son attribution.
UPDATE public.opportunites
   SET owner_id = NULL
 WHERE entreprise_id IS NULL
   AND owner_id IS NOT NULL;

-- 2. Garde-fou permanent ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_sync_opportunite_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.opportunites
     SET owner_id = NEW.owner_id
   WHERE entreprise_id = NEW.id
     AND owner_id IS DISTINCT FROM NEW.owner_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_sync_opportunite_owner() IS
  'Propage entreprises.owner_id aux opportunites de l''entreprise : le portail '
  'agent (qui lit opportunites.owner_id) ne peut plus diverger de la vue admin '
  '(qui lit entreprises.owner_id), quelle que soit la voie d''écriture.';

DROP TRIGGER IF EXISTS entreprises_sync_opportunite_owner ON public.entreprises;
CREATE TRIGGER entreprises_sync_opportunite_owner
  AFTER UPDATE OF owner_id ON public.entreprises
  FOR EACH ROW
  WHEN (NEW.owner_id IS DISTINCT FROM OLD.owner_id)
  EXECUTE FUNCTION public.tg_sync_opportunite_owner();

-- Vérification : doit renvoyer 0 ligne.
-- SELECT o.id, o.owner_id AS deal_owner, e.owner_id AS company_owner
--   FROM public.opportunites o
--   LEFT JOIN public.entreprises e ON e.id = o.entreprise_id
--  WHERE o.owner_id IS DISTINCT FROM e.owner_id;
