import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SERVICE_TAGS_TAXONOMY,
  applyServiceTagMerge,
  isServiceTagKnownToTemplate,
  rewriteNestedServiceTag,
  serviceTagKey,
} from "../serviceTags";
import {
  SERVICE_TAGS_TAXONOMY as EDGE_TAXONOMY,
  serviceTagKey as edgeServiceTagKey,
} from "../../../edge function enrich/types";

/**
 * Les tags que le template de site reconnaît réellement, relevés dans les
 * `data-service-tag` / `data-svc` des skins et les noms de fichiers
 * `service-*.html`.
 *
 * Écrits ici en dur EXPRÈS : c'est la seule chose qui rende la taxonomie
 * vérifiable côté CRM, le template vivant dans des ZIP hors du dépôt. Deux
 * divergences ont déjà coûté des campagnes — le CRM disait « rénovation » quand
 * le template attend `renovation-generale`, et ignorait `bornes-irve` — et dans
 * les deux cas l'enrichissement masquait la page qu'il croyait remplir, sans
 * erreur nulle part.
 */
const TEMPLATE_TAG_KEYS = [
  "bornes-irve",
  "chauffage",
  "climatisation",
  "electricite",
  "photovoltaique",
  "plomberie",
  "pompe-a-chaleur",
  "renovation-generale",
  "ventilation",
];

describe("taxonomie alignée sur le template", () => {
  it("couvre exactement les tags du template, clé par clé", () => {
    expect([...SERVICE_TAGS_TAXONOMY].map(serviceTagKey).sort()).toEqual([...TEMPLATE_TAG_KEYS].sort());
  });

  it("reconnaît les tags du template et rejette un tag inventé", () => {
    for (const tag of SERVICE_TAGS_TAXONOMY) expect(isServiceTagKnownToTemplate(tag)).toBe(true);
    // Les deux graphies qui ont réellement cassé la production.
    expect(isServiceTagKnownToTemplate("rénovation")).toBe(false);
    expect(isServiceTagKnownToTemplate("désembouage")).toBe(false);
  });

  it("reconnaît un tag du template quelle que soit sa graphie", () => {
    expect(isServiceTagKnownToTemplate("renovation-generale")).toBe(true);
    expect(isServiceTagKnownToTemplate("Rénovation Générale")).toBe(true);
    expect(isServiceTagKnownToTemplate("bornes irve")).toBe(true);
  });

  /**
   * Deno ne peut pas importer le module du CRM : l'edge function garde ses
   * propres copies de la taxonomie ET de la clé canonique. On les importe ici
   * pour les comparer pour de vrai — une copie qu'aucun test ne compare est
   * exactement ce qui a dérivé la première fois.
   */
  it("reste identique à la copie de l'edge function d'enrichissement", () => {
    expect([...EDGE_TAXONOMY]).toEqual([...SERVICE_TAGS_TAXONOMY]);
  });

  /**
   * L'edge function comparait les tags à l'allowlist avec un simple
   * `trim().toLowerCase()`. Bloquer « Bornes IRVE » dans les Paramètres
   * n'arrêtait donc pas « bornes-irve » renvoyé par le LLM : le tag interdit
   * était écrit alors que l'écran l'affichait comme bloqué. Les deux clés
   * doivent coïncider sur tout ce qui distingue les deux graphies.
   */
  it("calcule la même clé canonique que l'edge function", () => {
    const cas = [
      ...SERVICE_TAGS_TAXONOMY,
      "Bornes IRVE",
      "bornes-irve",
      "BORNES   IRVE",
      "Rénovation générale",
      "renovation generale",
      "renovation-generale",
      "Pompe à chaleur",
      "pompe-a-chaleur",
      "électricité",
      "  Chauffage  ",
      "",
      "---",
    ];
    for (const c of cas) expect(edgeServiceTagKey(c)).toBe(serviceTagKey(c));
  });

  /**
   * La liste était aussi recopiée EN PROSE dans le system prompt du LLM. C'est
   * cette troisième copie qui a rendu le bug invisible : corriger la constante
   * ne changeait rien, le modèle lisait toujours l'ancienne liste.
   */
  it("n'est plus recopiée en clair dans le prompt du LLM", () => {
    const llm = readFileSync(
      join(__dirname, "..", "..", "..", "edge function enrich", "llm.ts"),
      "utf8",
    );
    const promptLine = llm
      .split("\n")
      .find((l) => l.includes("Pour les services : utilise UNIQUEMENT la taxonomie"));
    expect(promptLine).toBeDefined();
    expect(promptLine).toContain("SERVICE_TAGS_TAXONOMY.join");
  });
});

