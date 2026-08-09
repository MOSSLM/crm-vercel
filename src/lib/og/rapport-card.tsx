import "server-only";
import type React from "react";
import { OG_WIDTH, OG_HEIGHT } from "@/lib/og/render-card";

/**
 * La vignette du rapport d'audit.
 *
 * Elle a un travail différent de celle du démo : le démo montre une belle
 * chose, le rapport montre un CHIFFRE. Une note sur 100 dans une conversation
 * WhatsApp se clique — c'est la seule promesse à tenir ici, et tout le reste de
 * la carte lui laisse la place.
 *
 * Palette du kit : nuit #0B1D3A, azur #3A7BD5, brume #B5D0F0.
 */

const NUIT = "#0B1D3A";
const BRUME = "#B5D0F0";
const BLANC = "#E8F3FF";

const LOGO_PATH =
  "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";

export interface RapportCardData {
  companyName: string;
  city?: string | null;
  noteGlobale: number | null;
  libelle?: string | null;
  axes: Array<{ id: string; nom: string; note: number }>;
  displayFont: string;
  bodyFont: string;
}

function ton(note: number): string {
  return note >= 70 ? "#4FB98A" : note >= 45 ? "#E0A63C" : "#E06A5E";
}

export function RapportCard(d: RapportCardData): React.ReactElement {
  const note = d.noteGlobale;
  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(135deg, ${NUIT} 0%, #12305F 100%)`,
        fontFamily: d.bodyFont,
        color: BLANC,
        padding: "54px 64px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width={26} height={26} viewBox="0 0 100 100">
            <path fill={BRUME} fillRule="evenodd" d={LOGO_PATH} />
          </svg>
          <span
            style={{
              fontFamily: d.displayFont,
              fontSize: 19,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
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
          Analyse de votre site
        </span>
      </div>

      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56, paddingTop: 20 }}>
        {note != null ? <Anneau note={note} font={d.displayFont} /> : null}

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              fontFamily: d.displayFont,
              fontSize: note != null ? 52 : 64,
              lineHeight: 1.05,
              color: "#FFFFFF",
              maxHeight: 130,
              overflow: "hidden",
            }}
          >
            {d.companyName}
          </div>
          {d.city ? (
            <div style={{ fontSize: 23, color: "rgba(232,243,255,0.7)", marginTop: 12 }}>{d.city}</div>
          ) : null}

          {d.axes.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
              {d.axes.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(58,123,213,0.18)",
                    border: "1px solid rgba(181,208,240,0.24)",
                    borderRadius: 8,
                    padding: "9px 15px",
                  }}
                >
                  <span style={{ fontSize: 18, color: "rgba(232,243,255,0.72)" }}>{a.nom}</span>
                  <span style={{ fontSize: 20, color: ton(a.note) }}>{a.note}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 22, color: "rgba(232,243,255,0.6)", marginTop: 24 }}>
              Votre analyse est prête
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * L'anneau de note, en SVG.
 *
 * PAS de `conic-gradient` : satori ne le connaît pas, et il ne l'ignore pas
 * poliment — il échoue. La carte du rapport n'aurait donc JAMAIS été produite,
 * défaut invisible en test puisque rien ne rend cette carte hors production.
 *
 * Un cercle avec `stroke-dasharray` fait le même dessin, en SVG que satori
 * rasterise sans difficulté. La rotation de -90° amène le départ de l'arc en
 * haut plutôt qu'à droite.
 */
function Anneau({ note, font }: { note: number; font: string }) {
  const taille = 260;
  const epaisseur = 22;
  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;
  const rempli = (Math.max(0, Math.min(100, note)) / 100) * circonference;

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: taille,
        height: taille,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={taille}
        height={taille}
        viewBox={`0 0 ${taille} ${taille}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke="rgba(181,208,240,0.16)"
          strokeWidth={epaisseur}
        />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke={ton(note)}
          strokeWidth={epaisseur}
          strokeDasharray={`${rempli} ${circonference - rempli}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
        />
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontFamily: font, fontSize: 92, lineHeight: 1, color: "#FFFFFF" }}>{note}</span>
        <span style={{ fontSize: 19, color: "rgba(181,208,240,0.6)", marginTop: 6 }}>sur 100</span>
      </div>
    </div>
  );
}
