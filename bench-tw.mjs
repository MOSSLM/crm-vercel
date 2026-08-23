import { writeFile, unlink } from "fs/promises";
import { join } from "path";
const postcss = (await import("postcss")).default;
const twPlugin = (await import("@tailwindcss/postcss")).default;
const tokens = [];
const bases = ["flex","grid","block","hidden","relative","absolute","p","px","py","m","mt","mb","gap","w","h","text","bg","border","rounded","shadow","opacity","z"];
for (const b of bases) for (let i = 0; i < 14; i++) tokens.push(`${b}-${i}`, `md:${b}-${i}`, `lg:${b}-${i}`);
async function compile(n) {
  const f = join(process.cwd(), `.bench-tw-${n}.html`);
  await writeFile(f, `<div class="${tokens.join(" ")}"></div>`);
  const t0 = performance.now();
  const res = await postcss([twPlugin()]).process(
    `@import "tailwindcss" source(none);\n@source "${f}";`,
    { from: join(process.cwd(), "bench.css") });
  const ms = performance.now() - t0;
  await unlink(f).catch(() => {});
  return { ms, taille: res.css.length };
}
for (let i = 1; i <= 3; i++) {
  const r = await compile(i);
  console.log(`compilation ${i} : ${r.ms.toFixed(0)} ms → ${(r.taille/1024).toFixed(0)} Ko de CSS (${tokens.length} tokens)`);
}
