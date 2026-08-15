"use client";

import { useEffect, useState } from "react";
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

/** Une tuile du dossier, sous sa forme DONNÉE — l'en-tête en rend deux vues. */
type StatItem = {
  key: string;
  ic: string;
  k: string;
  v: string;
  sub?: string | null;
  neg?: boolean;
  wide?: boolean;
};

function Stat({ ic, k, v, sub, neg, wide }: Omit<StatItem, "key">) {
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

/** Mémorise l'état déplié du dossier — une préférence de poste, pas de session. */
const CLE_DEPLOYE = "dem.head.open";

/**
 * L'en-tête est REPLIÉ par défaut.
 *
 * Déplié, il empile trois bandeaux — identité, sept tuiles de dossier, un
 * contact par ligne — soit près de 200 px avant la première action. Sur un
 * 13 pouces (800 px utiles), la carte d'action passe sous la ligne de
 * flottaison et on démarche en scrollant. Or ce qu'on lit en décrochant, c'est
 * le script, pas le chiffre d'affaires 2023.
 *
 * Rien n'est supprimé : replié, l'en-tête garde le nom, la séquence, les
 * boutons d'appel, et résume les tuiles sur une seule ligne. Un clic redéploie,
 * et le choix est retenu — un grand écran ne repliera qu'une fois.
 */
function useDossierDeploye(): [boolean, () => void] {
  // Toujours replié au premier rendu, y compris côté serveur : lire
  // localStorage dans l'état initial ferait diverger le HTML hydraté.
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    try {
      setOuvert(window.localStorage.getItem(CLE_DEPLOYE) === "1");
    } catch {
      /* stockage indisponible (navigation privée) : on reste replié */
    }
  }, []);
  const basculer = () =>
    setOuvert((v) => {
      try {
        window.localStorage.setItem(CLE_DEPLOYE, v ? "0" : "1");
      } catch {
        /* sans mémoire, la bascule vaut quand même pour la session */
      }
      return !v;
    });
  return [ouvert, basculer];
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
  const [ouvert, basculer] = useDossierDeploye();
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
  const stats: StatItem[] = [];
  if (effectif) stats.push({ key: "eff", ic: "users", k: "Effectif", v: effectif, sub: dp?.tranche_effectif_annee ? `tranche ${dp.tranche_effectif_annee}` : null });
  if (ca) stats.push({ key: "ca", ic: "trending", k: "Chiffre d'affaires", v: ca, sub: dp?.exercice_annee ? `exercice ${dp.exercice_annee}` : null });
  if (rn) stats.push({ key: "rn", ic: "banknote", k: "Résultat net", v: rn, sub: dp?.exercice_annee ? `exercice ${dp.exercice_annee}` : null, neg: (dp?.resultat_net ?? 0) < 0 });
  if (audit?.note_globale != null) stats.push({ key: "au", ic: "target", k: "Score audit", v: `${audit.note_globale}/100`, sub: audit.libelle });
  if (e.site_web_canonique || audit?.url_analysee) stats.push({ key: "site", ic: "globe", k: "Site actuel", v: e.site_web_canonique || audit?.url_analysee || "" });
  if (dp?.categorie_entreprise || dp?.naf_code) {
    stats.push({
      key: "naf",
      ic: "briefcase",
      k: "Catégorie · NAF",
      v: [dp?.categorie_entreprise, dp?.naf_code].filter(Boolean).join(" · "),
      sub: creee ? `créée en ${creee}` : null,
    });
  }
  if (adresse || villeLigne) {
    stats.push({ key: "adr", ic: "mappin", k: "Adresse du siège", v: adresse || villeLigne, sub: adresse ? villeLigne : null, wide: true });
  }
  const aUnDossier = stats.length > 0 || contacts.length > 0;

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
          {aUnDossier && (
            <button
              type="button"
              className="btn ghost sm"
              aria-expanded={ouvert}
              onClick={basculer}
              title={ouvert ? "Replier le dossier — rendre la place à la carte d'action" : "Déplier le dossier"}
            >
              <Icon name={ouvert ? "chevronUp" : "chevronDown"} className="ico-sm" />
              Dossier
            </button>
          )}
        </div>
      </div>

      {/* Replié, le dossier tient sur une ligne : mêmes valeurs, sans les
          bandeaux. C'est ce qui rend au centre de l'écran les ~150 px que la
          carte d'action réclamait sur un 13 pouces. */}
      {!ouvert && stats.length > 0 && (
        <div className="dm-sum">
          {stats.map((s) => (
            <span className="it" key={s.key} title={s.sub ?? undefined}>
              <Icon name={s.ic} className="ico-xs" />
              <em>{s.k}</em>
              <b className={s.neg ? "neg" : undefined}>{s.v}</b>
            </span>
          ))}
          {contacts.length > 0 && (
            <span className="it">
              <Icon name="users" className="ico-xs" />
              <em>Contacts</em>
              <b>{contacts.length}</b>
            </span>
          )}
        </div>
      )}

      {ouvert && stats.length > 0 && (
        <div className="dm-stats">
          {stats.map((s) => (
            <Stat key={s.key} ic={s.ic} k={s.k} v={s.v} sub={s.sub} neg={s.neg} wide={s.wide} />
          ))}
        </div>
      )}

      {ouvert && contacts.length > 0 && (
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
