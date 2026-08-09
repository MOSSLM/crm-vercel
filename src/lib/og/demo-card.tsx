/* eslint-disable @next/next/no-img-element */
import "server-only";
import type React from "react";
import { OG_WIDTH, OG_HEIGHT } from "@/lib/og/render-card";

/**
 * La carte de partage d'un lien démo.
 *
 * Ce qu'elle doit réussir : être lisible dans une vignette WhatsApp de ~250 px
 * de large, sur un téléphone, en une seconde. Tout le reste est secondaire.
 * D'où l'ordre de lecture — logo et nom d'abord, ville et métier ensuite, la
 * capture du site à droite comme preuve que quelque chose existe déjà.
 *
 * DEUX CONTRAINTES SATORI, non négociables :
 *   - tout conteneur à plus d'un enfant porte `display: flex` explicitement ;
 *   - les images distantes doivent être en PNG ou JPEG (d'où `ensure-og-logo`
 *     et `ensure-demo-screenshot`, qui normalisent en amont).
 *
 * LE REPLI EST LE CŒUR DU FICHIER, pas un cas limite : sans capture, on rend la
 * variante centrée plutôt qu'un cadre vide. Une carte blanche sur WhatsApp est
 * pire que pas de carte du tout, parce qu'elle a l'air cassée.
 */

/** Palette du kit d'identité — miroir de `C` dans `AuditShared.tsx`. */
const NUIT = "#0B1D3A";
const AZUR = "#3A7BD5";
const BRUME = "#B5D0F0";
const BLANC = "#E8F3FF";

export interface DemoCardData {
  companyName: string;
  city?: string | null;
  serviceTags?: string[];
  /** Note Google et volume d'avis, affichés seulement si les deux sont là. */
  rating?: number | null;
  reviewCount?: number | null;
  /** Logo client déjà normalisé en PNG (`ensure-og-logo`). */
  logoUrl?: string | null;
  /** Capture du démo (`ensure-demo-screenshot`). Absente ⇒ variante centrée. */
  shotUrl?: string | null;
  /** Couleur primaire du site, qui teinte le fond. */
  primaryColor?: string | null;
  /** Domaine affiché dans la barre d'adresse du mockup. */
  domain?: string | null;
  displayFont: string;
  bodyFont: string;
}

/** `#rgb` / `#rrggbb` → `r, g, b`. Renvoie null sur tout le reste. */
function rgbOf(hex: string | null | undefined): [number, number, number] | null {
  const m = (hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Le fond : la couleur du site, assombrie, en dégradé vers le nuit de la marque.
 * Sur une couleur claire (beaucoup de sites d'artisan sont en blanc cassé) un
 * dégradé direct donnerait un texte illisible — d'où l'assombrissement.
 */
function backdrop(primary: string | null | undefined): string {
  const rgb = rgbOf(primary);
  if (!rgb) return `linear-gradient(135deg, ${NUIT} 0%, #12305F 100%)`;
  const [r, g, b] = rgb.map((c) => Math.round(c * 0.45));
  return `linear-gradient(135deg, rgb(${r}, ${g}, ${b}) 0%, ${NUIT} 100%)`;
}

/** Le logo SAMA : un `path` inline, que satori rend sans difficulté. */
const LOGO_PATH =
  "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";

function SamaMark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path fill={color} fillRule="evenodd" d={LOGO_PATH} />
    </svg>
  );
}

export function DemoCard(data: DemoCardData): React.ReactElement {
  const withShot = Boolean(data.shotUrl);
  const tags = (data.serviceTags ?? []).filter(Boolean).slice(0, 3);
  const hasRating =
    typeof data.rating === "number" && data.rating > 0 &&
    typeof data.reviewCount === "number" && data.reviewCount > 0;

  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        flexDirection: "column",
        background: backdrop(data.primaryColor),
        fontFamily: data.bodyFont,
        color: BLANC,
        padding: withShot ? "56px 60px" : "72px 80px",
      }}
    >
      {/* Bandeau de marque */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SamaMark size={26} color={BRUME} />
          <span
            style={{
              fontFamily: data.displayFont,
              fontSize: 19,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              color: BLANC,
              paddingLeft: "0.42em",
            }}
          >
            SAMA
          </span>
        </div>
        <span
          style={{
            fontSize: 15,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(181,208,240,0.62)",
          }}
        >
          Votre site est prêt
        </span>
      </div>

      {withShot ? (
        <SplitLayout data={data} tags={tags} hasRating={hasRating} />
      ) : (
        <CenteredLayout data={data} tags={tags} hasRating={hasRating} />
      )}
    </div>
  );
}

