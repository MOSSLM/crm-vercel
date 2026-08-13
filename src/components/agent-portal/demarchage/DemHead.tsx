"use client";

import { Icon, Pill } from "./DemIcon";
import { stageTint } from "@/components/agent-portal/format";
import { trancheEffectifLabel } from "@/lib/donnees-publiques/effectif";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import { lienWhatsApp } from "@/lib/prospects/canal";
import type { CompanyBundle, DemarchageSequenceInfo, DemAudit } from "./types";

/** Euros courts — « 1,25 M€ », « 480 k€ ». Même règle que la maquette. */
export function eurShort(n: number | null | undefined): string | null {
  if (n == null) return null;
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1_000_000) return s + (a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 2).replace(".", ",") + " M€";
  if (a >= 1_000) return s + Math.round(a / 1_000) + " k€";
  return s + a + " €";
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "?";

/** Couleur d'avatar stable, dérivée du nom — pas de champ couleur en base. */
const AV_COLORS = ["#2F7AE0", "#0E93A6", "#7A5AE0", "#1F8A5B", "#C8881F", "#A24E86"];
function colorOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

function Stat({
  ic,
  k,
  v,
  sub,
  neg,
  wide,
}: {
  ic: string;
  k: string;
  v: string;
  sub?: string | null;
  neg?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`dm-st ${neg ? "neg" : ""} ${wide ? "wide" : ""}`.trim()}>
      <span className="ic">
        <Icon name={ic} className="ico-sm" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="k">{k}</div>
        <div className="v">{v}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
    </div>
  );
}

