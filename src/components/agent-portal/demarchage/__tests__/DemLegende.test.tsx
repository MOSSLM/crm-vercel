import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemLegende } from "../DemLegende";
import { COHORTE_INFO, COHORTE_ORDER } from "../cohortes";
import { SIGNAL_ORDER, SIGNAL_TAG } from "@/lib/agent-portal/demarchage-buckets";
import { ETAT_DEMO_AIDE, ETAT_DEMO_ORDER, ETAT_DEMO_TAG } from "@/lib/agent-portal/etat-demo";
import { ETAT_SITE_ORDER, ETAT_SITE_TAG } from "@/lib/agent-portal/etat-site";

/**
 * CE QUE CE FICHIER TIENT : la couture entre la ligne de file et sa légende.
 *
 * Une légende incomplète est pire qu'une absence de légende — on lui fait
 * confiance. Le risque n'est pas qu'elle se trompe aujourd'hui, c'est qu'on
 * ajoute demain un état à `ETAT_SITE_*`, un signal ou une cohorte, et que la
 * bulle continue d'en montrer trois sur quatre sans que rien ne le signale.
 *
 * Les cas ci-dessous PARCOURENT donc les constantes plutôt que d'écrire les
 * libellés en dur : une valeur ajoutée à l'un des `Record` fait tomber le test
 * tant qu'elle n'est pas expliquée.
 */

/** Ouvre la bulle — c'est le geste réel : elle est fermée au départ. */
function ouvrir() {
  const vue = render(<DemLegende />);
  fireEvent.click(screen.getByRole("button", { name: /Légende/ }));
  return {
    ...vue,
    bulle: screen.getByRole("dialog", { name: /Légende/ }),
  };
}

describe("DemLegende — la bulle qui explique la file", () => {
  it("reste fermée tant qu'on ne la demande pas", () => {
    render(<DemLegende />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se ferme sur Échap — sinon elle couvre la liste qu'elle explique", () => {
    ouvrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explique CHAQUE état de notre démo, celui qui ne s'écrit pas compris", () => {
    const { bulle } = ouvrir();
    for (const etat of ETAT_DEMO_ORDER) {
      // La phrase d'aide est la même que celle de l'infobulle du liseré.
      expect(within(bulle).getByText(ETAT_DEMO_AIDE[etat])).toBeInTheDocument();
      // Et l'échantillon du trait est là même quand aucun mot ne l'accompagne :
      // c'est le seul repère de « aucune », qui n'écrit rien sur la ligne.
      expect(bulle.querySelector(`.sw[data-demo="${etat}"]`)).not.toBeNull();
      const tag = ETAT_DEMO_TAG[etat];
      if (tag) expect(within(bulle).getByText(tag)).toBeInTheDocument();
    }
  });

  it("explique chaque état du site du prospect", () => {
    const { bulle } = ouvrir();
    for (const etat of ETAT_SITE_ORDER) {
      expect(within(bulle).getByText(ETAT_SITE_TAG[etat])).toBeInTheDocument();
    }
  });

  it("explique chaque signal et chaque cohorte", () => {
    const { bulle } = ouvrir();
    for (const s of SIGNAL_ORDER) {
      expect(within(bulle).getByText(SIGNAL_TAG[s])).toBeInTheDocument();
    }
    for (const c of COHORTE_ORDER) {
      // « classé sans site » apparaît DEUX fois : le classement, et sa version
      // démentie par la fiche du jour. C'est la combinaison la plus fréquente
      // de la file, elle a droit à sa propre entrée.
      expect(within(bulle).getAllByText(COHORTE_INFO[c].court).length).toBeGreaterThan(0);
    }
    expect(bulle.querySelector('.st.coh[data-perime="1"]')).not.toBeNull();
  });

  it("montre les VRAIES étiquettes, pas une recopie de leurs couleurs", () => {
    // C'est toute la mécanique : les échantillons portent les mêmes classes et
    // les mêmes `data-*` que la ligne de file, donc la MÊME règle CSS les
    // peint. Une légende qui redéclarerait ses teintes mentirait au premier
    // changement — et on ne s'en apercevrait jamais.
    const { bulle } = ouvrir();
    expect(bulle.querySelector('.st.site[data-site="absent"]')).not.toBeNull();
    expect(bulle.querySelector('.st.sig[data-sig="hot"]')).not.toBeNull();
    expect(bulle.querySelector('.st.coh[data-coh="B_sans_site"]')).not.toBeNull();
    expect(bulle.querySelector('.st.demo[data-demo="prete"]')).not.toBeNull();
    expect(bulle.querySelector(".st.mob")).not.toBeNull();
    expect(bulle.querySelector(".st.late")).not.toBeNull();
  });
});
