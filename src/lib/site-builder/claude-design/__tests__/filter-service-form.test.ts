import { filterServiceForm, slugifyServiceTag } from "../filter-service-form";

// A trimmed copy of Claude Design's multi-step "devis" form service picker:
// each service is a <button data-svc="…"> tile inside .dv-tiles.
const tiles = `<div class="dv-tiles">
  <button type="button" class="dv-tile" data-svc="climatisation"><span class="dv-tile-t">Climatisation</span></button>
  <button type="button" class="dv-tile" data-svc="pompe-a-chaleur"><span class="dv-tile-t">Pompe à chaleur</span></button>
  <button type="button" class="dv-tile" data-svc="chauffage"><span class="dv-tile-t">Chauffage</span></button>
  <button type="button" class="dv-tile" data-svc="photovoltaique"><span class="dv-tile-t">Photovoltaïque</span></button>
  <button type="button" class="dv-tile" data-svc="bornes-irve"><span class="dv-tile-t">Borne de recharge</span></button>
</div>`;

describe("slugifyServiceTag", () => {
  it("bridges hyphenated form slugs and human French service tags", () => {
    expect(slugifyServiceTag("Pompe à chaleur")).toBe("pompe-a-chaleur");
    expect(slugifyServiceTag("pompe-a-chaleur")).toBe("pompe-a-chaleur");
    expect(slugifyServiceTag("Photovoltaïque")).toBe("photovoltaique");
    expect(slugifyServiceTag("Bornes IRVE")).toBe("bornes-irve");
    expect(slugifyServiceTag("Électricité")).toBe("electricite");
  });
});

describe("filterServiceForm", () => {
  it("keeps only tiles the company offers, matching across accents/hyphens", () => {
    // Company tags in their human French form, as stored in service_tags.
    const out = filterServiceForm(tiles, ["Climatisation", "Pompe à chaleur"]);
    expect(out).toContain('data-svc="climatisation"');
    expect(out).toContain('data-svc="pompe-a-chaleur"');
    expect(out).not.toContain('data-svc="chauffage"');
    expect(out).not.toContain('data-svc="photovoltaique"');
    expect(out).not.toContain('data-svc="bornes-irve"');
  });

  it("keeps every tile when the company offers them all", () => {
    const out = filterServiceForm(tiles, [
      "climatisation",
      "pompe-a-chaleur",
      "chauffage",
      "photovoltaique",
      "bornes-irve",
    ]);
    for (const svc of ["climatisation", "pompe-a-chaleur", "chauffage", "photovoltaique", "bornes-irve"]) {
      expect(out).toContain(`data-svc="${svc}"`);
    }
  });

  it("leaves the form untouched when the company has no service tags (author preview)", () => {
    expect(filterServiceForm(tiles, [])).toBe(tiles);
  });

  it("keeps the WHOLE picker when the company matches none of its tiles (no empty form)", () => {
    // A company doing only a service that isn't in this picker → show all rather
    // than ship a lead form with zero selectable services.
    const out = filterServiceForm(tiles, ["toiture"]);
    expect(out).toBe(tiles);
  });

  it("is a no-op on markup with no service tiles", () => {
    const plain = `<div class="dv-group"><textarea id="dv-desc"></textarea></div>`;
    expect(filterServiceForm(plain, ["climatisation"])).toBe(plain);
  });

  it("filters each picker independently", () => {
    const twoPickers = `${tiles}<div class="dv-tiles second">
      <button data-svc="chauffage">Chauffage</button>
      <button data-svc="climatisation">Climatisation</button>
    </div>`;
    const out = filterServiceForm(twoPickers, ["Chauffage"]);
    // First picker matches only chauffage; clim/pac/pv/irve dropped there.
    expect(out).toContain('data-svc="chauffage"');
    expect(out).not.toContain('data-svc="pompe-a-chaleur"');
    // Second picker keeps chauffage, drops its climatisation tile.
    expect((out.match(/data-svc="chauffage"/g) ?? []).length).toBe(2);
    expect(out).not.toContain('data-svc="climatisation"');
  });
});
