import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Link,
  Preview,
} from "@react-email/components";
import * as React from "react";
import type { SignatureData } from "@/components/messaging/SignatureSettings";

// SAMA brand tokens
const NUIT  = "#0B1D3A";
const AZUR  = "#3A7BD5";
const CREME = "#F4F1EB";

interface BaseEmailProps {
  body: string;
  signature?: SignatureData | null;
  preview?: string;
}

/**
 * Converts plain text (with \n) into React Email paragraph elements.
 * Double newlines → paragraph breaks; single newlines → <br />.
 */
function bodyToElements(text: string): React.ReactNode[] {
  return text
    .split(/\n{2,}/)
    .map((para, i) => {
      const trimmed = para.trim();
      if (!trimmed) return null;
      const lines = trimmed.split(/\n/);
      return (
        <Text
          key={i}
          style={{
            margin: "0 0 16px 0",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: "15px",
            color: "rgba(11,29,58,0.8)",
            lineHeight: "1.75",
          }}
        >
          {lines.map((line, j) => (
            <React.Fragment key={j}>
              {line}
              {j < lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </Text>
      );
    })
    .filter(Boolean) as React.ReactNode[];
}

export function BaseEmail({ body, signature, preview }: BaseEmailProps) {
  const accentColor = signature?.accent_color || AZUR;
  const fullName = [signature?.first_name, signature?.last_name].filter(Boolean).join(" ");
  const titleLine = [signature?.job_title, signature?.company].filter(Boolean).join(" · ");
  const hasSig = !!(fullName || titleLine || signature?.email || signature?.phone);

  return (
    <Html lang="fr">
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body
        style={{
          margin: "0",
          padding: "0",
          backgroundColor: "#f0ede6",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <Container
          style={{
            maxWidth: "620px",
            margin: "32px auto",
            backgroundColor: CREME,
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          {/* ── Header ── */}
          <Section style={{ backgroundColor: NUIT, padding: "24px 36px" }}>
            <Text
              style={{
                margin: "0 0 4px 0",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontWeight: "300",
                fontSize: "14px",
                letterSpacing: "0.38em",
                color: "rgba(181,208,240,0.75)",
                textTransform: "uppercase",
              }}
            >
              SAMA
            </Text>
            <Text
              style={{
                margin: "0",
                fontSize: "9px",
                fontWeight: "bold",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: AZUR,
                fontFamily: "Arial, Helvetica, sans-serif",
              }}
            >
              Agence Digitale
            </Text>
          </Section>

          {/* ── Body ── */}
          <Section style={{ padding: "36px" }}>
            {bodyToElements(body)}

            {/* ── Signature ── */}
            {hasSig && (
              <>
                <Hr
                  style={{
                    borderColor: "rgba(11,29,58,0.10)",
                    margin: "20px 0 16px",
                  }}
                />
                <table
                  cellPadding="0"
                  cellSpacing="0"
                  style={{ borderCollapse: "collapse", fontFamily: "Arial, Helvetica, sans-serif" }}
                >
                  <tbody>
                    <tr>
                      {/* Accent bar */}
                      <td
                        style={{
                          width: "3px",
                          backgroundColor: accentColor,
                          verticalAlign: "top",
                        }}
                      >
                        &nbsp;
                      </td>
                      {/* Name / title / contacts */}
                      <td style={{ padding: "0 20px 0 14px", verticalAlign: "top" }}>
                        {fullName && (
                          <Text
                            style={{
                              margin: "0 0 3px 0",
                              fontFamily: "Georgia, 'Times New Roman', serif",
                              fontSize: "16px",
                              color: NUIT,
                              lineHeight: "1.2",
                            }}
                          >
                            {fullName}
                          </Text>
                        )}
                        {titleLine && (
                          <Text
                            style={{
                              margin: "0 0 10px 0",
                              fontSize: "9px",
                              fontWeight: "bold",
                              letterSpacing: "0.2em",
                              textTransform: "uppercase",
                              color: accentColor,
                            }}
                          >
                            {titleLine}
                          </Text>
                        )}
                        {signature?.email && (
                          <Text style={{ margin: "0 0 3px 0", fontSize: "11px", color: "rgba(11,29,58,0.6)" }}>
                            📧&nbsp;
                            <Link
                              href={`mailto:${signature.email}`}
                              style={{ color: "rgba(11,29,58,0.6)", textDecoration: "none" }}
                            >
                              {signature.email}
                            </Link>
                          </Text>
                        )}
                        {signature?.phone && (
                          <Text style={{ margin: "0 0 3px 0", fontSize: "11px", color: "rgba(11,29,58,0.6)" }}>
                            📞&nbsp;{signature.phone}
                          </Text>
                        )}
                        {signature?.website && (
                          <Text style={{ margin: "0 0 3px 0", fontSize: "11px", color: "rgba(11,29,58,0.6)" }}>
                            🌐&nbsp;
                            <Link
                              href={signature.website}
                              style={{ color: "rgba(11,29,58,0.6)", textDecoration: "none" }}
                            >
                              {signature.website.replace(/^https?:\/\//, "")}
                            </Link>
                          </Text>
                        )}
                        {signature?.linkedin_url && (
                          <Text style={{ margin: "0", fontSize: "11px", color: "rgba(11,29,58,0.6)" }}>
                            🔗&nbsp;
                            <Link
                              href={signature.linkedin_url}
                              style={{ color: "rgba(11,29,58,0.6)", textDecoration: "none" }}
                            >
                              LinkedIn
                            </Link>
                          </Text>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </Section>

          {/* ── Footer ── */}
          <Section
            style={{
              backgroundColor: NUIT,
              padding: "18px 36px",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                margin: "0",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: "10px",
                color: "rgba(181,208,240,0.3)",
                lineHeight: "1.7",
              }}
            >
              SAMA &middot; Agence Digitale &middot; contact@sama.fr &middot; sama.fr
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
