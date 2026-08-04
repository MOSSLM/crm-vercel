/**
 * Un override dont le nœud a été RETIRÉ ne doit rien toucher.
 *
 * Symptôme signalé : la carte « Entretien & contrat » et la carte
 * « Dépannage / SAV » — deux cartes à icône, volontairement sans photo —
 * héritaient d'une image de fond, et la bande « Certifications & qualifications
 * reconnues par l'État » affichait des photos au hasard à la place des logos
 * RGE posés à la main.
 *
 * Cause : le conditionnement par service retire les cartes des métiers que
 * l'entreprise n'exerce pas. L'override de la photo d'une carte retirée reste,
 * lui, dans `__overrides`. Les résolveurs cherchaient d'abord le tampon
 * `data-cdp` — absent, puisque le nœud est parti — puis retombaient sur une
 * marche positionnelle qui, sur l'arbre déjà conditionné, atterrit sur le nœud
 * ayant pris la place : la carte à icône suivante, ou un logo de certification.
 *
 * La marche positionnelle ne reste donc un repli que pour un markup SANS
 * tampon. Ce test verrouille les deux résolveurs serveur sur le vrai markup de
 * l'export (cartes `svc-photo` avec `--img` en style inline, cartes `svc-icon`
 * sans photo, bande `certif-band`).
 */
import { applyOverridesToHTML, type OverrideEntry } from "@/lib/library-section/apply-overrides-html";
import { resolveImageSets } from "../resolve-image-sets";
import { conditionServiceMarkup } from "../condition-service-markup";
import { stampDomPaths } from "../dom-paths";
import { serializeImageSet } from "../image-set";

/**
 * Le markup de l'export : 2 cartes photo taguées, 2 cartes icône sans photo,
 * une section « zoom » entièrement taguée, puis la bande de certifications.
 *
 * La section zoom porte un `data-service-tag` : elle DISPARAÎT pour une
 * entreprise qui ne fait pas de plomberie, ce qui décale les indices de premier
 * niveau — et son chemin de photo décrit alors, à l'indice près, le premier logo
 * de la bande de certifications.
 */
const SECTION = `<div data-claude-design=""><section class="section"><div class="svc-grid">
<article class="svc-card svc-photo"><div class="svc-glass"><h3>Climatisation</h3><a href="service-climatisation.html" data-service-tag="climatisation">En savoir plus</a></div></article>
<article class="svc-card svc-photo"><div class="svc-glass"><h3>Plomberie</h3><a href="service-plomberie.html" data-service-tag="plomberie">En savoir plus</a></div></article>
<article class="svc-card svc-icon"><h3>Entretien &amp; contrat</h3><p>Contrat annuel.</p></article>
<article class="svc-card svc-icon"><h3>Dépannage / SAV</h3><p>Intervention rapide.</p></article>
</div></section>
<section class="section zoom" data-service-tag="plomberie"><div class="wrap"><p class="eyebrow">Zoom plomberie</p><div class="zoom-row"><div class="ph"><img src="/zoom.jpg" alt="Chantier plomberie"></div></div></div></section>
<section class="section certif-band"><div class="wrap"><p class="certif-lead">Certifications &amp; qualifications reconnues par l'État</p><div class="certif-row">
<div class="certif-logo"><img src="/logos/qualibat.png" alt="RGE Qualibat"></div>
<div class="certif-logo"><img src="/logos/qualipac.png" alt="RGE QualiPAC"></div>
</div></div></section></div>`;

// Une photo posée sur chacune des 2 cartes de service, plus celle du zoom
// plomberie — aux chemins du markup COMPLET, ce que le builder enregistre.
const CLIM = "0.0.0:bg_image";
const PLOMBERIE = "0.0.1:bg_image";
/** La photo du zoom plomberie : `1.0.1.0.0` vise son <img>. La section retirée,
 *  ce chemin décrit EXACTEMENT le premier logo de la bande de certifications,
 *  devenue l'élément 1 — la collision qui mettait une photo de chantier à la
 *  place du logo Qualibat. */
const ZOOM = "1.0.1.0.0:image";

const SINGLE: Record<string, OverrideEntry> = {
  [CLIM]: { kind: "bg_image", value: "https://x/clim.jpg" },
  [PLOMBERIE]: { kind: "bg_image", value: "https://x/plomberie.jpg" },
  [ZOOM]: { kind: "image", value: "https://x/zoom-plomberie.jpg" },
};

