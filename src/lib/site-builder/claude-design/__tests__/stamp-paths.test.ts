/**
 * @jest-environment jsdom
 */
import { STAMP_PATHS } from "../stamp-paths";

/** Element-child index path from #cd-root to `el` — the SAME semantics the
 *  editor's OVERRIDES_APPLY and the server-side applier use. */
function positionalPath(el: Element, root: Element): number[] {
  const path: number[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return path;
}

function runStamp() {
  // The IIFE reads document.getElementById('cd-root'); run it against jsdom.
  (0, eval)(STAMP_PATHS);
}

const STEPPER_HTML = `
  <section class="solution-stepper">
    <div class="stepper" data-stepper>
      <div class="stepper-visual">
        <div class="stepper-imgs" data-stepper-imgs>
          <div class="stepper-img"><img id="logoA" src="a.png"></div>
          <div class="stepper-img"><img id="logoB" src="b.png"></div>
        </div>
        <div class="stepper-dots"></div>
      </div>
      <div class="stepper-texts">
        <div class="stepper-text" data-step></div>
        <div class="stepper-text" data-step></div>
      </div>
    </div>
  </section>`;

describe("STAMP_PATHS", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="cd-root">${STEPPER_HTML}</div>`;
  });

  it("stamps each element with its static path from #cd-root (matches applier semantics)", () => {
    const root = document.getElementById("cd-root")!;
    const img = document.getElementById("logoA")!;
    const expected = positionalPath(img, root).join(".");
    runStamp();
    expect(img.getAttribute("data-cdp")).toBe(expected);
    // cd-root itself is not stamped (paths start at its children).
    expect(root.hasAttribute("data-cdp")).toBe(false);
  });

  it("keeps the stamp stable when the design JS injects siblings AND moves the node", () => {
    const root = document.getElementById("cd-root")!;
    const img = document.getElementById("logoA")!;
    runStamp();
    const key = img.getAttribute("data-cdp")!;

    // Simulate site.js: (1) inject glow/ring/spine before the image track,
    // shifting .stepper-imgs from index 0 to 3 inside .stepper-visual …
    const visual = document.querySelector(".stepper-visual")!;
    const imgs = document.querySelector(".stepper-imgs")!;
    for (const cls of ["stepper-glow", "stepper-ring", "stepper-spine"]) {
      const s = document.createElement("span");
      s.className = cls;
      visual.insertBefore(s, imgs);
    }
    // … and (2) MOVE the <img> out of its slot into the mobile card.
    document.querySelector(".stepper-text")!.appendChild(img);

    // The stamp is unchanged (stable identity), so an edit keyed to it still
    // resolves to the (moved) image via the attribute selector.
    expect(img.getAttribute("data-cdp")).toBe(key);
    expect(root.querySelector(`[data-cdp="${key}"]`)).toBe(img);

    // Proof of the bug the stamp fixes: a fresh positional walk to that key now
    // lands on a DIFFERENT element (the injected sibling shifted the indices).
    const parts = key.split(".").map(Number);
    let walked: Element | null = root;
    for (const idx of parts) walked = walked ? (walked.children[idx] ?? null) : null;
    expect(walked).not.toBe(img);
  });
});
