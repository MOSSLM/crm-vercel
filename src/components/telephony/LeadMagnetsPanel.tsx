"use client";

/**
 * Les lead magnets du prospect, dans le cockpit d'appel.
 *
 * CE QU'IL RÉSOUT. Les deux objets qu'on envoie à un prospect — son site démo
 * et son rapport d'audit — vivaient chacun dans un écran différent : le kanban
 * du site builder pour l'un, la fiche entreprise ou le pipeline marketing pour
 * l'autre. Pendant un appel, aller les chercher veut dire quitter le cockpit,
 * donc perdre la file, la minuterie et les notes en cours. Résultat observé :
 * on décrit le site au téléphone au lieu de l'envoyer pendant qu'on parle.
 *
 * L'INTERRUPTEUR DE PAIEMENT EST ICI, et pas seulement dans le kanban. C'est
 * le seul moment où la décision se prend : le prospect dit oui, on active la
 * barre « Acheter ce site » et on lui envoie le lien dans la même minute. Le
 * kanban garde son bouton pour les activations en lot, en amont ; le cockpit
 * porte l'activation unitaire, au moment où elle a un sens.
 *
 * TOUT PART DU MÊME ENDROIT : ouvrir, copier, WhatsApp, email. Un lien copié
 * sans support d'envoi finit dans un presse-papier oublié.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Lock,
  LockOpen,
  Mail,
  MessageCircle,
  Pencil,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authedFetch } from "@/utils/authedFetch";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { lienNonMesure } from "@/lib/analytics/trafic-interne";
import { lienWhatsApp } from "@/lib/telephone";

interface SiteLM {
  id: string;
  name: string | null;
  published_subdomain: string | null;
  is_published: boolean | null;
  paywall_enabled: boolean | null;
  build_stage: string | null;
}
interface AuditLM {
  id: string;
  statut: string | null;
  pdf_url: string | null;
}
interface RapportLM {
  disponible: boolean;
  url?: string;
  vues?: number;
  vu_le?: string | null;
  motif?: string;
}

export interface LeadMagnetsPanelProps {
  entrepriseId: number | null;
  opportuniteId: string | null;
  /** Nom affiché dans les messages pré-rédigés. */
  nom: string;
  telephone: string | null;
  email: string | null;
}