export function DemHead({
  company,
  sequence,
  audit,
}: {
  company: CompanyBundle;
  sequence: DemarchageSequenceInfo | null;
  audit: DemAudit;
}) {
  const { entreprise: e, donneesPubliques: dp, contacts, opportunite } = company;
  const name = e.name || dp?.denomination || "Sans nom";
  const dec = contacts.find((c) => c.is_decision_maker) ?? contacts[0] ?? null;
  const stageNom = opportunite?.stageNom ?? null;

  const effectif = trancheEffectifLabel(dp?.tranche_effectif_code ?? null);
  const ca = eurShort(dp?.chiffre_affaires);
  const rn = eurShort(dp?.resultat_net);
  const adresse = [e.adresse].filter(Boolean).join(", ");
  const villeLigne = [e.code_postal, e.ville].filter(Boolean).join(" ");
  const siren = e.siret ? e.siret.slice(0, 9) : null;
  const creee = dp?.date_creation ? dp.date_creation.slice(0, 4) : null;

  // Rien n'est inventé : chaque tuile n'existe que si sa donnée existe.
  const stats: React.ReactNode[] = [];
  if (effectif) stats.push(<Stat key="eff" ic="users" k="Effectif" v={effectif} sub={dp?.tranche_effectif_annee ? `tranche ${dp.tranche_effectif_annee}` : null} />);
  if (ca) stats.push(<Stat key="ca" ic="trending" k="Chiffre d'affaires" v={ca} sub={dp?.exercice_annee ? `exercice ${dp.exercice_annee}` : null} />);
  if (rn) stats.push(<Stat key="rn" ic="banknote" k="Résultat net" v={rn} sub={dp?.exercice_annee ? `exercice ${dp.exercice_annee}` : null} neg={(dp?.resultat_net ?? 0) < 0} />);
  if (audit?.note_globale != null) stats.push(<Stat key="au" ic="target" k="Score audit" v={`${audit.note_globale}/100`} sub={audit.libelle} />);
  if (e.site_web_canonique || audit?.url_analysee) stats.push(<Stat key="site" ic="globe" k="Site actuel" v={e.site_web_canonique || audit?.url_analysee || ""} />);
  if (dp?.categorie_entreprise || dp?.naf_code) {
    stats.push(
      <Stat
        key="naf"
        ic="briefcase"
        k="Catégorie · NAF"
        v={[dp?.categorie_entreprise, dp?.naf_code].filter(Boolean).join(" · ")}
        sub={creee ? `créée en ${creee}` : null}
      />,
    );
  }
  if (adresse || villeLigne) {
    stats.push(<Stat key="adr" ic="mappin" k="Adresse du siège" v={adresse || villeLigne} sub={adresse ? villeLigne : null} wide />);
  }

  return (
    <header className="dm-head">
      <div className="dm-hd">
        <span className="lg" style={{ background: colorOf(name) }}>
          {initialsOf(name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm">
            {name}
            {stageNom && (
              <span className="pill" style={{ background: "var(--bg-2)", color: "var(--text-2)" }}>
                <span
                  style={{ width: 7, height: 7, borderRadius: "50%", background: stageTint(stageNom) }}
                />
                {stageNom}
              </span>
            )}
          </div>
          <div className="sb">
            {sequence?.name && (
              <span className="it">
                <Icon name="flow" className="ico-xs" style={{ color: "var(--magic)" }} />
                {sequence.name}
                {sequence.stepIndex != null && (
                  <span className="mono">
                    {sequence.stepIndex}/{sequence.totalSteps}
                  </span>
                )}
              </span>
            )}
            {siren && (
              <span className="it mono">
                <Icon name="hash" className="ico-xs" />
                SIREN {siren}
              </span>
            )}
            {creee && (
              <span className="it">
                <Icon name="briefcase" className="ico-xs" />
                créée en {creee}
              </span>
            )}
            {e.ville && (
              <span className="it">
                <Icon name="mappin" className="ico-xs" />
                {e.ville}
              </span>
            )}
          </div>
        </div>
        <div className="act">
          {dec?.tel && (
            <ClickToCallButton
              to={dec.tel}
              contactId={dec.id}
              entrepriseId={e.id}
              variant="outline"
              size="sm"
              label={dec.tel}
            />
          )}
          {dec?.tel && lienWhatsApp(dec.tel) && (
            <a
              className="btn outline sm icon"
              title="WhatsApp"
              href={lienWhatsApp(dec.tel) ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="whatsapp" className="ico-sm" />
            </a>
          )}
          {dec?.email && (
            <a className="btn outline sm icon" title={dec.email} href={`mailto:${dec.email}`}>
              <Icon name="mail" className="ico-sm" />
            </a>
          )}
          <a className="btn ghost sm icon" title="Fiche complète" href={`/espace-agent/entreprises/${e.id}`}>
            <Icon name="ext" className="ico-sm" />
          </a>
        </div>
      </div>

      {stats.length > 0 && <div className="dm-stats">{stats}</div>}

      {contacts.length > 0 && (
        <div className="dm-ct">
          {contacts.map((c) => {
            const n = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact";
            return (
              <div className="c" key={c.id}>
                <span className="av">{initialsOf(n)}</span>
                <div className="who">
                  <div className="n">
                    {n}
                    {c.is_decision_maker && <span className="dec" title="décideur" />}
                  </div>
                  {c.role_title && <div className="r">{c.role_title}</div>}
                </div>
                {c.tel && <span className="tl">{c.tel}</span>}
                <span className="bt">
                  {c.tel && (
                    <ClickToCallButton
                      to={c.tel}
                      contactId={c.id}
                      entrepriseId={e.id}
                      size="icon"
                      variant="ghost"
                      label="Appeler"
                    />
                  )}
                  {c.linkedin_url && (
                    <a className="btn ghost xs icon" title="LinkedIn" href={c.linkedin_url} target="_blank" rel="noreferrer">
                      <Icon name="linkedin" className="ico-xs" />
                    </a>
                  )}
                  {c.email && (
                    <a className="btn ghost xs icon" title={c.email} href={`mailto:${c.email}`}>
                      <Icon name="mail" className="ico-xs" />
                    </a>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}

export { Pill };
