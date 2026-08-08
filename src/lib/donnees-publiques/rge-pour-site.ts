/**
 * Ce que le rendu d'un site démo doit savoir des qualifications RGE.
 *
 * Un seul lecteur pour les deux résolveurs de variables (aperçu éditeur et
 * publication) : c'est ce qui garantit qu'un logo affiché à l'aperçu est le même
 * que celui mis en ligne. Deux implémentations divergeraient, et la divergence
 * se verrait sur le site public.
 *
 * On ne lit QUE des faits vérifiés : `entreprises.siret` dit si la question peut
 * être posée, `entreprises_donnees_publiques.rge_rafraichi_le` dit si elle l'a
 * ÉTÉ, et les qualifications non retirées disent la réponse. Les trois sont
 * nécessaires — cf. `rge-compteur.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logosDistincts, type LogoRge } from "./rge-logos";
import type { EtatVerificationRge } from "./rge-compteur";

export type RgePourSite = {
  etat: EtatVerificationRge;
  /** Logos DISTINCTS des qualifications encore valides, prêts pour le tweak. */
  logos: LogoRge[];
};

/** Une qualification expirée ne compte plus et n'affiche plus de logo. */
const encoreValide = (dateFin: string | null, aujourdhui: string): boolean =>
  !dateFin || dateFin >= aujourdhui;

/**
 * Charge l'état RGE d'une entreprise.
 *
 * Best-effort : si les tables du socle n'existent pas encore (migration non
 * appliquée), on rend un état « rien de vérifié » plutôt que de faire échouer le
 * rendu d'un site. Conséquence assumée : la valeur saisie reste affichée, ce qui
 * est le comportement d'avant ce chantier.
 */
export const chargerRgePourSite = async (
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<RgePourSite> => {
  const aucun: RgePourSite = {
    etat: { aSiret: false, rgeInterroge: false, qualificationsValides: 0 },
    logos: [],
  };

  try {
    const [ent, pub, quals] = await Promise.all([
      sb.from("entreprises").select("siret").eq("id", entrepriseId).maybeSingle(),
      sb
        .from("entreprises_donnees_publiques")
        .select("rge_rafraichi_le")
        .eq("entreprise_id", entrepriseId)
        .maybeSingle(),
      sb
        .from("entreprise_rge_qualifications")
        .select("nom_certificat, date_fin")
        .eq("entreprise_id", entrepriseId)
        .is("retiree_le", null),
    ]);

    const aSiret = Boolean((ent.data as { siret?: string | null } | null)?.siret);
    const rgeInterroge = Boolean(
      (pub.data as { rge_rafraichi_le?: string | null } | null)?.rge_rafraichi_le,
    );

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const valides = ((quals.data ?? []) as Array<{ nom_certificat: string | null; date_fin: string | null }>)
      .filter((q) => encoreValide(q.date_fin, aujourdhui));

    return {
      etat: { aSiret, rgeInterroge, qualificationsValides: valides.length },
      // Les logos ne sortent que du VÉRIFIÉ : sans interrogation de l'ADEME, on
      // n'a rien à montrer, même si des qualifications traînaient d'un ancien
      // passage.
      logos: aSiret && rgeInterroge ? logosDistincts(valides) : [],
    };
  } catch {
    return aucun;
  }
};
