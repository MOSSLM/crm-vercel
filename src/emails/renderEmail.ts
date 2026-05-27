import { render } from "@react-email/render";
import { createElement } from "react";
import { BaseEmail } from "./BaseEmail";
import type { SignatureData } from "@/components/messaging/SignatureSettings";

/**
 * Renders a plain-text email body + optional signature into a full
 * SAMA-branded HTML email using React Email.
 *
 * This is the async replacement for wrapEmailBodyHtml().
 */
export async function renderEmailHtml(
  body: string,
  signature?: SignatureData | null,
  preview?: string
): Promise<string> {
  return await render(
    createElement(BaseEmail, { body, signature, preview })
  );
}
