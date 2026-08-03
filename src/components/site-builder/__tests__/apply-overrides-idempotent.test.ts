/**
 * @jest-environment jsdom
 *
 * Re-applying the same overrides must not touch the DOM.
 *
 * `LibrarySectionHydrator` re-applies overrides from a MutationObserver, so
 * every unconditional write is a step in a loop: write → mutation record →
 * callback → write. A profile of a live demo page caught exactly that — 676
 * setTimeout callbacks and 1 846 `transitioncancel` events on a page that had
 * finished loading. The observer no longer watches attributes and disconnects
 * around its own writes, but idempotent writes are the property that makes
 * those defences unnecessary rather than merely sufficient.
 */
import { applyOverridesToContainer, type OverrideEntry } from "../LibrarySectionHydrator";

const VARIABLES = { "entreprise.nom": "Ventilation Plus", __service_tags: '["ventilation"]' };

/** A section root carrying one stamped node per override kind under test. */
function buildContainer(): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = `
    <section>
      <h1 data-cdp="0.0">placeholder</h1>
      <a data-cdp="0.1" href="#">lien</a>
      <img data-cdp="0.2" src="old.webp" alt="">
      <div data-cdp="0.3" class="ph"><span class="ph-label">photo</span></div>
      <p data-cdp="0.4">à masquer</p>
      <div data-cdp="0.5">stylé</div>
      <div data-cdp="0.6" role="note">attribut</div>
    </section>`;
  document.body.appendChild(container);
  return container;
}

const OVERRIDES: Record<string, OverrideEntry> = {
  "0.0:text": { kind: "text", value: "{{ entreprise.nom }}" },
  "0.1:link_href": { kind: "link_href", value: "https://example.com" },
  "0.2:image": { kind: "image", value: "https://cdn.example.com/new.webp" },
  "0.3:bg_image": { kind: "bg_image", value: "https://cdn.example.com/bg.webp" },
  "0.4:remove": { kind: "remove", value: "1" },
  "0.5:style": { kind: "style", value: "1", meta: { style: { backgroundColor: "#fff", fontSize: "18px" } } },
  "0.6:attr": { kind: "attr", value: "avertissement", meta: { attrName: "aria-label" } },
};

describe("applyOverridesToContainer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies every override kind on the first pass", () => {
    const container = buildContainer();
    applyOverridesToContainer(container, OVERRIDES, VARIABLES);

    const q = (sel: string) => container.querySelector(sel)!;
    expect(q('[data-cdp="0.0"]').textContent).toBe("Ventilation Plus");
    expect(q('[data-cdp="0.1"]').getAttribute("href")).toBe("https://example.com");
    expect(q('[data-cdp="0.2"]').getAttribute("src")).toBe("https://cdn.example.com/new.webp");
    expect((q('[data-cdp="0.3"]') as HTMLElement).style.backgroundImage).toContain("bg.webp");
    expect(q('[data-cdp="0.3"]').classList.contains("has-img")).toBe(true);
    expect((q('[data-cdp="0.4"]') as HTMLElement).style.display).toBe("none");
    expect((q('[data-cdp="0.5"]') as HTMLElement).style.getPropertyValue("font-size")).toBe("18px");
    expect(q('[data-cdp="0.6"]').getAttribute("aria-label")).toBe("avertissement");
  });

  it("mutates nothing when re-applied — this is what stops the observer loop", async () => {
    const container = buildContainer();
    applyOverridesToContainer(container, OVERRIDES, VARIABLES);

    const records: MutationRecord[] = [];
    const observer = new MutationObserver((rs) => records.push(...rs));
    // Deliberately the widest possible observation: the second pass must be
    // invisible even to an observer watching everything.
    observer.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });

    applyOverridesToContainer(container, OVERRIDES, VARIABLES);
    // MutationObserver callbacks are delivered as microtasks.
    await Promise.resolve();
    observer.disconnect();

    expect(records.map((r) => `${r.type}:${r.attributeName ?? ""}`)).toEqual([]);
  });

  it("keeps the style-override priority so it still beats !important rules", () => {
    const container = buildContainer();
    applyOverridesToContainer(container, OVERRIDES, VARIABLES);
    const styled = container.querySelector('[data-cdp="0.5"]') as HTMLElement;
    expect(styled.style.getPropertyPriority("font-size")).toBe("important");
  });

  it("still rewrites a value that actually changed", () => {
    const container = buildContainer();
    applyOverridesToContainer(container, OVERRIDES, VARIABLES);
    applyOverridesToContainer(
      container,
      { ...OVERRIDES, "0.1:link_href": { kind: "link_href", value: "https://autre.fr" } },
      VARIABLES,
    );
    expect(container.querySelector('[data-cdp="0.1"]')!.getAttribute("href")).toBe("https://autre.fr");
  });
});
