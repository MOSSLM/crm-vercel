/** Strips imports/exports from TSX section code and resolves the component render name. */

export interface PreprocessResult {
  processedCode: string;
  renderName: string | null;
}

export function preprocessSectionCode(code: string): PreprocessResult {
  // Capture export default fn name before stripping keywords
  const exportDefaultFnMatch = code.match(/export\s+default\s+function\s+([A-Z]\w*)/);
  const exportDefaultName = exportDefaultFnMatch ? exportDefaultFnMatch[1] : null;

  const processedCode = code
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    .replace(/^['"]use client['"]\s*;?\s*$/gm, "")
    .replace(/^export\s+type\s+\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/gm, "")
    .replace(/^export\s+\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/gm, "")
    .replace(/^export\s+type\s+([\w]+)/gm, "type $1")
    .replace(/export\s+default\s+function\s+/g, "function ")
    .replace(/export\s+default\s+class\s+/g, "class ")
    .replace(/\nexport\s+default\s+(\w+)\s*;/g, "\n// exported: $1")
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, "$1 ");

  const fnMatch =
    processedCode.match(/^function\s+([A-Z]\w*)/m) ||
    processedCode.match(/^const\s+([A-Z]\w*)\s*=/m);

  const componentName = fnMatch ? fnMatch[1] : null;
  const exportedMatch = processedCode.match(/\/\/ exported:\s+(\w+)/);

  // Priority: explicit export default fn > export default identifier > first PascalCase
  const renderName = exportDefaultName ?? (exportedMatch ? exportedMatch[1] : componentName);

  return { processedCode, renderName };
}

/** Extract all Tailwind class tokens from raw TSX code using regex heuristics. */
export function extractClassTokens(code: string): string[] {
  const tokens = new Set<string>();

  const addClasses = (str: string) =>
    str.split(/\s+/).filter(Boolean).forEach((c) => tokens.add(c));

  // className="..." or className='...'
  for (const m of code.matchAll(/className=["']([^"']+)["']/g)) addClasses(m[1]);

  // className={`...`} template literals (static parts only)
  for (const m of code.matchAll(/className=\{`([^`]+)`\}/g)) {
    // Drop interpolations ${...}
    addClasses(m[1].replace(/\$\{[^}]*\}/g, " "));
  }

  // clsx / cn / classNames calls — extract string args
  for (const m of code.matchAll(/(?:clsx|cn|classNames?)\(([^)]+)\)/g)) {
    for (const s of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) addClasses(s[1]);
  }

  return [...tokens];
}