type LayoutProps = { data: DemoCardData; tags: string[]; hasRating: boolean };

/** Variante par défaut : identité à gauche, capture encadrée à droite. */
function SplitLayout({ data, tags, hasRating }: LayoutProps) {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 44, paddingTop: 30 }}>
      <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
        <Identity data={data} size="compact" />
        <Meta data={data} tags={tags} hasRating={hasRating} />
      </div>
      <BrowserMockup shotUrl={data.shotUrl as string} domain={data.domain} bodyFont={data.bodyFont} />
    </div>
  );
}

/**
 * Variante sans capture. Ce n'est pas un pis-aller : c'est ce qui s'affiche
 * quand le service de capture est en panne, quand le site vient d'être publié,
 * ou quand la carte est fabriquée à la volée pendant un unfurl. Elle doit être
 * présentable telle quelle.
 */
function CenteredLayout({ data, tags, hasRating }: LayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <Identity data={data} size="large" />
      <Meta data={data} tags={tags} hasRating={hasRating} centered />
    </div>
  );
}

function Identity({ data, size }: { data: DemoCardData; size: "compact" | "large" }) {
  const logoBox = size === "large" ? 108 : 76;
  const nameSize = size === "large" ? 66 : 50;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: size === "large" ? "center" : "flex-start",
        gap: 20,
      }}
    >
      {data.logoUrl ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: logoBox,
            height: logoBox,
            borderRadius: 14,
            background: "rgba(255,255,255,0.94)",
            padding: 10,
          }}
        >
          <img
            src={data.logoUrl}
            width={logoBox - 20}
            height={logoBox - 20}
            alt=""
            style={{ objectFit: "contain" }}
          />
        </div>
      ) : null}
      <div
        style={{
          fontFamily: data.displayFont,
          fontSize: nameSize,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          color: "#FFFFFF",
          // Un nom d'entreprise long ne doit ni déborder ni réduire la capture :
          // satori ne sait pas ajuster la taille, on borne donc la hauteur.
          maxHeight: nameSize * 2.2,
          overflow: "hidden",
        }}
      >
        {data.companyName}
      </div>
    </div>
  );
}

function Meta({
  data,
  tags,
  hasRating,
  centered,
}: LayoutProps & { centered?: boolean }) {
  const line = [data.city?.trim(), ...tags].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: centered ? "center" : "flex-start",
        gap: 16,
        marginTop: 22,
      }}
    >
      {line ? (
        <div style={{ fontSize: 25, color: "rgba(232,243,255,0.78)", lineHeight: 1.4 }}>{line}</div>
      ) : null}
      {hasRating ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(58,123,213,0.22)",
            border: `1px solid rgba(181,208,240,0.32)`,
            borderRadius: 999,
            padding: "9px 18px",
          }}
        >
          <span style={{ color: "#FFC65C", fontSize: 21 }}>★</span>
          <span style={{ fontSize: 21, color: BLANC }}>
            {(data.rating as number).toFixed(1).replace(".", ",")}
          </span>
          <span style={{ fontSize: 18, color: "rgba(181,208,240,0.66)" }}>
            {data.reviewCount} avis
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Le cadre navigateur, repris du mockup déjà dessiné dans `AuditPage1.tsx` et
 * dans le rendu mobile du kit (`.mockup-chrome` / `.mockup-url`). Le reprendre
 * plutôt que d'en inventer un autre, c'est ce qui fait que la vignette, le deck
 * A4 et le rapport web se ressemblent.
 */
function BrowserMockup({
  shotUrl,
  domain,
  bodyFont,
}: {
  shotUrl: string;
  domain?: string | null;
  bodyFont: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 512,
        height: 372,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(181,208,240,0.3)",
        background: NUIT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(11,29,58,0.92)",
          padding: "11px 14px",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 9, height: 9, borderRadius: 9, background: "rgba(255,100,100,0.55)" }} />
          <div style={{ width: 9, height: 9, borderRadius: 9, background: "rgba(255,200,0,0.55)" }} />
          <div style={{ width: 9, height: 9, borderRadius: 9, background: "rgba(100,200,100,0.55)" }} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flex: 1,
            height: 22,
            borderRadius: 5,
            background: "rgba(255,255,255,0.1)",
            padding: "0 10px",
            fontFamily: bodyFont,
            fontSize: 13,
            color: "rgba(181,208,240,0.7)",
          }}
        >
          {domain ?? ""}
        </div>
      </div>
      <img src={shotUrl} width={512} height={330} alt="" style={{ objectFit: "cover" }} />
    </div>
  );
}