const SETS: Record<string, OverrideEntry> = {
  "0.0.0:image_set": { kind: "image_set", value: serializeImageSet([{ url: "https://x/clim.jpg", tags: ["Climatisation"] }]) },
  "0.0.1:image_set": { kind: "image_set", value: serializeImageSet([{ url: "https://x/plomberie.jpg", tags: ["Plomberie"] }]) },
  "1.0.1.0.0:image_set": { kind: "image_set", value: serializeImageSet([{ url: "https://x/zoom-plomberie.jpg", tags: ["Plomberie"] }]) },
};

/** L'ordre de LibrarySectionInline : tamponner, appliquer, résoudre les jeux,
 *  PUIS conditionner. Le conditionnement final rejoue ce que voit l'hydrateur. */
function renderSSR(overrides: Record<string, OverrideEntry>, tags: string[]): string {
  let html = stampDomPaths(SECTION, { mode: "section-root", only: Object.keys(overrides) });
  html = applyOverridesToHTML(html, overrides, {}).html;
  html = resolveImageSets(html, overrides, tags);
  return conditionServiceMarkup(html, { "/service-climatisation": "climatisation", "/service-plomberie": "plomberie" }, tags);
}

/** Ce que refait l'hydrateur / une seconde passe : le DOM est DÉJÀ conditionné,
 *  et c'est là que la marche positionnelle dérapait. */
function reapply(conditioned: string, overrides: Record<string, OverrideEntry>, tags: string[]): string {
  const html = applyOverridesToHTML(conditioned, overrides, {}).html;
  return resolveImageSets(html, overrides, tags);
}

describe("un override dont la carte a été retirée ne se reporte sur rien", () => {
  // L'entreprise ne fait QUE de la climatisation → la carte plomberie part.
  const TAGS = ["climatisation"];

  it("laisse les cartes à icône sans image de fond (bg_image)", () => {
    const conditioned = renderSSR(SINGLE, TAGS);
    expect(conditioned).not.toContain("Plomberie</h3>"); // la carte est bien partie
    const out = reapply(conditioned, SINGLE, TAGS);

    // La photo de la carte retirée ne doit apparaître nulle part.
    expect(out).not.toContain("plomberie.jpg");
    // Et les deux cartes à icône n'ont aucun fond.
    for (const title of ["Entretien &amp; contrat", "Dépannage / SAV"]) {
      const card = out.slice(out.indexOf(`<h3>${title}`) - 200, out.indexOf(`<h3>${title}`));
      expect(card).not.toContain("background-image");
    }
  });

  it("laisse les cartes à icône sans image de fond (image_set)", () => {
    const conditioned = renderSSR(SETS, TAGS);
    const out = reapply(conditioned, SETS, TAGS);
    expect(out).not.toContain("plomberie.jpg");
    for (const title of ["Entretien &amp; contrat", "Dépannage / SAV"]) {
      const card = out.slice(out.indexOf(`<h3>${title}`) - 200, out.indexOf(`<h3>${title}`));
      expect(card).not.toContain("background-image");
    }
  });

  it.each([["bg_image / image", SINGLE], ["image_set", SETS]])(
    "laisse les logos de certification intacts (%s)",
    (_label, overrides) => {
      const conditioned = renderSSR(overrides, TAGS);
      expect(conditioned).not.toContain("Zoom plomberie"); // la section est partie
      const out = reapply(conditioned, overrides, TAGS);

      expect(out).toContain('src="/logos/qualibat.png"');
      expect(out).toContain('src="/logos/qualipac.png"');
      // Aucune photo d'un bloc disparu n'a atterri dans la bande.
      const band = out.slice(out.indexOf("certif-band"));
      expect(band).not.toContain("zoom-plomberie.jpg");
      expect(band).not.toContain("plomberie.jpg");
      expect(band).not.toContain("background-image");
    },
  );

  it("applique toujours la photo de la carte qui SURVIT", () => {
    const out = reapply(renderSSR(SINGLE, TAGS), SINGLE, TAGS);
    expect(out).toContain("clim.jpg");
    const card = out.slice(0, out.indexOf("<h3>Climatisation"));
    expect(card).toContain("background-image");
  });

  it("n'ampute pas un markup sans tampon (la marche reste le repli)", () => {
    // Un design rendu sans passer par stampDomPaths : rien n'a été retiré, les
    // indices sont donc encore fiables et l'override doit s'appliquer.
    const out = applyOverridesToHTML(SECTION, SINGLE, {}).html;
    expect(out).toContain("clim.jpg");
    expect(out).toContain("plomberie.jpg");
  });
});
