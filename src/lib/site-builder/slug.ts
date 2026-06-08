/** URL/identifier slugify: lowercase, ascii, hyphen-separated, trimmed. */
export function slugify(input: string, maxLen = 40): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen) || "untitled";
}
