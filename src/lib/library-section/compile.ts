/**
 * Server-only: Babel-compiles TSX section code and caches the result by content hash.
 * Never imported on the client (marked server-only via "react-server" condition in Next.js).
 */
import "server-only";
import { createHash } from "crypto";
import { preprocessSectionCode } from "./preprocess";

export interface CompiledSection {
  js: string;
  renderName: string | null;
  contentHash: string;
}

// Simple process-level LRU cache (max 100 entries)
const MAX = 100;
const cache = new Map<string, CompiledSection>();

function lruGet(key: string) {
  const v = cache.get(key);
  if (v) { cache.delete(key); cache.set(key, v); }
  return v;
}
function lruSet(key: string, v: CompiledSection) {
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, v);
}

export async function compileSection(code: string): Promise<CompiledSection> {
  const contentHash = createHash("sha256").update(code).digest("hex").slice(0, 16);
  const cached = lruGet(contentHash);
  if (cached) return cached;

  const { processedCode, renderName } = preprocessSectionCode(code);

  // @babel/standalone is a production dependency that runs fine in Node.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Babel = require("@babel/standalone") as {
    transform: (code: string, opts: Record<string, unknown>) => { code: string | null };
  };

  const result = Babel.transform(processedCode, {
    presets: ["react", "typescript"],
    filename: "section.tsx",
  });

  const compiled: CompiledSection = {
    js: result.code ?? "",
    renderName,
    contentHash,
  };
  lruSet(contentHash, compiled);
  return compiled;
}