export function LeadMagnetsPanel({
  entrepriseId,
  opportuniteId,
  nom,
  telephone,
  email,
}: LeadMagnetsPanelProps) {
  const [site, setSite] = useState<SiteLM | null>(null);
  const [audit, setAudit] = useState<AuditLM | null>(null);
  const [rapport, setRapport] = useState<RapportLM>({ disponible: false });
  const [chargement, setChargement] = useState(true);
  const [bascule, setBascule] = useState(false);
  const [courriel, setCourriel] = useState<{ objet: string; corps: string } | null>(null);

  const charger = useCallback(async () => {
    if (!entrepriseId) {
      setSite(null);
      setAudit(null);
      setRapport({ disponible: false });
      setChargement(false);
      return;
    }
    setChargement(true);
    try {
      const params = new URLSearchParams({ entreprise: String(entrepriseId) });
      if (opportuniteId) params.set("opportunite", opportuniteId);
      const res = await authedFetch(`/api/telephony/cockpit/lead-magnets?${params}`);
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { site: SiteLM | null; audit: AuditLM | null; rapport: RapportLM };
      setSite(d.site);
      setAudit(d.audit);
      setRapport(d.rapport ?? { disponible: false });
    } catch {
      // Silencieux : un panneau de contexte qui crie pendant un appel est pire
      // qu'un panneau vide. L'absence de lien se voit d'elle-même.
      setSite(null);
      setAudit(null);
    } finally {
      setChargement(false);
    }
  }, [entrepriseId, opportuniteId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const lienDemo = site ? demoShareUrl({ id: site.id, published_subdomain: site.published_subdomain }) : null;

  const basculerPaywall = async () => {
    if (!site) return;
    const valeur = !site.paywall_enabled;
    setBascule(true);
    setSite({ ...site, paywall_enabled: valeur });
    try {
      const res = await authedFetch(`/api/site-builder/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paywall_enabled: valeur }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        valeur
          ? "Paiement activé — la barre « Acheter ce site » est visible."
          : "Paiement désactivé.",
      );
    } catch {
      setSite({ ...site, paywall_enabled: !valeur });
      toast.error("Impossible de changer le paiement.");
    } finally {
      setBascule(false);
    }
  };

  const copier = async (url: string, quoi: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Lien ${quoi} copié.`);
    } catch {
      toast.error("Copie impossible.");
    }
  };

  const whatsapp = (message: string) => {
    const lien = lienWhatsApp(telephone, message);
    if (!lien) {
      toast.error("Numéro inutilisable — copiez le lien pour l'envoyer autrement.");
      return;
    }
    window.open(lien, "_blank", "noopener");
    void authedFetch("/api/messages/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "whatsapp",
        entreprise_id: entrepriseId,
        subject: "Envoi depuis le cockpit",
        body_text: message,
      }),
    }).catch(() => {});
  };

  if (!entrepriseId) {
    return (
      <div className="blk">
        <h4>Lead magnets</h4>
        <div className="ck-empty">Ce prospect n&apos;est rattaché à aucune entreprise.</div>
      </div>
    );
  }

  return (
    <div className="blk">
      <h4>Lead magnets</h4>

      {chargement ? (
        <div className="ck-empty">Chargement…</div>
      ) : (
        <div className="lm-liste">
          {/* ── Le site démo ─────────────────────────────────────────── */}
          {site && lienDemo ? (
            <div className="lm-carte">
              <div className="lm-hd">
                <Globe className="ico-xs" />
                <span className="lm-ti">Site démo</span>
                <span className={`lm-chip ${site.is_published ? "on" : ""}`}>
                  {site.is_published ? "En ligne" : "Brouillon"}
                </span>
              </div>

              <a href={lienNonMesure(lienDemo)} target="_blank" rel="noopener noreferrer" className="lm-url">
                {lienDemo.replace(/^https:\/\//, "")}
              </a>

              {/* L'interrupteur qu'on vient chercher ici pendant l'appel. */}
              <button
                type="button"
                className={`lm-paywall ${site.paywall_enabled ? "on" : ""}`}
                onClick={() => void basculerPaywall()}
                disabled={bascule}
                title={
                  site.paywall_enabled
                    ? "Le prospect peut acheter le site depuis la démo — cliquer pour désactiver"
                    : "Activer la barre « Acheter ce site » sur la démo"
                }
              >
                {site.paywall_enabled ? <Lock className="ico-xs" /> : <LockOpen className="ico-xs" />}
                <span>Paiement en ligne</span>
                <b>{site.paywall_enabled ? "activé" : "désactivé"}</b>
              </button>

              <div className="lm-actions">
                <Action titre="Ouvrir la démo" href={lienNonMesure(lienDemo)}>
                  <ExternalLink className="ico-xs" />
                </Action>
                <Action titre="Copier le lien" onClick={() => void copier(lienDemo, "du site")}>
                  <Copy className="ico-xs" />
                </Action>
                <Action
                  titre="Envoyer sur WhatsApp"
                  onClick={() => whatsapp(messageSite(nom, lienDemo))}
                >
                  <MessageCircle className="ico-xs" />
                </Action>
                <Action
                  titre={email ? "Envoyer par email" : "Aucune adresse email sur la fiche"}
                  disabled={!email}
                  onClick={() =>
                    setCourriel({
                      objet: `Votre site — ${nom}`,
                      corps: messageSite(nom, lienDemo),
                    })
                  }
                >
                  <Mail className="ico-xs" />
                </Action>
                <Action titre="Brief de reprise" href={`/espace-agent/brief/${site.id}`} interne>
                  <ClipboardList className="ico-xs" />
                </Action>
                <Action titre="Éditer le site" href={`/site-builder/claude/${site.id}`} interne>
                  <Pencil className="ico-xs" />
                </Action>
              </div>
            </div>
          ) : (
            <div className="lm-carte">
              <div className="lm-hd">
                <Globe className="ico-xs" />
                <span className="lm-ti">Site démo</span>
              </div>
              <div className="ck-empty" style={{ padding: "6px 0 0" }}>
                Aucun site pour cette entreprise.
              </div>
            </div>
          )}

          {/* ── Le rapport d'audit public ────────────────────────────── */}
          <div className="lm-carte">
            <div className="lm-hd">
              <FileText className="ico-xs" />
              <span className="lm-ti">Rapport d&apos;audit</span>
              {/* Le compteur de vues vaut une relance : « il l'a ouvert trois
                  fois » est l'information la plus actionnable du panneau. */}
              {rapport.disponible && (rapport.vues ?? 0) > 0 && (
                <span className="lm-chip on">
                  <Eye className="ico-xs" /> {rapport.vues}
                </span>
              )}
            </div>

            {rapport.disponible && rapport.url ? (
              <>
                <a href={lienNonMesure(rapport.url)} target="_blank" rel="noopener noreferrer" className="lm-url">
                  {rapport.url.replace(/^https:\/\//, "")}
                </a>
                <div className="lm-actions">
                  <Action titre="Ouvrir le rapport" href={lienNonMesure(rapport.url)}>
                    <ExternalLink className="ico-xs" />
                  </Action>
                  <Action titre="Copier le lien" onClick={() => void copier(rapport.url!, "du rapport")}>
                    <Copy className="ico-xs" />
                  </Action>
                  <Action
                    titre="Envoyer sur WhatsApp"
                    onClick={() => whatsapp(messageRapport(nom, rapport.url!))}
                  >
                    <MessageCircle className="ico-xs" />
                  </Action>
                  <Action
                    titre={email ? "Envoyer par email" : "Aucune adresse email sur la fiche"}
                    disabled={!email}
                    onClick={() =>
                      setCourriel({
                        objet: `L'analyse de votre site — ${nom}`,
                        corps: messageRapport(nom, rapport.url!),
                      })
                    }
                  >
                    <Mail className="ico-xs" />
                  </Action>
                </div>
              </>
            ) : (
              <div className="ck-empty" style={{ padding: "6px 0 0" }}>
                {rapport.motif ?? "Pas encore d'analyse du site actuel."}
              </div>
            )}
          </div>

          {/* ── L'audit de vente ─────────────────────────────────────── */}
          {opportuniteId && (
            <div className="lm-carte">
              <div className="lm-hd">
                <ClipboardList className="ico-xs" />
                <span className="lm-ti">Audit de vente</span>
                {audit?.statut && <span className="lm-chip">{audit.statut}</span>}
              </div>
              <div className="lm-actions">
                <Action titre="Éditer l'audit" href={`/espace-agent/audits/${opportuniteId}`} interne>
                  <Pencil className="ico-xs" />
                </Action>
                {audit?.pdf_url && (
                  <>
                    <Action titre="Ouvrir le PDF" href={audit.pdf_url}>
                      <FileText className="ico-xs" />
                    </Action>
                    <Action titre="Copier le lien du PDF" onClick={() => void copier(audit.pdf_url!, "du PDF")}>
                      <Copy className="ico-xs" />
                    </Action>
                  </>
                )}
              </div>
              {!audit && (
                <div className="ck-empty" style={{ padding: "6px 0 0" }}>
                  Aucun audit rédigé pour cette opportunité.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <DialogueEmail
        ouvert={courriel !== null}
        onFermer={() => setCourriel(null)}
        destinataire={email}
        nom={nom}
        entrepriseId={entrepriseId}
        objetInitial={courriel?.objet ?? ""}
        corpsInitial={courriel?.corps ?? ""}
      />
    </div>
  );
}

/** Bouton d'action carré du panneau : lien externe, lien interne ou callback. */
function Action({
  titre,
  href,
  interne,
  onClick,
  disabled,
  children,
}: {
  titre: string;
  href?: string;
  interne?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (href && interne) {
    return (
      <Link href={href} className="lm-act" title={titre}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="lm-act" title={titre}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className="lm-act" title={titre} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/**
 * L'email rapide.
 *
 * Pré-rédigé mais MODIFIABLE avant l'envoi : pendant un appel, la phrase juste
 * est celle qui reprend ce que le client vient de dire, et aucun gabarit ne la
 * connaît. Le corps part en texte ET en HTML — la route exige le HTML, et un
 * client mail en texte seul afficherait sinon des balises.
 */
function DialogueEmail({
  ouvert,
  onFermer,
  destinataire,
  nom,
  entrepriseId,
  objetInitial,
  corpsInitial,
}: {
  ouvert: boolean;
  onFermer: () => void;
  destinataire: string | null;
  nom: string;
  entrepriseId: number | null;
  objetInitial: string;
  corpsInitial: string;
}) {
  const [objet, setObjet] = useState(objetInitial);
  const [corps, setCorps] = useState(corpsInitial);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    if (ouvert) {
      setObjet(objetInitial);
      setCorps(corpsInitial);
      setEnvoye(false);
    }
  }, [ouvert, objetInitial, corpsInitial]);

  const envoyer = async () => {
    if (!destinataire) return;
    setEnvoi(true);
    try {
      const res = await authedFetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: destinataire,
          to_name: nom,
          subject: objet,
          body_text: corps,
          body_html: corps
            .split("\n")
            .map((l) => `<p>${echapper(l) || "&nbsp;"}</p>`)
            .join(""),
          entreprise_id: entrepriseId ?? undefined,
          type: "lead_magnet",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.message || body.error || "Envoi impossible");
      setEnvoye(true);
      toast.success("Email envoyé.");
      setTimeout(onFermer, 700);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envoyer par email</DialogTitle>
          <DialogDescription>
            {destinataire ? `À ${destinataire}` : "Aucune adresse sur la fiche."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Objet" />
          <Textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            className="min-h-[180px] text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onFermer}>
              Annuler
            </Button>
            <Button size="sm" onClick={() => void envoyer()} disabled={!destinataire || envoi || !objet.trim()}>
              {envoye ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Envoyé
                </>
              ) : envoi ? (
                "Envoi…"
              ) : (
                "Envoyer"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function messageSite(nom: string, url: string): string {
  return (
    `Bonjour${nom ? ` ${nom}` : ""},\n\n` +
    `Comme convenu à l'instant, voici le site que nous avons préparé pour vous :\n${url}\n\n` +
    `Regardez-le tranquillement et dites-moi ce qui vous plaît ou ce qui ne vous ressemble pas.`
  );
}

function messageRapport(nom: string, url: string): string {
  return (
    `Bonjour${nom ? ` ${nom}` : ""},\n\n` +
    `Voici l'analyse de votre site actuel dont je vous parlais :\n${url}\n\n` +
    `Tout y est mesuré, rien n'est inventé. On en reparle quand vous voulez.`
  );
}
