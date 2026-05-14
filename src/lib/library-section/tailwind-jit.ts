/**
 * Server-only: generates a minimal Tailwind CSS string for a set of class tokens
 * using @tailwindcss/postcss programmatically.
 *
 * Strategy:
 *  1. Write the class tokens to a temp HTML file in /tmp so Tailwind can scan them.
 *  2. Run postcss + @tailwindcss/postcss against an @import "tailwindcss" source.
 *  3. Cache the result (Promise) by sorted-token hash so concurrent requests
 *     for the same class set share a single compilation.
 *  4. On failure, return "" and log a warning — the public page remains functional
 *     but Tailwind utility classes from library sections may be unstyled.
 */
import "server-only";
import { createHash } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Promise-level cache: key → Promise<css>. Stores the promise so concurrent
// callers for the same hash await the same compilation.
const cache = new Map<string, Promise<string>>();
const MAX = 200;

function lruSetPromise(key: string, p: Promise<string>) {
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, p);
}

export async function generateTailwindCSS(classTokens: string[]): Promise<string> {
  if (classTokens.length === 0) return "";

  const unique = [...new Set(classTokens)].sort();
  const key = createHash("sha256").update(unique.join(" ")).digest("hex").slice(0, 16);

  const hit = cache.get(key);
  if (hit) return hit;

  const p = _compile(unique, key);
  lruSetPromise(key, p);
  return p;
}

async function _compile(unique: string[], key: string): Promise<string> {
  const tmpFile = join(tmpdir(), `tw-lib-${key}.html`);
  try {
    // postcss and @tailwindcss/postcss are devDeps but installed on Vercel during
    // the build step and available at runtime in the Next.js Node.js runtime.
    const postcss = (await import("postcss")).default;
    const twPlugin = (await import("@tailwindcss/postcss")).default;

    // Write classes as HTML content so Tailwind's scanner picks them up
    await writeFile(tmpFile, `<div class="${unique.join(" ")}"></div>`);

    const cssInput = [
      `@import "tailwindcss" source(none);`,
      `@source "${tmpFile}";`,
    ].join("\n");

    const result = await postcss([twPlugin()]).process(cssInput, { from: undefined });
    return result.css;
  } catch (err) {
    console.warn(
      "[library-section/tailwind-jit] CSS generation failed:",
      err instanceof Error ? err.message : String(err)
    );
    return "";
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
