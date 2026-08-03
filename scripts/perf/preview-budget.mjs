#!/usr/bin/env node
/**
 * Measures what a real visitor waits for on a demo site, and fails on a budget.
 *
 *   node scripts/perf/preview-budget.mjs https://<uuid>.samadigitalstudio.fr/une-page [...]
 *
 * The number that matters is NOT time-to-first-byte. A profile of a live
 * preview measured 47 ms to first byte and 10 065 ms to last byte: Next flushed
 * the response headers immediately, then held the connection open while the
 * server rendered. TTFB looked perfect while the page was blank for ten
 * seconds. So this reads the body to completion and reports both.
 *
 * It also greps the delivered HTML for the regressions that are invisible in a
 * timing chart — import-only HTML copies riding along in the hydration JSON, a
 * synchronous third-party script, a stylesheet pointed at a bare origin.
 *
 * Zero dependencies, no build step. Needs a deployed URL, so it is a manual /
 * post-deploy check rather than a CI gate.
 */

const BUDGET = {
  /** Server had to do real work before the first byte. */
  ttfbMs: 800,
  /** What the visitor actually waits for. */
  fullBodyMs: 2000,
  /** Compressed HTML over the wire. */
  bytes: 250_000,
};

/** Things that must not appear in the delivered HTML, and why. */
const FORBIDDEN = [
  ["__source_html", "import-only copy of the page HTML in the hydration payload"],
  ["__token_html", "import-only copy of the page HTML in the hydration payload"],
  [/<link[^>]+rel="stylesheet"[^>]+href="https:\/\/fonts\.g\w+\.com\/?"/, "stylesheet pointed at a bare font origin (404s, render-blocking)"],
];

/** Present today; each is a known follow-up rather than a hard failure. */
const WARN = [
  ["cdn.tailwindcss.com", "Tailwind Play CDN — 126 KB compiler, loaded synchronously"],
  // An absolute src means another origin (same-origin assets are emitted as
  // paths), and no defer/async means it blocks the parser.
  [/<script(?![^>]*\b(?:defer|async)\b)[^>]*\ssrc="https?:\/\//, "render-blocking third-party script"],
];

async function measure(url) {
  const started = performance.now();
  const res = await fetch(url, { redirect: "follow" });
  const ttfb = performance.now() - started;

  // Drain the body: `fetch` resolves on headers, and on a streamed SSR response
  // that is exactly the gap this script exists to expose.
  const body = await res.text();
  const total = performance.now() - started;

  return { status: res.status, ttfb, total, bytes: Buffer.byteLength(body), body };
}

const matches = (body, needle) =>
  typeof needle === "string" ? body.includes(needle) : needle.test(body);

async function run(url, runs = 3) {
  const samples = [];
  let last;
  for (let i = 0; i < runs; i++) {
    last = await measure(url);
    samples.push(last);
  }
  // Median, not mean: one cold lambda shouldn't dominate the verdict.
  const median = (pick) => samples.map(pick).sort((a, b) => a - b)[Math.floor(runs / 2)];

  const ttfb = median((s) => s.ttfb);
  const total = median((s) => s.total);
  const { bytes, body, status } = last;

  const failures = [];
  if (status !== 200) failures.push(`HTTP ${status}`);
  if (ttfb > BUDGET.ttfbMs) failures.push(`TTFB ${ttfb.toFixed(0)} ms > ${BUDGET.ttfbMs} ms`);
  if (total > BUDGET.fullBodyMs) failures.push(`corps complet ${total.toFixed(0)} ms > ${BUDGET.fullBodyMs} ms`);
  if (bytes > BUDGET.bytes) failures.push(`${(bytes / 1024).toFixed(0)} Ko > ${(BUDGET.bytes / 1024).toFixed(0)} Ko`);
  for (const [needle, why] of FORBIDDEN) {
    if (matches(body, needle)) failures.push(`${why}`);
  }

  console.log(`\n${url}`);
  console.log(`  HTTP ${status}  premier octet ${ttfb.toFixed(0)} ms  corps complet ${total.toFixed(0)} ms  ${(bytes / 1024).toFixed(0)} Ko`);
  console.log(`  dont ${(total - ttfb).toFixed(0)} ms passés à attendre le corps après les en-têtes`);

  for (const [needle, why] of WARN) {
    if (matches(body, needle)) console.log(`  ⚠ ${why}`);
  }
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length === 0) console.log("  ✓ dans les budgets");

  return failures.length === 0;
}

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("usage: node scripts/perf/preview-budget.mjs <url> [url...]");
  process.exit(2);
}

let allPassed = true;
for (const url of urls) {
  try {
    if (!(await run(url))) allPassed = false;
  } catch (err) {
    console.log(`\n${url}\n  ✗ ${err instanceof Error ? err.message : String(err)}`);
    allPassed = false;
  }
}
process.exit(allPassed ? 0 : 1);
