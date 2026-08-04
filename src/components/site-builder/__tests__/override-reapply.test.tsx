/**
 * @jest-environment jsdom
 *
 * An override that the design's own JS overwrites must come back.
 *
 * The overrides carry the company's real text and images. A generated design
 * routinely rewrites the same nodes after load — a lazy-loader swapping
 * `data-src` into `src`, a counter rewriting `textContent`, theme JS setting a
 * background. Neither of those is a childList mutation, so when the observer
 * was narrowed to `{childList, subtree}` during a performance pass the
 * overrides stopped being restored and the pages lost their images.
 *
 * This test drives the real component and asserts the round trip, so narrowing
 * the observation options again fails here rather than in production.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { LibrarySectionHydrator } from "../LibrarySectionHydrator";

const INSTANCE_ID = "sec-1";
const HERO = "https://cdn.example.com/hero-de-l-entreprise.webp";

function mountSection(overrides: Record<string, unknown>) {
  const section = document.createElement("div");
  section.setAttribute("data-lsi", INSTANCE_ID);
  section.innerHTML = `
    <div data-claude-design="">
      <img data-cdp="0.0" src="placeholder.webp" alt="">
      <h1 data-cdp="0.1">Titre du template</h1>
    </div>`;
  document.body.appendChild(section);

  const payload = document.createElement("script");
  payload.type = "application/json";
  payload.setAttribute("data-lsi-id", INSTANCE_ID);
  // js/renderName empty: a whole-page design has no compiled component to
  // hydrate. Overrides must still be applied — that path regressed once too.
  payload.textContent = JSON.stringify({
    instanceId: INSTANCE_ID,
    js: "",
    renderName: null,
    data: { __overrides: overrides },
    variables: { "entreprise.nom": "Ventilation Plus" },
    tokens: {},
  });
  document.body.appendChild(payload);

  return {
    img: section.querySelector("img")!,
    title: section.querySelector("h1")!,
  };
}

describe("LibrarySectionHydrator — override re-application", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies overrides even with no component to hydrate", async () => {
    const { img, title } = mountSection({
      "0.0:image": { kind: "image", value: HERO },
      "0.1:text": { kind: "text", value: "{{ entreprise.nom }}" },
    });

    render(<LibrarySectionHydrator />);

    await waitFor(() => expect(img.getAttribute("src")).toBe(HERO));
    expect(title.textContent).toBe("Ventilation Plus");
  });

  it("restores an image the design's own JS overwrote (attribute mutation)", async () => {
    const { img } = mountSection({ "0.0:image": { kind: "image", value: HERO } });
    render(<LibrarySectionHydrator />);
    await waitFor(() => expect(img.getAttribute("src")).toBe(HERO));

    // What a lazy-loader does on load. No childList mutation anywhere.
    img.setAttribute("src", "placeholder.webp");

    await waitFor(() => expect(img.getAttribute("src")).toBe(HERO), { timeout: 2000 });
  });

  it("restores text the design's own JS overwrote (character-data mutation)", async () => {
    const { title } = mountSection({ "0.1:text": { kind: "text", value: "Ventilation Plus" } });
    render(<LibrarySectionHydrator />);
    await waitFor(() => expect(title.textContent).toBe("Ventilation Plus"));

    title.firstChild!.nodeValue = "Titre du template";

    await waitFor(() => expect(title.textContent).toBe("Ventilation Plus"), { timeout: 2000 });
  });

  it("keeps restoring after many rewrites — no lifetime budget", async () => {
    const { img } = mountSection({ "0.0:image": { kind: "image", value: HERO } });
    render(<LibrarySectionHydrator />);
    await waitFor(() => expect(img.getAttribute("src")).toBe(HERO));

    // A design that animates triggers the observer constantly. A capped budget
    // was silently exhausted here, and every later rewrite won.
    for (let i = 0; i < 40; i++) {
      img.setAttribute("src", `intrus-${i}.webp`);
      await new Promise((r) => setTimeout(r, 20));
    }

    await waitFor(() => expect(img.getAttribute("src")).toBe(HERO), { timeout: 2000 });
  });
});
