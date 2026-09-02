"use client";

import { useEffect, useState } from "react";
import { Icon, Pill } from "./DemIcon";
import { DemEchange } from "./DemEchange";
import { DemNotes } from "./DemNotes";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import { lienWhatsApp } from "@/lib/prospects/canal";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import type { CompanyBundle } from "./types";

/**
 * La carte d'une entreprise ouverte HORS FILE — celle qui rappelle.
 *
 * Ici il n'y a ni tâche, ni étape, ni script : rien à « faire » au sens de la
 * file. Ce qu'il faut, c'est de quoi tenir la conversation qui est en train
 * d'avoir lieu — le numéro sous la main, où en est l'affaire, ce qui l'attend
 * (RDV pris, démo en ligne) — et l'historique juste en dessous, qui dit ce
 * qu'il s'est passé jusque-là.
 *
 * On n'invente aucune action : ouvrir cette fiche ne crée pas de tâche et
 * n'inscrit personne dans une séquence. Le rendez-vous se prend dans le
 * panneau de droite, qui fonctionne exactement pareil ici et dans la file.
 *
 * DEUX CHOSES S'ÉCRIVENT ICI, et la seconde est arrivée après coup.
 *
 * La note d'abord. Quelqu'un dit quelque chose — c'est précisément le moment où
 * l'information se perd, parce qu'il n'y a aucune tâche à boucler pour
 * l'emporter. Le bloc de notes est le même que celui des cartes de la file : ce
 * qu'on écrit là se relit partout ailleurs.
 *
 * L'ÉCHANGE ENSUITE (`DemEchange`), et ce n'est pas la même chose. Une note se
 * relit ; elle n'entre ni dans le fil, ni dans l'entonnoir, elle ne journalise
 * aucun envoi et ne dit rien à la séquence qui tourne. Or la plupart des fiches
 * ouvertes ici ne sont pas des inconnues : ce sont des prospects EN ATTENTE
 * entre deux étapes — 214 au 01/09/2026 — dont la carte suivante est datée de
 * dans deux jours et qui, eux, répondent maintenant. C'est le cas JM2C, et le
 * détail est dans l'en-tête de `/api/agent/demarchage/echange`.
 */
export function DemHorsFile({
  company,
  onRetour,
  onNote,
}: {
  company: CompanyBundle;
  onRetour: () => void;
  /** Une note a été enregistrée : l'historique juste en dessous doit se relire. */
  onNote?: () => void;
}) {
  const { entreprise: e, contacts, site, upcomingBooking, opportunite } = company;
  const dec = contacts.find((c) => c.is_decision_maker) ?? contacts[0] ?? null;

  // Tous les numéros connus, dédoublonnés : celui du décideur d'abord, le
  // standard ensuite. Quand quelqu'un rappelle, on ne sait pas lequel a servi.
  const numeros = [...new Set([dec?.tel, ...contacts.map((c) => c.tel), e.telephone].filter(
    (v): v is string => !!v && v.trim() !== "",
  ))];

  const demoUrl = site && site.is_published ? demoShareUrl(site) : null;
  const nomDec = dec ? `${dec.first_name ?? ""} ${dec.last_name ?? ""}`.trim() : "";

  // Changer d'entreprise vide le champ : ce qu'on écrivait pour l'une n'a rien
  // à faire dans le dossier de l'autre.
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [e.id]);

  return (
    <section className="dm-card" style={{ ["--k" as string]: "var(--accent)", ["--kt" as string]: "var(--accent-tint)" }}>
      <div className="dm-card-h">
        <span className="ic">
          <Icon name="phone" className="ico-sm" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ti">Fiche ouverte hors file</div>
          <div className="su">
            Aucune action ne l&apos;attendait aujourd&apos;hui — son dossier et tout son historique
            sont là.
          </div>
        </div>
        <div className="rt">
          <button className="btn outline sm" onClick={onRetour}>
            <Icon name="arrowRight" className="ico-sm" />
            Retour à la file
          </button>
        </div>
      </div>

      <div className="dm-card-b">
        {numeros.length > 0 ? (
          <div className="dm-hf-tel">
            {numeros.map((n) => (
              <span className="l" key={n}>
                <ClickToCallButton
                  to={n}
                  contactId={dec?.id ?? null}
                  entrepriseId={e.id}
                  opportuniteId={opportunite?.id ?? null}
                  variant="outline"
                  size="sm"
                  label={n}
                />
                {lienWhatsApp(n) && (
                  <a
                    className="btn outline sm icon"
                    title="WhatsApp"
                    href={lienWhatsApp(n) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="whatsapp" className="ico-sm" />
                  </a>
                )}
              </span>
            ))}
            {nomDec && <span className="q">demander {nomDec}</span>}
          </div>
        ) : (
          <div className="dm-hint warn">
            <Icon name="warning" className="ico-sm" />
            Aucun numéro connu sur cette fiche — note celui qui s&apos;affiche pendant l&apos;appel, il
            n&apos;y en a pas d&apos;autre trace.
          </div>
        )}

        {/* Où elle en est, en trois mentions au plus. Chacune n'existe que si
            elle est vraie : une pastille « pas de RDV » n'apprend rien. */}
        <div className="dm-hf-et">
          {opportunite ? (
            <Pill kind="accent">
              <Icon name="flag" className="ico-xs" />
              {opportunite.name || "Affaire en cours"}
              {opportunite.stageNom ? ` · ${opportunite.stageNom}` : ""}
            </Pill>
          ) : (
            <Pill>
              <Icon name="flag" className="ico-xs" />
              aucune affaire ouverte
            </Pill>
          )}
          {upcomingBooking && (
            <Pill kind="ok">
              <Icon name="calCheck" className="ico-xs" />
              RDV le{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(upcomingBooking.start_at))}
            </Pill>
          )}
          {demoUrl && (
            <Pill kind="magic">
              <Icon name="globe" className="ico-xs" />
              site démo en ligne
            </Pill>
          )}
        </div>

        <DemNotes
          entrepriseId={e.id}
          contactId={dec?.id ?? null}
          opportuniteId={opportunite?.id ?? null}
          valeur={note}
          setValeur={setNote}
          placeholder={`Ce que ${nomDec.split(" ")[0] || "le prospect"} vient de dire…`}
          onEnregistree={onNote}
        />

        <DemEchange entrepriseId={e.id} onConsigne={onNote} />

        <div className="dm-hint">
          <Icon name="info" className="ico-sm" />
          Elle n&apos;a pas de tâche en file : aucune carte ne se ferme ici. Pour caler un
          rendez-vous, le panneau de droite propose les vrais créneaux ; l&apos;échange se relit
          juste en dessous.
        </div>

        <div className="dm-cta2">
          <a
            className="btn outline sm"
            href={`/espace-agent/entreprises/${e.id}`}
            style={{ justifyContent: "center" }}
          >
            <Icon name="ext" className="ico-sm" />
            Fiche complète
          </a>
          <a className="btn outline sm" href="#messages-history" style={{ justifyContent: "center" }}>
            <Icon name="layers" className="ico-sm" />
            Relire les échanges
          </a>
        </div>
      </div>
    </section>
  );
}
