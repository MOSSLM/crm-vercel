"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "./DemIcon";
import { authedFetch } from "@/utils/authedFetch";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { urlPlaquette } from "@/lib/audit/plaquette-lien";
import { lienNonMesure } from "@/lib/analytics/trafic-interne";
import { formatEuros } from "@/lib/donnees-publiques/fiche";
import { trancheEffectifLabel } from "@/lib/donnees-publiques/effectif";
import BookingLinkPanel from "@/components/scheduling/BookingLinkPanel";
import type { CompanyBundle, DemAudit } from "./types";

const NOM_AXE: Record<string, string> = {
  vitesse: "Vitesse",
  seo: "Référencement",
  mobile: "Mobile",
  conversion: "Contact",
  popularite: "Popularité",
  accessibilite: "Accessibilité",
  bonnes_pratiques: "Bonnes pratiques",
};

const tone = (n: number) => (n >= 70 ? "var(--ok)" : n >= 45 ? "var(--warn)" : "var(--danger)");

function Ring({ v }: { v: number }) {
  const r = 22;
  const cir = 2 * Math.PI * r;
  return (
    <svg className="dm-ring" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke={tone(v)}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * cir} ${cir}`}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="30" textAnchor="middle" fontSize="14" fontFamily="var(--font-mono)" fill="var(--text)">
        {v}
      </text>
    </svg>
  );
}

function CopyUrl({ url }: { url: string }) {
  const [on, setOn] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setOn(true);
    toast.success("Lien copié.");
    setTimeout(() => setOn(false), 1600);
  };
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <div className="dm-url">
      <Icon name="link" className="ico-sm" style={{ color: "var(--text-3)", flexShrink: 0 }} />
      <span className="u">{shown}</span>
      <button className={`cp ${on ? "on" : ""}`.trim()} onClick={copy}>
        <Icon name={on ? "check" : "copy"} className="ico-xs" />
        {on ? "copié" : "copier"}
      </button>
    </div>
  );
}

/**
 * Le lien de la plaquette pour CE prospect — collectif tant qu'on ne l'a pas
 * demandé, nominatif dès qu'on clique.
 *
 * POURQUOI LE JETON SE FRAPPE AU CLIC, ET NON À L'OUVERTURE DE LA FICHE. Ouvrir
 * une fiche n'est pas envoyer un document. Poser un jeton à chaque coup d'œil
 * remplirait la table de liens jamais partis, et l'entonnoir compterait comme
 * « plaquette prête » des prospects à qui personne n'a rien proposé. Le clic,
 * lui, précède toujours l'envoi.
 *
 * L'appel est IDEMPOTENT — `assurer_jetons_plaquette` ne remplace jamais un
 * jeton déjà posé — donc recliquer rend le même lien, et ceux qui sont partis
 * par WhatsApp continuent d'ouvrir.
 *
 * LE REPLI EST LE LIEN COLLECTIF, JAMAIS RIEN. Si la route tombe pendant un
 * appel, l'agent doit pouvoir coller quelque chose qui ouvre le bon document :
 * il perd l'attribution de l'ouverture, pas la conversation.
 */
function PlaquetteLien({ entrepriseId }: { entrepriseId: number | null }) {
  const [urlNominative, setUrlNominative] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const preparer = async () => {
    if (entrepriseId == null) return;
    setEnCours(true);
    try {
      const res = await authedFetch("/api/agent/marketing-pipeline/plaquette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_ids: [entrepriseId] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        liens?: Array<{ url: string }>;
        echecs?: Array<{ motif: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Échec");
      // L'URL entière vient de la route : c'est elle qui sait comment le lien se
      // construit, et la recomposer ici ferait un second endroit à corriger le
      // jour où le chemin bouge.
      const url = data.liens?.[0]?.url;
      if (!url) throw new Error(data.echecs?.[0]?.motif ?? "aucun lien rendu");
      setUrlNominative(url);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Lien nominatif prêt — et copié.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lien nominatif indisponible");
    } finally {
      setEnCours(false);
    }
  };

  if (urlNominative) {
    return (
      <div style={{ marginTop: 9 }}>
        <CopyUrl url={urlNominative} />
        <div className="dm-hint" style={{ marginTop: 6 }}>
          <Icon name="check" className="ico-sm" />
          Lien nominatif — son ouverture remonte dans l&apos;entonnoir.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 9 }}>
      <CopyUrl url={urlPlaquette()} />
      {entrepriseId != null && (
        <button
          className="btn outline sm"
          style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
          onClick={preparer}
          disabled={enCours}
        >
          <Icon name="link" className="ico-sm" />
          {enCours ? "Préparation…" : "Préparer le lien nominatif"}
        </button>
      )}
    </div>
  );
}

export function DemSide({
  company,
  audit,
  opportuniteId,
}: {
  company: CompanyBundle;
  audit: DemAudit;
  opportuniteId: string | null;
}) {
  const { entreprise: e, donneesPubliques: dp, contacts, site, upcomingBooking } = company;
  const demoUrl = site && site.is_published ? demoShareUrl(site) : null;
  const primary = contacts.find((c) => c.is_decision_maker) ?? contacts[0] ?? null;

  return (
    <aside className="dm-side">
      {/* Site démo — rien n'est affiché tant qu'aucun site n'est publié. */}
      <div className="dm-blk">
        <h4>
          <Icon name="globe" className="ico-xs" />
          Site démo
          <span className="mo">{demoUrl ? "publié" : "non publié"}</span>
        </h4>
        {demoUrl ? (
          <>
            <CopyUrl url={demoUrl} />
            <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
              {/* `lienNonMesure` — la démo qu'on ouvre pour la vérifier avant
                  d'appeler ne doit pas ressortir en visite du prospect. L'URL
                  copiée juste au-dessus, elle, reste nue : c'est celle qui part. */}
              <a
                className="btn outline sm"
                style={{ flex: 1, justifyContent: "center" }}
                href={lienNonMesure(demoUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="ext" className="ico-sm" />
                Ouvrir
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="dm-hint warn">
              <Icon name="clock" className="ico-sm" />
              Démo non publiée — ne pas promettre de lien tant qu&apos;elle n&apos;est pas en ligne.
            </div>
            {/* CE QU'ON PEUT ENVOYER QUAND ON N'A RIEN DE PERSONNEL.
                C'est le cas de tout appel à froid, et de la cohorte B tant que
                son démo n'est pas construit : sans ce lien, l'agent raccroche
                en promettant « je vous envoie quelque chose » et n'a rien à
                envoyer. La plaquette ne nomme personne — elle est bâtie pour
                partir telle quelle (cf. `contenuImpersonnel`).

                DEUX LIENS, ET LE CHOIX SE FAIT AU CLIC. Le collectif est là
                tout de suite, parce qu'un agent au téléphone ne peut pas
                attendre ; le nominatif se frappe à la demande et c'est le seul
                dont l'ouverture remonte dans l'entonnoir. Voir `PlaquetteLien`
                pour la raison de ne pas le poser d'office. */}
            <PlaquetteLien entrepriseId={e.id ?? null} />
          </>
        )}
      </div>

      {/* Audit — masqué tant qu'aucune analyse n'existe. */}
      {audit && audit.note_globale != null && (
        <div className="dm-blk">
          <h4>
            <Icon name="clipboard" className="ico-xs" />
            Rapport d&apos;audit
          </h4>
          <div className="dm-score">
            <Ring v={audit.note_globale} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{audit.libelle ?? "Visibilité mesurée"}</div>
              {audit.url_analysee && (
                <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 2 }}>
                  {audit.url_analysee}
                </div>
              )}
            </div>
          </div>
          {audit.axes.length > 0 && (
            <div className="dm-bars">
              {audit.axes.map((a) => (
                <div className="dm-bar" key={a.id}>
                  <span className="t">{NOM_AXE[a.id] ?? a.id}</span>
                  <span className="g">
                    <i style={{ width: `${Math.max(a.note, 2)}%`, background: tone(a.note) }} />
                  </span>
                  <span className="n">{a.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prise de RDV — vrais créneaux, via le panneau déjà utilisé au cockpit. */}
      <div className="dm-blk">
        <h4>
          <Icon name="calendar" className="ico-xs" />
          Prise de rendez-vous
        </h4>
        {upcomingBooking && (
          <div className="dm-rdvc" style={{ marginBottom: 10 }}>
            <div className="lb">RDV confirmé</div>
            <div className="vl">
              {new Intl.DateTimeFormat("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(upcomingBooking.start_at))}
            </div>
            <div className="mt">{upcomingBooking.event_title}</div>
          </div>
        )}
        <BookingLinkPanel
          prospectName={primary ? `${primary.first_name ?? ""} ${primary.last_name ?? ""}`.trim() : e.name}
          prospectEmail={primary?.email ?? e.email}
          prospectPhone={primary?.tel ?? e.telephone}
          entrepriseId={e.id}
          opportuniteId={opportuniteId}
          contactId={primary?.id ?? null}
          contextLabel={e.name}
        />
      </div>

      {/* Dossier — chaque ligne n'existe que si la donnée existe. */}
      <div className="dm-blk">
        <h4>
          <Icon name="building" className="ico-xs" />
          Dossier
          <span className="mo">registre</span>
        </h4>
        {e.siret && (
          <div className="dm-kv">
            <span className="k">SIRET siège</span>
            <span className="v mono">{e.siret}</span>
          </div>
        )}
        {dp?.categorie_entreprise && (
          <div className="dm-kv">
            <span className="k">Catégorie</span>
            <span className="v">{dp.categorie_entreprise}</span>
          </div>
        )}
        {dp?.date_creation && (
          <div className="dm-kv">
            <span className="k">Créée</span>
            <span className="v">{dp.date_creation.slice(0, 10).split("-").reverse().join("/")}</span>
          </div>
        )}
        {trancheEffectifLabel(dp?.tranche_effectif_code ?? null) && (
          <div className="dm-kv">
            <span className="k">Effectif</span>
            <span className="v">{trancheEffectifLabel(dp?.tranche_effectif_code ?? null)}</span>
          </div>
        )}
        {dp?.chiffre_affaires != null && (
          <div className="dm-kv">
            <span className="k">CA {dp.exercice_annee ?? ""}</span>
            <span className="v">{formatEuros(dp.chiffre_affaires)}</span>
          </div>
        )}
        {dp?.resultat_net != null && (
          <div className="dm-kv">
            <span className="k">Résultat {dp.exercice_annee ?? ""}</span>
            <span className="v" style={dp.resultat_net < 0 ? { color: "var(--danger)" } : undefined}>
              {formatEuros(dp.resultat_net)}
            </span>
          </div>
        )}
        {e.telephone && (
          <div className="dm-kv">
            <span className="k">Téléphone standard</span>
            <span className="v mono">{e.telephone}</span>
          </div>
        )}
        {e.site_web_canonique && (
          <div className="dm-kv">
            <span className="k">Site actuel</span>
            <span className="v">{e.site_web_canonique}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
