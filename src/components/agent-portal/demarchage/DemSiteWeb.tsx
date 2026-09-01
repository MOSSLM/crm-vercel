"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { Icon } from "./DemIcon";
import {
  ETAT_SITE_AIDE,
  ETAT_SITE_LABEL,
  normaliserUrlSite,
  type EtatSite,
} from "@/lib/agent-portal/etat-site";

/**
 * LA LIGNE « SITE » DE L'EN-TÊTE — la seule du CRM où un humain tranche.
 *
 * POURQUOI EN HAUT, ET TOUJOURS VISIBLE
 * Le dossier de l'en-tête est replié par défaut, et pour une bonne raison : sur
 * un 13 pouces, la carte d'action passait sous la ligne de flottaison. Cette
 * ligne-ci y échappe, parce qu'elle n'est pas de la documentation — c'est un
 * GESTE, et il se fait pendant que ça sonne. On cherche le nom sur Google en
 * composant le numéro, on voit en trois secondes s'il y a un site, et jusqu'ici
 * cette information mourait avec l'appel.
 *
 * TROIS BOUTONS, TROIS INTENTIONS QUI NE SE MÉLANGENT PAS
 *   · GOOGLE ouvre un onglet, et rien d'autre. Le CRM sait chercher tout seul
 *     (`scripts/prospection/`) et bute sur le CAPTCHA — un humain qui clique est
 *     la seule méthode qui marche, c'est écrit dans CLAUDE.md.
 *   · ENREGISTRER n'apparaît que si l'adresse a changé : un bouton toujours
 *     actif se clique par réflexe, et chaque clic pose un constat de plus dans
 *     une table append-only.
 *   · « IL N'A AUCUN SITE » est une CASE, pas un bouton, parce que c'est un état
 *     qu'on lit autant qu'on le pose. Déjà constatée, elle est cochée et
 *     verrouillée : la table ne se dédit pas, on revient dessus en saisissant
 *     une adresse. Et elle est refusée tant que le champ contient quelque
 *     chose — « il n'a pas de site » et « voici son site » ne peuvent pas être
 *     vrais en même temps.
 *
 * L'écran ne calcule aucun verdict : il affiche celui que la route rend
 * (`etatSiteDe`), pour que la file, l'en-tête et la base ne puissent pas se
 * contredire.
 */
export function DemSiteWeb({
  entrepriseId,
  nom,
  ville,
  url,
  etatSite,
  constateLe,
  onEnregistre,
}: {
  entrepriseId: number;
  nom: string | null;
  ville: string | null;
  /** L'adresse en base, `null` si la fiche n'en porte aucune. */
  url: string | null;
  etatSite: EtatSite;
  /** Quand le dernier constat a été posé — `null` si personne n'a jamais tranché. */
  constateLe: string | null;
  /** Rejoue la fiche ET la file : l'étiquette de la ligne vient de la seconde. */
  onEnregistre: () => void;
}) {
  const [saisie, setSaisie] = useState(url ?? "");
  const [busy, setBusy] = useState(false);

  // Changer de prospect remet le champ à ce que porte SA fiche. Sans ça,
  // l'adresse du précédent reste à l'écran et se ferait enregistrer sur le
  // suivant au premier clic.
  useEffect(() => {
    setSaisie(url ?? "");
  }, [entrepriseId, url]);

  const propre = saisie.trim();
  const modifie = propre !== (url ?? "").trim();
  const dejaAbsent = etatSite === "absent";

  const envoyer = async (corps: Record<string, unknown>, succes: string) => {
    setBusy(true);
    try {
      const res = await authedFetch("/api/agent/demarchage/site", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entreprise_id: entrepriseId, ...corps }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Enregistrement impossible.");
        return;
      }
      toast.success(succes);
      onEnregistre();
    } catch {
      toast.error("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const enregistrer = () => {
    if (!normaliserUrlSite(propre)) {
      // Vérifié ici AUSSI (la route refuse de son côté) : le dire avant l'envoi
      // évite un aller-retour pour une faute de frappe qu'on voit à l'œil.
      toast.error("Cette adresse n'en est pas une — vérifiez la saisie.");
      return;
    }
    void envoyer({ url: propre }, "Site enregistré, et le constat avec.");
  };

  const declarerAucunSite = () => {
    void envoyer({ aucun_site: true }, "Noté : aucun site, vérifié par vous.");
  };

  /** La recherche que fait un humain — nom + ville, rien de plus malin. */
  const chercherSurGoogle = () => {
    const q = [nom, ville].filter(Boolean).join(" ").trim();
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const quand = constateLe
    ? new Intl.DateTimeFormat("fr-FR").format(new Date(constateLe))
    : null;

  return (
    <div className="dm-site" data-site={etatSite}>
      <Icon name="globe" className="ico-sm" />

      <input
        className="u"
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && modifie && propre) enregistrer();
        }}
        placeholder="aucune adresse connue"
        aria-label="Adresse du site de l'entreprise"
        spellCheck={false}
        disabled={busy}
      />

      <button
        type="button"
        className="btn outline xs"
        title={`Chercher « ${[nom, ville].filter(Boolean).join(" ")} » sur Google (nouvel onglet)`}
        onClick={chercherSurGoogle}
      >
        Google
      </button>

      {url && !modifie && (
        <a
          className="btn ghost xs icon"
          title="Ouvrir le site dans un nouvel onglet"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="ext" className="ico-xs" />
        </a>
      )}

      {modifie && propre && (
        <button type="button" className="btn sm ok" disabled={busy} onClick={enregistrer}>
          <Icon name="check" className="ico-xs" />
          Enregistrer
        </button>
      )}

      <label
        className="v"
        data-on={dejaAbsent ? "1" : undefined}
        data-off={!dejaAbsent && propre ? "1" : undefined}
        title={
          dejaAbsent
            ? `${ETAT_SITE_AIDE.absent}${quand ? ` Constaté le ${quand}.` : ""} Pour revenir dessus, saisissez une adresse.`
            : propre
              ? "Videz le champ d'abord : une adresse et « aucun site » ne peuvent pas être vrais en même temps."
              : "Cocher = « j'ai cherché, il n'a aucun site ». C'est ce constat-là qui le fait entrer dans le stock démarchable."
        }
      >
        <input
          type="checkbox"
          checked={dejaAbsent}
          // Verrouillée déjà cochée : la table des constats est append-only, on
          // ne se dédit pas — on repose un constat en saisissant une adresse.
          disabled={busy || dejaAbsent || propre !== ""}
          onChange={declarerAucunSite}
        />
        aucun site, vérifié
      </label>

      {/* L'état COURANT, en clair. Sans lui, une case décochée se lit « il a un
          site » alors qu'elle veut dire « on ne sait pas » — la confusion que
          tout ce travail sert à retirer. */}
      <span className="e" title={ETAT_SITE_AIDE[etatSite]}>
        {ETAT_SITE_LABEL[etatSite]}
        {quand && etatSite !== "inconnu" && <em> · {quand}</em>}
      </span>
    </div>
  );
}
