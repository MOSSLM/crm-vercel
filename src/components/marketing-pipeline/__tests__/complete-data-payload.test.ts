import { changedFields, payloadFor, type EditedRow } from "../complete-data-payload";
import { EMPTY_REQUIRED_VALUES, type RequiredValues } from "../required-fields";

/**
 * Le danger de la grille tient en une ligne : elle n'affiche que les champs
 * requis, mais la fiche en porte trente. Un champ non saisi qui partirait quand
 * même dans le payload arriverait vide côté serveur — et l'enregistrement de
 * trois téléphones effacerait au passage trois adresses, e-mails et horaires.
 */

const enregistre = (over: Partial<RequiredValues> = {}): RequiredValues => ({
  ...EMPTY_REQUIRED_VALUES,
  name: "Plomberie Durand",
  ville: "Annecy",
  code_postal: "74000",
  telephone: "0450000000",
  service_tags: "plomberie",
  lm_override_city: "Annecy",
  lm_logo_url: "https://cdn/logo.png",
  lm_stat_years: "15",
  lm_stat_clients: "800",
  lm_stat_installations: "1200",
  ...over,
});

/** Une ligne dont on a modifié `saisi` par rapport à ce qui est en base. */
const row = (saisi: Partial<RequiredValues>): EditedRow => {
  const initial = enregistre();
  return { initial, values: { ...initial, ...saisi } };
};

describe("changedFields", () => {
  it("ne voit que ce qui a bougé", () => {
    expect(changedFields(row({ telephone: "0466000000" }))).toEqual(["telephone"]);
    expect(changedFields(row({}))).toEqual([]);
  });

  it("ne confond pas une valeur retapée à l'identique avec une modification", () => {
    expect(changedFields(row({ ville: "Annecy" }))).toEqual([]);
  });
});

describe("payloadFor", () => {
  it("rend null quand la ligne n'a pas été touchée — rien à envoyer", () => {
    expect(payloadFor(row({}))).toBeNull();
  });

  it("n'envoie QUE les champs modifiés", () => {
    expect(payloadFor(row({ telephone: "0466000000" }))).toEqual({
      company: { telephone: "0466000000" },
    });
  });

  it("ne mentionne pas le dossier lead magnet quand seule l'entreprise a bougé", () => {
    // Sinon le serveur chercherait — voire créerait — un dossier pour n'y rien
    // écrire.
    expect(payloadFor(row({ ville: "Chambéry" }))).not.toHaveProperty("project");
  });

  it("ne mentionne pas l'entreprise quand seul le dossier a bougé", () => {
    const payload = payloadFor(row({ lm_logo_url: "https://cdn/neuf.png" }));
    expect(payload).toEqual({ project: { logo_url: "https://cdn/neuf.png" } });
  });

  it("traduit les noms du formulaire en noms de colonnes", () => {
    expect(
      payloadFor(
        row({ lm_override_city: "Chambéry", lm_stat_years: "20", lm_stat_installations: "1500" }),
      ),
    ).toEqual({
      project: {
        override_city: "Chambéry",
        stat_years_experience: "20",
        stat_installations_completed: "1500",
      },
    });
  });

  it("envoie les service tags en tableau, blancs retirés", () => {
    expect(payloadFor(row({ service_tags: " plomberie ,, chauffage " }))).toEqual({
      company: { service_tags: ["plomberie", "chauffage"] },
    });
  });

  /**
   * `Number("")` rend 0 : sans ce garde, effacer une note afficherait une note
   * de zéro sur le site au lieu de n'en afficher aucune.
   */
  it("envoie NULL — et non 0 — pour une note effacée", () => {
    const withNote = { initial: enregistre({ note_moyenne: "4.8" }), values: enregistre({ note_moyenne: "" }) };
    expect(payloadFor(withNote)).toEqual({ company: { note_moyenne: null } });
  });

  it("envoie la note en nombre quand elle est saisie", () => {
    expect(payloadFor(row({ note_moyenne: "4.8" }))).toEqual({ company: { note_moyenne: 4.8 } });
  });

  it("rassemble les deux côtés quand la ligne touche aux deux", () => {
    expect(payloadFor(row({ code_postal: "73000", lm_stat_clients: "900" }))).toEqual({
      company: { code_postal: "73000" },
      project: { stat_satisfied_clients: "900" },
    });
  });
});