describe("applyServiceTagMerge", () => {
  it("remplace la source par la cible", () => {
    const { tags, changed } = applyServiceTagMerge(
      ["Climatisation", "rénovation"],
      ["rénovation"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Climatisation", "Rénovation générale"]);
    expect(changed).toBe(true);
  });

  it("fusionne sans créer de doublon quand la cible est déjà présente", () => {
    const { tags, changed } = applyServiceTagMerge(
      ["rénovation", "Rénovation générale", "Plomberie"],
      ["rénovation"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Rénovation générale", "Plomberie"]);
    expect(changed).toBe(true);
  });

  it("réunit plusieurs sources sur une seule cible", () => {
    const { tags } = applyServiceTagMerge(
      ["rénovation", "renovation generale", "RÉNOVATION"],
      ["rénovation", "renovation generale"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Rénovation générale"]);
  });

  it("attrape toutes les graphies de la source, accents et tirets compris", () => {
    const { tags } = applyServiceTagMerge(
      ["pompe-a-chaleur", "POMPE À CHALEUR"],
      ["pompe à chaleur"],
      "Pompe à chaleur",
    );
    expect(tags).toEqual(["Pompe à chaleur"]);
  });

  /**
   * Même clé canonique, graphies différentes. La fusion doit pouvoir servir de
   * normalisation : sans ça, un parc où trois graphies du même tag cohabitent
   * reste en désordre et `collectServiceTags` arbitre au hasard laquelle
   * s'affiche.
   */
  it("normalise une graphie même quand la clé canonique ne change pas", () => {
    const { tags, changed } = applyServiceTagMerge(
      ["renovation-generale", "Plomberie"],
      ["renovation-generale"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Rénovation générale", "Plomberie"]);
    expect(changed).toBe(true);
  });

  it("aligne la cible sur sa graphie de référence même hors sélection", () => {
    const { tags } = applyServiceTagMerge(
      ["renovation generale", "rénovation"],
      ["rénovation"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Rénovation générale"]);
  });

  it("ne touche à rien si la cible est illisible", () => {
    const input = ["Chauffage", "rénovation"];
    expect(applyServiceTagMerge(input, ["rénovation"], "  ")).toEqual({
      tags: input,
      changed: false,
    });
  });

  it("garde intacts les tags non concernés, y compris hors taxonomie", () => {
    const { tags, changed } = applyServiceTagMerge(
      ["Artisanat", "Désembouage", "Plomberie"],
      ["rénovation"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Artisanat", "Désembouage", "Plomberie"]);
    expect(changed).toBe(false);
  });

  /**
   * Le template lit `service_tags` de haut en bas — « du plus mis en avant au
   * moins ». Réordonner changerait la hiérarchie des services affichés sur le
   * site, un effet de bord qu'une fusion de tags n'a pas à produire.
   */
  it("conserve l'ordre et place la cible à la position de la première source", () => {
    const { tags } = applyServiceTagMerge(
      ["Chauffage", "rénovation", "Plomberie", "Rénovation générale"],
      ["rénovation"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Chauffage", "Rénovation générale", "Plomberie"]);
  });

  it("ne change rien quand la cible est sa propre source", () => {
    const input = ["Chauffage", "Rénovation générale"];
    const { tags, changed } = applyServiceTagMerge(input, ["Rénovation générale"], "Rénovation générale");
    expect(tags).toEqual(input);
    expect(changed).toBe(false);
  });

  it("ignore la cible présente dans la sélection de sources", () => {
    const { tags } = applyServiceTagMerge(
      ["rénovation", "Chauffage"],
      ["rénovation", "Rénovation générale"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Rénovation générale", "Chauffage"]);
  });

  it("est idempotente : rejouer la fusion ne trouve plus rien", () => {
    const first = applyServiceTagMerge(["rénovation", "Plomberie"], ["rénovation"], "Rénovation générale");
    const second = applyServiceTagMerge(first.tags, ["rénovation"], "Rénovation générale");
    expect(second.tags).toEqual(first.tags);
    expect(second.changed).toBe(false);
  });

  it("nettoie les entrées vides sans toucher au reste", () => {
    const { tags, changed } = applyServiceTagMerge(["Chauffage", "", "  "], ["rénovation"], "Rénovation générale");
    expect(tags).toEqual(["Chauffage"]);
    expect(changed).toBe(true);
  });

  it("dédoublonne un tableau qui portait déjà deux graphies du même tag", () => {
    const { tags, changed } = applyServiceTagMerge(
      ["Climatisation", "climatisation", "rénovation"],
      ["rénovation"],
      "Rénovation générale",
    );
    expect(tags).toEqual(["Climatisation", "Rénovation générale"]);
    expect(changed).toBe(true);
  });

  it("laisse le tableau vide vide", () => {
    expect(applyServiceTagMerge([], ["rénovation"], "Rénovation générale")).toEqual({
      tags: [],
      changed: false,
    });
  });

  it("ignore les sources vides", () => {
    const input = ["Chauffage"];
    expect(applyServiceTagMerge(input, ["", "   "], "Rénovation générale")).toEqual({
      tags: input,
      changed: false,
    });
  });
});

/**
 * Le côté auteur porte un tag SCALAIRE (`service_tag`) enfoui dans du JSONB, et
 * il décide de la visibilité en sens inverse des tableaux : il déclare « réservé
 * au tag X ». Une fusion qui l'ignorerait ferait disparaître les pages composées
 * à la main pour l'ancien tag au moment même où l'on corrige l'entreprise.
 */
describe("rewriteNestedServiceTag", () => {
  it("réécrit un service_tag enfoui dans un document", () => {
    const doc = { pages: [{ slug: "/renovation", service_tag: "rénovation" }] };
    const { value, changed } = rewriteNestedServiceTag(doc, ["rénovation"], "Rénovation générale");
    expect(changed).toBe(true);
    expect(value).toEqual({ pages: [{ slug: "/renovation", service_tag: "Rénovation générale" }] });
  });

  it("descend dans les tableaux et les objets imbriqués", () => {
    const doc = {
      blocks: [
        { id: "a", service_tag: null },
        { id: "b", nested: { deep: [{ service_tag: "renovation" }] } },
      ],
    };
    const { value, changed } = rewriteNestedServiceTag(doc, ["rénovation"], "Rénovation générale");
    expect(changed).toBe(true);
    expect((value as typeof doc).blocks[1].nested.deep[0].service_tag).toBe("Rénovation générale");
  });

  it("ne touche pas aux autres clés, même si leur valeur ressemble au tag", () => {
    const doc = { title: "rénovation", slug: "rénovation", service_tag: "Chauffage" };
    const { value, changed } = rewriteNestedServiceTag(doc, ["rénovation"], "Rénovation générale");
    expect(changed).toBe(false);
    expect(value).toEqual(doc);
  });

  it("laisse intacts null, les tags non concernés et les types inattendus", () => {
    const doc = { a: { service_tag: null }, b: { service_tag: "Plomberie" }, c: { service_tag: 42 } };
    const { value, changed } = rewriteNestedServiceTag(doc, ["rénovation"], "Rénovation générale");
    expect(changed).toBe(false);
    expect(value).toEqual(doc);
  });

  it("normalise la graphie de la cible même hors sélection", () => {
    const { value, changed } = rewriteNestedServiceTag(
      { service_tag: "renovation-generale" },
      ["chauffage"],
      "Rénovation générale",
    );
    expect(changed).toBe(true);
    expect(value).toEqual({ service_tag: "Rénovation générale" });
  });

  it("rend l'objet d'origine tel quel quand rien ne change", () => {
    const doc = { service_tag: "Chauffage" };
    expect(rewriteNestedServiceTag(doc, ["rénovation"], "Rénovation générale").value).toBe(doc);
  });

  it("est idempotente", () => {
    const first = rewriteNestedServiceTag({ service_tag: "rénovation" }, ["rénovation"], "Rénovation générale");
    const second = rewriteNestedServiceTag(first.value, ["rénovation"], "Rénovation générale");
    expect(second.changed).toBe(false);
    expect(second.value).toEqual({ service_tag: "Rénovation générale" });
  });

  it("ne touche à rien si la cible est illisible", () => {
    const doc = { service_tag: "rénovation" };
    expect(rewriteNestedServiceTag(doc, ["rénovation"], "")).toEqual({ value: doc, changed: false });
  });

  it("traverse un document scalaire ou nul sans casser", () => {
    expect(rewriteNestedServiceTag(null, ["rénovation"], "Rénovation générale").changed).toBe(false);
    expect(rewriteNestedServiceTag("texte", ["rénovation"], "Rénovation générale").changed).toBe(false);
  });
});
