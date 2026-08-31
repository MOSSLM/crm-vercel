"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon, Pill } from "./DemIcon";
import { DemNotes } from "./DemNotes";
import { demCh, isMessageKind } from "./channels";
import { COHORTE_INFO } from "./cohortes";
import { DEM_OBJECTIONS } from "./DemObjections";
import { SCRIPT_STEPS } from "@/lib/telephony/call-script";
import { VARIANT_LABELS, versionsPreparees, type MessageVariant } from "@/lib/automations/variables";
import { STEP_OUTCOMES, stepOutcome as findOutcome, type StepOutcomeId } from "@/lib/sales-pipeline/stages";
import type { StageRole } from "@/lib/opportunites/stage-roles";
import { authedFetch } from "@/utils/authedFetch";
import { lienWhatsApp } from "@/lib/prospects/canal";
import { one } from "@/components/agent-portal/format";
import { useTelephonyOptional } from "@/components/telephony/CallProvider";
import { placeCallback } from "@/lib/telephony/client";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { urlPlaquetteImprimable } from "@/lib/audit/plaquette-lien";
import type { CompanyBundle, DemarchagePatchBody, DemarchageTask, DemAudit } from "./types";

/** Effet de chaque issue sur l'étape de l'affaire. */
const OUTCOME_ROLE: Partial<Record<StepOutcomeId, StageRole>> = {
  answered: "contacte",
  lukewarm: "interesse",
  not_interested: "perdu",
  blocked: "perdu",
};

/** L'issue → la teinte du bouton, dans le vocabulaire de la feuille de style. */
const TONE: Record<string, string> = {
  ok: "ok",
  info: "info",
  warn: "warn",
  danger: "danger",
  muted: "",
};

/** La date civile dans `n` jours (YYYY-MM-DD), telle qu'un `<input type="date">` l'attend. */
const dansNJours = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Les délais de MISE DE CÔTÉ proposés d'un clic.
 *
 * Personne ne calcule « le 16 novembre » de tête : ce qu'on sait en
 * raccrochant, c'est « il est en congés trois semaines » ou « il rappelle après
 * la saison ». Les quatre repères couvrent l'essentiel ; la date exacte reste
 * saisissable juste à côté pour le cas où le prospect en a donné une.
 */
const DELAIS_MISE_DE_COTE: readonly { lb: string; j: number }[] = [
  { lb: "1 semaine", j: 7 },
  { lb: "2 semaines", j: 14 },
  { lb: "1 mois", j: 30 },
  { lb: "3 mois", j: 90 },
] as const;

const dateLongue = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
};

/** Remplace les `{{variables}}` d'un modèle et les met en évidence à l'écran. */
function fillVars(txt: string, vars: Record<string, string>): string {
  return txt.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
}

/**
 * BOUCLER LA TÂCHE — et surtout PAS le même objet que « envoyer ».
 *
 * LE GRIEF, MOT POUR MOT : « les boutons "fait" et "envoyer le message" se
 * ressemblent trop ». Ils étaient tous les deux de gros blocs pleine largeur, à
 * dix pixels l'un de l'autre, et se distinguaient par leur seule couleur. Or
 * ils ne font pas la même chose : l'un ouvre WhatsApp, l'autre ferme la ligne
 * et fait descendre la file. Se tromper coûte soit un message jamais envoyé
 * marqué comme fait, soit un doublon chez le prospect.
 *
 * Ce bouton-ci est donc une BARRE, pas un bloc : une pastille ronde à gauche,
 * le libellé au milieu, « suivant → » à droite — la forme dit ce qui va se
 * passer. Il ne se remplit (`data-arme`) qu'une fois le geste réellement
 * accompli : tant qu'on n'a pas cliqué « Envoyer », c'est le bouton d'envoi qui
 * est plein, et celui-ci reste en retrait.
 */
function BoutonBoucler({
  arme,
  label,
  sous,
  disabled,
  onClick,
}: {
  arme: boolean;
  label: string;
  sous?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="dm-fait"
      data-arme={arme ? "1" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ic">
        <Icon name="check" className="ico-sm" />
      </span>
      <span className="tx">
        <b>{label}</b>
        {sous ? <i>{sous}</i> : null}
      </span>
      <span className="nx">
        suivant
        <Icon name="arrowRight" className="ico-xs" />
      </span>
    </button>
  );
}

function ScriptLine({ text, vars }: { text: string; vars: Record<string, string> }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((s, i) =>
        /^\{\{\w+\}\}$/.test(s) ? (
          <span key={i} className="dm-var">
            {fillVars(s, vars)}
          </span>
        ) : (
          <span key={i}>{s}</span>
        ),
      )}
    </>
  );
}

export function DemActionCard({
  task,
  company,
  audit,
  busy,
  onPatch,
  onLogged,
  onNext,
  onReplied,
  onRetire,
  onBasculerEnAppel,
}: {
  task: DemarchageTask;
  company: CompanyBundle | null;
  audit: DemAudit;
  busy: boolean;
  onPatch: (body: Omit<DemarchagePatchBody, "id">) => void;
  onLogged: () => void;
  /** Passer à la tâche suivante de la file — le geste est le même partout. */
  onNext: () => void;
  /** Le prospect a répondu : l'attente est levée, la file doit se recharger. */
  onReplied: () => void;
  /**
   * La tâche a quitté la file par un chemin qui n'est pas un `PATCH` — sortie
   * de canal, aujourd'hui. La file se recharge et enchaîne.
   */
  onRetire: () => void;
  /**
   * « Je préfère l'appeler » : la tâche courante devient un appel, même
   * prospect et même étape. Le geste vit aussi dans le rail — c'est en lisant
   * la ligne qu'on décide de décrocher plutôt que d'écrire.
   */
  onBasculerEnAppel: () => void;
}) {
  const ch = demCh(task.kind);
  const seq = task.sequence;
  const ent = one(task.entreprise);
  const contact = one(task.contact);
  const tel = useTelephonyOptional();

  /**
   * Appel à froid : ni séquence, ni étape, ni texte préparé par le moteur.
   *
   * La carte déduisait tout de la séquence — jusqu'au message d'erreur, qui
   * conseillait d'« ajouter un texte à l'étape dans la séquence » à quelqu'un
   * qui n'en a pas. Ce n'est pas un défaut de données à corriger : c'est le
   * mode de travail principal de la campagne, cent fois par jour.
   */
  const froid = task.hors_sequence === true;
  const cohorte = task.cohorte ?? null;

  const dec = company?.contacts.find((c) => c.is_decision_maker) ?? company?.contacts[0] ?? null;
  const ctName = dec
    ? `${dec.first_name ?? ""} ${dec.last_name ?? ""}`.trim()
    : `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim();
  const firstName = ctName.split(" ")[0] || "";

  const vars = useMemo(
    () => ({
      prenom: firstName,
      nom: ctName,
      entreprise: company?.entreprise.name ?? ent?.name ?? "",
      ville: company?.entreprise.ville ?? ent?.ville ?? "",
      score: audit?.note_globale != null ? String(audit.note_globale) : "",
      demo: company?.site && company.site.is_published ? demoShareUrl(company.site) : "",
      org: company?.entreprise.name ?? ent?.name ?? "",
    }),
    [firstName, ctName, company, ent, audit],
  );

  // ── état partagé ────────────────────────────────────────────────────────
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<StepOutcomeId | null>(null);

  /**
   * Le geste du canal a-t-il été accompli — WhatsApp ouvert, numéro composé ?
   *
   * Il ARME le bouton qui boucle : tant qu'on n'a rien envoyé, c'est le bouton
   * d'envoi qui est plein et l'autre qui est en retrait ; une fois le message
   * parti, les rôles s'échangent. C'est ce qui rend les deux impossibles à
   * confondre sans avoir à lire — l'écran suit ce qui s'est passé.
   */
  const [geste, setGeste] = useState(false);
  useEffect(() => setGeste(false), [task.id]);

  // ── mise de côté ────────────────────────────────────────────────────────
  /** Le panneau est-il ouvert ? Fermé, il ne coûte rien à l'œil. */
  const [deCote, setDeCote] = useState(false);
  const [dateRetour, setDateRetour] = useState(dansNJours(14));
  const [motif, setMotif] = useState("");

  /** Ce que la mise de côté d'origine avait retenu, quand la tâche en revient. */
  const miseDeCote = task.payload?.mise_de_cote ?? null;

  // ── sortie de canal ─────────────────────────────────────────────────────
  const [horsCanal, setHorsCanal] = useState(false);
  const [basculeAppel, setBasculeAppel] = useState(true);
  const [sortie, setSortie] = useState(false);

  // ── il a pris contact de lui-même ───────────────────────────────────────
  const [rappel, setRappel] = useState(false);
  const [canalRappel, setCanalRappel] = useState<"call" | "whatsapp" | "email">("call");
  /**
   * Les pièces cochées par défaut, et c'est le cœur du geste.
   *
   * Quand un prospect appelle, on lui envoie ce qu'on a — c'est le réflexe, et
   * c'est exactement ce qui n'était journalisé nulle part. Les décocher est
   * donc l'exception, pas la règle : la case part cochée dès que la pièce
   * existe. L'audit, lui, part DÉCOCHÉ — il n'est presque jamais envoyé de
   * vive voix, et une case cochée par défaut sur un envoi qui n'a pas eu lieu
   * écrirait un faux dans le fil.
   */
  const [pieces, setPieces] = useState<Record<"demo" | "plaquette" | "audit", boolean>>({
    demo: true,
    plaquette: true,
    audit: false,
  });
  const [envoiRappel, setEnvoiRappel] = useState(false);

  // Changer de tâche referme tout : un panneau resté ouvert d'un prospect à
  // l'autre ferait appliquer à l'un ce qu'on avait commencé à écrire pour
  // l'autre.
  useEffect(() => {
    setDeCote(false);
    setHorsCanal(false);
    setRappel(false);
    setCanalRappel("call");
    setPieces({ demo: true, plaquette: true, audit: false });
    setDateRetour(dansNJours(14));
    setMotif("");
    setBasculeAppel(true);
  }, [task.id]);

  // ── message ─────────────────────────────────────────────────────────────
  /**
   * Les DEUX versions du modèle de l'étape — celle qu'on écrit à l'entreprise,
   * celle qu'on écrit à une personne — et rien d'autre.
   *
   * La carte proposait aussi toute la bibliothèque de modèles WhatsApp du
   * compte. Choisir « Relance J+7 » sur une étape « Premier contact » n'a
   * pourtant aucun sens : la séquence a DÉJÀ décidé quoi dire, et le moteur l'a
   * rendu avec les variables de ce prospect-là. Le seul choix qui reste ouvert
   * est celui que le pipeline commercial propose déjà sur sa carte WhatsApp :
   * à l'entreprise, ou au contact.
   *
   * `versionsPreparees` est la lecture commune de ce couple : les trois
   * surfaces qui traitent une tâche ne peuvent donc pas montrer trois textes
   * différents du même message.
   */
  const versionsPayload = useMemo(() => versionsPreparees(task.payload), [task.payload]);

  /**
   * Le couple REFAIT depuis le modèle, quand il l'a été — et il prime.
   *
   * `versionsPreparees` lit la charge utile que la FILE a en mémoire. Un
   * rechargement écrit bien les deux versions en base, mais la file n'est pas
   * relue pour autant : sans cet état, la bascule entreprise/contact
   * reservirait l'ancien texte de l'autre version juste après avoir corrigé
   * celle qu'on lit.
   */
  const [refait, setRefait] = useState<{ variant: MessageVariant; message: string }[] | null>(null);
  /** Le texte affiché a-t-il été refait tout seul à l'ouverture, et différait-il ? */
  const [refaitALOuverture, setRefaitALOuverture] = useState(false);
  const versions = refait ?? versionsPayload;

  const [variant, setVariant] = useState<MessageVariant>(versionsPayload[0]?.variant ?? "company");
  const [msg, setMsg] = useState(versionsPayload[0]?.message ?? "");

  /**
   * Le texte a-t-il été touché à la main (frappe ou choix de version) ?
   *
   * La passe d'ouverture s'efface devant : personne ne doit voir sa propre
   * phrase disparaître parce qu'une réponse réseau est arrivée après qu'il a
   * commencé à écrire.
   */
  const retouche = useRef(false);
  useEffect(() => {
    setRefait(null);
    setRefaitALOuverture(false);
    retouche.current = false;
  }, [task.id]);

  useEffect(() => {
    setVariant(versionsPayload[0]?.variant ?? "company");
    setMsg(versionsPayload[0]?.message ?? "");
    setNote("");
    setOutcome(null);
  }, [task.id, versionsPayload]);

  /** Bascule de version : le texte change sous les yeux, y compris s'il a été retouché. */
  const pickVersion = (v: MessageVariant) => {
    retouche.current = true;
    setVariant(v);
    setMsg(versions.find((x) => x.variant === v)?.message ?? "");
  };

  /**
   * « J'ai changé le modèle et la carte dit toujours l'ancien texte. »
   *
   * CE N'EST PAS UNE PANNE : le moteur rend le message AU MOMENT où il pose
   * l'étape et l'écrit dans la charge utile de la tâche ; la carte lit cette
   * charge utile, jamais le modèle. C'est ce qui garantit que l'agent voit
   * exactement ce que le moteur a préparé. Le prix est qu'un modèle corrigé ne
   * rattrape que les tâches créées après — au 28/08/2026, quarante-neuf tâches
   * « Plaquette » en attente portaient encore le texte d'avant.
   *
   * LE RECHARGEMENT SE FAIT DONC À L'OUVERTURE DE LA CARTE. Ce qu'il fallait
   * éviter n'a jamais été le rafraîchissement lui-même, mais qu'il tombe SOUS
   * LES YEUX DE QUELQU'UN QUI VIENT DE RELIRE : un texte qui change entre la
   * lecture et l'envoi fait partir autre chose que ce qu'on a lu. Une passe
   * unique à l'ouverture, avant toute lecture, ne pose pas ce problème — et
   * elle épargne un clic sur chaque plaquette, ce qui était le grief. Trois
   * garde-fous : une seule fois par tâche (`autoFait`), jamais sur un texte
   * déjà touché à la main (`retouche`), et jamais sur une carte d'appel — un
   * script qui se refait pendant qu'on décroche change la phrase en cours.
   *
   * LE BOUTON RESTE, pour le cas qui reste : on corrige le modèle dans un
   * autre onglet et on veut le relire sans changer de prospect.
   *
   * LE SILENCE EST VOULU sur la passe automatique. Un échec — étape supprimée,
   * modèle vide, réseau — laisse en place le texte de la charge utile, c'est-à-
   * dire exactement ce qui s'affichait avant. Le bouton, lui, dit tout : il a
   * été cliqué, son refus a une raison, et cette raison indique quoi faire.
   */
  const [rechargeant, setRechargeant] = useState(false);
  const autoFait = useRef<string | null>(null);

  const rechargerDepuisLeModele = useCallback(
    async (auto: boolean) => {
      if (!auto) setRechargeant(true);
      try {
        const res = await authedFetch("/api/agent/demarchage/recharger-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: task.id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          inchange?: boolean;
          variant?: MessageVariant;
          variantAlt?: { variant: MessageVariant; message: string } | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        // Arrivée après que l'agent a commencé à écrire : on n'écrase pas.
        if (auto && retouche.current) return;
        if (data.message) {
          const couple = [
            { variant: (data.variant ?? "company") as MessageVariant, message: data.message },
            ...(data.variantAlt ? [data.variantAlt] : []),
          ];
          setRefait(couple);
          // ON RESTE SUR LA VERSION CHOISIE. Recharger depuis l'onglet
          // « contact » pour se retrouver avec le texte « entreprise » à
          // l'écran ferait envoyer une version qu'on n'a pas demandée.
          const lue = couple.find((c) => c.variant === variant) ?? couple[0];
          setVariant(lue.variant);
          setMsg(lue.message);
          if (auto) setRefaitALOuverture(data.inchange !== true);
        }
        if (!auto) {
          toast.success(
            data.inchange ? "Le modèle n'a pas changé." : "Message rechargé depuis le modèle.",
          );
          onLogged();
        }
      } catch (e) {
        if (!auto) toast.error(e instanceof Error ? e.message : "Rechargement impossible");
      } finally {
        if (!auto) setRechargeant(false);
      }
    },
    [task.id, variant, onLogged],
  );

  useEffect(() => {
    if (!isMessageKind(task.kind)) return;
    // Une tâche posée par une action `create_task` n'a aucune étape, donc aucun
    // modèle à relire : la route répondrait 409 à chaque ouverture.
    if (!task.enrollment_id || !task.step_id) return;
    if (autoFait.current === task.id) return;
    autoFait.current = task.id;
    void rechargerDepuisLeModele(true);
  }, [task.id, task.kind, task.enrollment_id, task.step_id, rechargerDepuisLeModele]);

  const [att, setAtt] = useState({ demo: false, audit: false });
  useEffect(() => setAtt({ demo: false, audit: false }), [task.id]);

  const demoUrl = company?.site && company.site.is_published ? demoShareUrl(company.site) : null;
  const auditUrl = task.payload?.audit_url as string | undefined;
  const body = msg + (att.demo && demoUrl ? `\n\n${demoUrl}` : "") + (att.audit && auditUrl ? `\n\n${auditUrl}` : "");

  const phones = useMemo(() => {
    const raw = [
      task.payload?.phone,
      ...(company?.contacts.map((c) => c.tel) ?? []),
      company?.entreprise.telephone,
      ent?.telephone,
    ].filter((v): v is string => !!v && v.trim() !== "");
    return [...new Set(raw)];
  }, [task.payload?.phone, company, ent]);
  const [phone, setPhone] = useState(phones[0] ?? "");
  useEffect(() => setPhone(phones[0] ?? ""), [phones]);

  const linkedinUrl =
    (task.payload?.linkedin as string | undefined) ??
    company?.contacts.find((c) => c.linkedin_url)?.linkedin_url ??
    null;

  const [sending, setSending] = useState(false);

  /**
   * La plaquette de CE prospect, quand l'étape la joint.
   *
   * ELLE NE PART PLUS EN LIEN, ET C'EST LA DEMANDE : « je ne veux pas que la
   * plaquette soit envoyée en lien, je veux qu'elle soit envoyée en PDF ». Le
   * message ne porte donc plus d'URL — c'est l'agent qui joint le fichier dans
   * WhatsApp, après l'avoir enregistré.
   *
   * CE QUE LE CLIC PEUT ET NE PEUT PAS FAIRE. Aucun PDF n'est fabriqué ici : le
   * CRM n'embarque pas de moteur de PDF et Chromium ne tient pas dans une
   * fonction Vercel (cf. `src/app/(public)/plaquette/rendu.tsx`). On ouvre le
   * document avec la boîte d'impression du navigateur, d'où « Enregistrer en
   * PDF » — exactement ce que fait « Exporter PDF » de l'éditeur d'audit depuis
   * toujours. Il reste donc UN clic à l'agent, et il vaut mieux le dire que
   * promettre un téléchargement qui n'existe pas.
   *
   * AU FORMAT TÉLÉPHONE, ET C'EST LA DESTINATION QUI LE DÉCIDE. Ce PDF part
   * dans WhatsApp, lu sur un téléphone : l'A4 y arrive en vignette qu'il faut
   * pincer pour lire, page après page. Le gabarit mobile est paginé pour ça —
   * huit écrans de 430 × 932 px, un par page. L'A4 reste ce qu'on joint à un
   * mail, et il s'ouvre toujours d'un clic depuis le pipeline marketing.
   */
  const plaquetteUrl =
    typeof task.payload?.plaquette_url === "string" && task.payload.plaquette_url
      ? task.payload.plaquette_url
      : null;

  /**
   * L'ORDRE COMPTE. La feuille part EN PREMIER : la boîte d'impression s'ouvre
   * dans son onglet, et WhatsApp arrive ensuite au premier plan. Ouverts dans
   * l'autre sens, l'impression volerait le focus à la conversation au moment
   * précis où l'agent va coller son message.
   */
  const ouvrirPlaquette = () => {
    if (!plaquetteUrl) return;
    window.open(urlPlaquetteImprimable(plaquetteUrl, "mobile"), "_blank", "noopener,noreferrer");
  };

  const logMessage = async (channel: "whatsapp" | "linkedin", to: string) => {
    try {
      const res = await authedFetch("/api/messages/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          contact_id: task.contact_id,
          entreprise_id: task.entreprise_id,
          opportunite_id: task.opportunite_id,
          to_email: to,
          to_name: ctName || ent?.name,
          subject: channel === "whatsapp" ? "Message WhatsApp" : "Message LinkedIn",
          body_text: body,
        }),
      });
      if (!res.ok) throw new Error();
      onLogged();
    } catch {
      toast.error("Message ouvert, mais pas journalisé.");
    }
  };

  const send = async () => {
    setSending(true);
    try {
      if (task.kind === "whatsapp") {
        const url = lienWhatsApp(phone, body);
        if (!url) {
          toast.error("Ce numéro n'est pas exploitable sur WhatsApp.");
          return;
        }
        // La plaquette d'abord : elle doit être enregistrée avant d'être jointe,
        // et l'agent finit sur WhatsApp, pas sur une boîte d'impression.
        ouvrirPlaquette();
        window.open(url, "_blank");
        setGeste(true);
        await logMessage("whatsapp", phone);
      } else {
        if (!linkedinUrl) {
          toast.error("Aucun profil LinkedIn connu.");
          return;
        }
        await navigator.clipboard.writeText(body).catch(() => {});
        window.open(linkedinUrl, "_blank");
        setGeste(true);
        await logMessage("linkedin", linkedinUrl);
        toast.success("Message copié dans le presse-papiers.");
      }
    } finally {
      setSending(false);
    }
  };

  // ── appel ───────────────────────────────────────────────────────────────
  const [scriptStep, setScriptStep] = useState(0);
  const [ob, setOb] = useState<number | null>(null);
  const [calling, setCalling] = useState(false);

  /**
   * Ce que la SÉQUENCE a préparé pour cet appel-là, et rien d'autre.
   *
   * Le moteur rend le script au moment de créer la tâche et pose les DEUX
   * versions dans son payload (`versionsPreparees` est la seule lecture de ce
   * couple, partagée avec le pipeline commercial et le tableau des tâches à la
   * main). On ne recalcule donc rien ici : afficher un texte reconstitué dans
   * le navigateur, c'est risquer de faire lire autre chose que ce qui a été
   * préparé.
   *
   * La carte s'ouvre sur ce texte seul. L'argumentaire générique et les
   * objections — les mêmes pour tous les prospects — passent derrière un
   * onglet : ils aident quand on cale, ils ne sont pas ce qu'on lit en
   * décrochant.
   */
  const callVersions = useMemo(() => versionsPreparees(task.payload), [task.payload]);
  const [callVariant, setCallVariant] = useState<MessageVariant>(callVersions[0]?.variant ?? "company");
  const [callTab, setCallTab] = useState<"script" | "aide">("script");
  useEffect(() => {
    setScriptStep(0);
    setOb(null);
    setCallVariant(callVersions[0]?.variant ?? "company");
    setCallTab("script");
  }, [task.id, callVersions]);

  const callScript =
    callVersions.find((v) => v.variant === callVariant)?.message ?? callVersions[0]?.message ?? "";
  const scriptName = typeof task.payload?.scriptName === "string" ? task.payload.scriptName : null;

  const callPhone = (task.payload?.phone as string | undefined) || phones[0] || null;
  const call = async () => {
    if (!callPhone) return;
    setCalling(true);
    setGeste(true);
    try {
      if (tel) {
        await tel.dial({
          to: callPhone,
          contactId: task.contact_id,
          entrepriseId: task.entreprise_id,
          opportuniteId: task.opportunite_id,
        });
      } else {
        const res = await placeCallback({
          to: callPhone,
          contact_id: task.contact_id,
          entreprise_id: task.entreprise_id,
          opportunite_id: task.opportunite_id,
        });
        if (res.ok) toast.success("Appel lancé", { description: "Votre téléphone va sonner." });
        else toast.error("Appel impossible", { description: res.error });
      }
    } finally {
      setCalling(false);
    }
  };

  // ── attente ─────────────────────────────────────────────────────────────
  const declareReply = async () => {
    if (!task.enrollment_id) return;
    try {
      const res = await authedFetch(`/api/automations/enrollments/${task.enrollment_id}/reply`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.message || payload?.error || "Reprise impossible");
        return;
      }
      toast.success(
        payload?.rattrapage
          ? "Demi-tour — la séquence repart sur la suite « il a répondu »"
          : "Séquence reprise — étape suivante planifiée",
      );
      onReplied();
    } catch {
      toast.error("Action impossible");
    }
  };

  // ── issues ──────────────────────────────────────────────────────────────
  /**
   * Les issues proposées sur CETTE carte.
   *
   * Sur un message, celles qui supposent une réponse du prospect (`releasesWait`
   * : « A répondu », « A répondu, peu intéressé ») n'ont rien à y faire — au
   * moment où on envoie, personne n'a encore répondu. Les y laisser imposait un
   * double geste absurde : cocher « a répondu » sur la carte WhatsApp, puis
   * cocher « a répondu » une seconde fois sur l'attente pour débloquer la suite.
   * La réponse se déclare à UN seul endroit : la tâche d'attente.
   *
   * Sur un appel, elles restent : on a la personne au bout du fil, sa réaction
   * est immédiate et c'est bien là qu'on la note.
   */
  const outcomes = useMemo(
    () =>
      STEP_OUTCOMES.filter(
        (o) =>
          // `later` a désormais son propre geste, juste au-dessus : la mettre
          // aussi dans les pastilles ferait deux chemins pour le même acte, dont
          // un qui oblige à taper une date à la main.
          o.id !== "later" && (!isMessageKind(task.kind) || !o.releasesWait),
      ),
    [task.kind],
  );

  const chosen = outcome ? findOutcome(outcome) : null;

  /**
   * « Fait » : l'action a été faite, il n'y a rien de plus à en dire.
   *
   * C'est le cas ordinaire d'un premier contact — on envoie, personne ne
   * répond dans la seconde. La tâche se ferme, le moteur avance l'inscription,
   * et la séquence se gare sur son étape d'attente : c'est cette ligne-là qui
   * revient dans la file, et depuis laquelle on enchaîne. Renseigner une issue
   * reste possible juste en dessous, mais n'est plus un péage.
   */
  const markDone = () =>
    onPatch({
      status: "done",
      opportunite_id: task.opportunite_id ?? undefined,
      note: note.trim() || undefined,
    });

  const saveOutcome = () => {
    if (!chosen || !outcome) return;
    if (chosen.needsNote && !note.trim()) {
      toast.error("Ajoute une note pour cette issue.");
      return;
    }
    const status = outcome === "later" || (outcome === "no_answer" && task.kind === "call") ? "snoozed" : "done";
    onPatch({
      status,
      opportunite_id: task.opportunite_id ?? undefined,
      outcome: OUTCOME_ROLE[outcome],
      step_outcome: outcome,
      note: note.trim() || undefined,
      snooze_until:
        status === "snoozed" && outcome === "later"
          ? new Date(`${dateRetour}T09:00:00`).toISOString()
          : undefined,
    });
  };

  const rdv = () =>
    onPatch({
      status: "done",
      opportunite_id: task.opportunite_id ?? undefined,
      outcome: "rdv",
      note: note.trim() || undefined,
    });

  /**
   * METTRE DE CÔTÉ — ni un oui, ni un non.
   *
   * Le prospect n'est pas joignable en ce moment (congés, chantier, saison
   * creuse) : on ne l'a pas perdu, on ne l'a pas convaincu, on le range et il
   * revient tout seul. La tâche est REPLANIFIÉE (`snoozed` + `due_at` déplacé)
   * plutôt que fermée : elle ressort d'elle-même le jour dit, avec son motif
   * sous les yeux.
   *
   * C'est l'issue `later` du vocabulaire commun — même identifiant, donc les
   * notes déjà prises restent lisibles — mais avec un vrai geste : quatre
   * délais d'un clic au lieu d'une date à composer.
   */
  const mettreDeCote = () => {
    onPatch({
      status: "snoozed",
      opportunite_id: task.opportunite_id ?? undefined,
      step_outcome: "later",
      note: motif.trim() || undefined,
      snooze_until: new Date(`${dateRetour}T09:00:00`).toISOString(),
    });
  };

  /**
   * PAS SUR CE CANAL — le numéro n'a pas de compte WhatsApp.
   *
   * Rien n'est parti, personne n'a rien dit : ce n'est ni un « fait » ni une
   * issue d'échange. Le prospect sort de CETTE séquence — et de celle-là
   * seulement : il reste bon, c'est le canal qui ne va pas, d'où le repli
   * téléphone proposé juste en dessous.
   */
  const sortirDuCanal = async () => {
    setSortie(true);
    try {
      const res = await authedFetch("/api/agent/demarchage/hors-canal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          note: motif.trim() || undefined,
          basculer_appel: basculeAppel,
        }),
      });
      const corps = (await res.json().catch(() => ({}))) as {
        appel_cree?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(corps?.message || corps?.error || "Action impossible.");
        return;
      }
      toast.success(
        corps.appel_cree
          ? `Sorti de la séquence ${ch.lb} — un appel l'attend dans la file.`
          : `Sorti de la séquence ${ch.lb}.`,
      );
      setHorsCanal(false);
      onRetire();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setSortie(false);
    }
  };

  /**
   * IL A PRIS CONTACT DE LUI-MÊME — la porte de sortie du scénario.
   *
   * Le seul geste de cette carte qui ne suit pas la séquence mais la QUITTE.
   * Un prospect qui rappelle a fait en cinq minutes ce que la séquence met
   * trois semaines à obtenir, et le scénario, lui, ne sait pas le voir : il
   * continue de compter un silence qui n'a pas eu lieu, et pose une relance
   * « je me permets de revenir vers vous » à quelqu'un qui vient de parler.
   *
   * Un clic écrit les six choses qui étaient à écrire (l'entrant, les pièces
   * envoyées à la main, la tâche, `replied`, l'étape, la bascule vers « S4 —
   * Il a rappelé ») — le détail et l'ordre sont dans l'en-tête de la route.
   *
   * ⚠️ RIEN N'EST ENVOYÉ ICI. On DÉCLARE ce qui est déjà parti de la main de
   * l'agent, pendant la conversation. C'est la même distinction que
   * `/api/messages/log`, et elle décide de ce qu'on ose mettre derrière une
   * case cochée par défaut.
   */
  const declarerRappel = async () => {
    if (!note.trim()) {
      toast.error("Note ce qu'il a dit : c'est tout ce qui restera de cet appel.");
      return;
    }
    setEnvoiRappel(true);
    try {
      const res = await authedFetch("/api/agent/demarchage/il-a-rappele", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          entreprise_id: task.entreprise_id ?? undefined,
          canal: canalRappel,
          note: note.trim(),
          pieces: (["demo", "plaquette", "audit"] as const).filter((p) => pieces[p]),
        }),
      });
      const corps = (await res.json().catch(() => ({}))) as {
        pieces_journalisees?: string[];
        pieces_sans_lien?: string[];
        sequence?: { inscrit?: boolean; refus?: string | null };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(corps?.message || corps?.error || "Action impossible.");
        return;
      }

      // CE QUI N'A PAS PU S'ÉCRIRE SE DIT, et se dit en premier : une pièce
      // cochée sans lien disponible n'est pas consignée, et l'agent doit le
      // savoir avant de passer au suivant.
      const manquantes = corps.pieces_sans_lien ?? [];
      if (manquantes.length > 0) {
        toast.warning(
          `Consigné, sauf ${manquantes.join(" et ")} : aucun lien disponible pour ce prospect.`,
        );
      } else if (corps.sequence?.inscrit) {
        toast.success("Consigné. Il passe sur « S4 — Il a rappelé », l'appel de suite arrive dans la file.");
      } else {
        // La bascule a refusé (plus aucun canal, séquence absente). Le reste
        // est écrit : on le dit, plutôt que d'annoncer un succès entier.
        toast.warning("Échange consigné, mais la séquence de suite n'a pas pu s'ouvrir.");
      }
      setRappel(false);
      onRetire();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setEnvoiRappel(false);
    }
  };

  return (
    <section className="dm-card" style={{ ["--k" as string]: ch.c, ["--kt" as string]: ch.c + "1a" }}>
      <div className="dm-card-h">
        <span className="ic">
          <Icon name={ch.ic} className="ico-sm" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ti">
            {ch.cta}
            {seq?.stepIndex != null
              ? ` · étape ${seq.stepIndex}/${seq.totalSteps}`
              : froid
                ? " · à froid"
                : ""}
          </div>
          <div className="su">
            {seq?.stepLabel || task.title || (froid ? "Premier contact — jamais appelée" : ch.lb)}
            {ent?.name && <span style={{ color: "var(--text-4)" }}> · {ent.name}</span>}
          </div>
        </div>
        <div className="rt">
          <span className="dm-live" />
          <Pill kind={task.kind === "call" ? "warn" : "accent"}>à faire</Pill>
          <button className="btn outline sm" onClick={onNext}>
            Suivant
            <Icon name="arrowRight" className="ico-sm" />
          </button>
        </div>
      </div>

      <div className="dm-card-b">
        {/* Elle revient d'une mise de côté : ce qu'on avait noté ce jour-là est
            exactement ce qu'il faut relire avant de recomposer le numéro. Le
            temps du verbe compte — « rangé jusqu'au 15 » et « revenu, il avait
            été rangé jusqu'au 15 » n'appellent pas le même geste. */}
        {miseDeCote && (
          <div className="dm-hint">
            <Icon name="clock" className="ico-sm" />
            {new Date(miseDeCote.jusquau).getTime() > Date.now()
              ? `Mis de côté jusqu'au ${dateLongue(miseDeCote.jusquau)}`
              : `Revenu de mise de côté (rangé jusqu'au ${dateLongue(miseDeCote.jusquau)})`}
            {miseDeCote.motif ? ` — « ${miseDeCote.motif} »` : ""}.
          </div>
        )}

        {/* ── message ── */}
        {isMessageKind(task.kind) && (
          <>
            {/* Message à froid : la zone de saisie est vide et le restera — le
                moteur n'a rien rendu, faute d'étape. On le dit, plutôt que de
                laisser croire à un modèle qui n'a pas chargé.
                `versionsPreparees` rend TOUJOURS une version, fût-elle vide :
                c'est le texte qu'on teste, jamais le nombre de versions. */}
            {froid && !versions.some((v) => v.message.trim()) && (
              <div className="dm-hint">
                <Icon name="info" className="ico-sm" />
                Message à froid : aucun modèle préparé.{" "}
                {cohorte ? COHORTE_INFO[cohorte].argument : "Écris le message, il partira tel quel."}
              </div>
            )}

            {/* Les deux versions du modèle de l'étape — le même geste que la
                carte WhatsApp du pipeline commercial. Une seule version
                préparée ⇒ aucun choix affiché, plutôt qu'un faux choix. */}
            {versions.length > 1 && (
              <div className="dm-variant" role="group" aria-label="Version du message">
                {versions.map((v) => (
                  <button
                    key={v.variant}
                    type="button"
                    className="dm-variant-b"
                    aria-pressed={variant === v.variant}
                    title={VARIANT_LABELS[v.variant].hint}
                    onClick={() => pickVersion(v.variant)}
                  >
                    <Icon name={v.variant === "contact" ? "user" : "building"} className="ico-xs" />
                    {VARIANT_LABELS[v.variant].tab}
                  </button>
                ))}
              </div>
            )}

            <div className="dm-msg">
              <div className="subj">
                <Icon name={ch.ic} className="ico-sm" style={{ color: ch.c }} />
                <span style={{ fontWeight: 600 }}>{ctName || ent?.name}</span>
                {task.kind === "whatsapp" && phones.length > 1 ? (
                  <select
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      border: 0,
                      background: "transparent",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-3)",
                      outline: "none",
                    }}
                  >
                    {phones.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                    {task.kind === "whatsapp" ? phone : linkedinUrl ? "profil LinkedIn" : "—"}
                  </span>
                )}
              </div>
              <textarea
                value={body}
                onChange={(e) => {
                  retouche.current = true;
                  setMsg(e.target.value);
                }}
                spellCheck="false"
              />
              <div className="ft">
                <button
                  className="dm-att"
                  aria-pressed={att.demo}
                  disabled={!demoUrl}
                  onClick={() => setAtt((a) => ({ ...a, demo: !a.demo }))}
                >
                  <Icon name="globe" className="ico-xs" />
                  {demoUrl ? "lien du site démo" : "démo non publiée"}
                </button>
                {auditUrl && (
                  <button className="dm-att" aria-pressed={att.audit} onClick={() => setAtt((a) => ({ ...a, audit: !a.audit }))}>
                    <Icon name="clipboard" className="ico-xs" />
                    rapport d&apos;audit
                  </button>
                )}
                {/* SEULEMENT SUR UNE TÂCHE DE SÉQUENCE : celles qu'une action
                    `create_task` a posées n'ont aucune étape, donc aucun modèle
                    à relire — le bouton rendrait une erreur à tous les coups.
                    LE TEXTE EST DÉJÀ REFAIT À L'OUVERTURE : ce bouton n'est plus
                    le passage obligé, il sert à relire un modèle qu'on vient de
                    corriger dans un autre onglet. */}
                {task.enrollment_id && task.step_id && (
                  <button
                    className="dm-att"
                    disabled={rechargeant || busy}
                    onClick={() => void rechargerDepuisLeModele(false)}
                    title="Refaire le texte depuis le modèle actuel de l'étape, avec les variables de ce prospect"
                  >
                    <Icon name="refresh" className="ico-xs" />
                    {rechargeant ? "rechargement…" : "recharger le modèle"}
                  </button>
                )}
                {/* CE QUI A CHANGÉ TOUT SEUL SE DIT. Le texte affiché n'est plus
                    celui que la file portait : sans cette ligne, un agent qui
                    connaît son modèle par cœur croirait à un bug d'affichage. */}
                {refaitALOuverture && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      color: "var(--text-4)",
                    }}
                  >
                    refait depuis le modèle
                  </span>
                )}
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--text-4)",
                  }}
                >
                  {body.length} car.
                </span>
              </div>
            </div>

            {/* L'ENVOI : un bloc plein, à la couleur du canal. C'est le geste
                du métier, et il reste le plus visible tant qu'il n'a pas eu
                lieu. */}
            {/* CE QUI PART AVEC LE MESSAGE. Le texte annonce un document joint :
                si l'agent ne voyait pas ce document avant de cliquer, il
                enverrait une promesse sans la pièce. Le rappel est donc au-dessus
                du bouton, pas en dessous. */}
            {plaquetteUrl && (
              <div className="dm-hint">
                <Icon name="doc" className="ico-sm" />
                <span>
                  La plaquette s&apos;ouvre au format téléphone avec la boîte
                  d&apos;impression au clic sur «&nbsp;{ch.cta}&nbsp;» —
                  «&nbsp;Enregistrer en PDF&nbsp;», puis on la joint dans la conversation.
                  Le message, lui, ne contient aucun lien.
                </span>
              </div>
            )}

            <button
              className="dm-cta"
              data-fait={geste ? "1" : undefined}
              disabled={sending || busy}
              onClick={send}
            >
              <Icon name="send" className="ico-sm" />
              {ch.cta}
              {firstName ? ` à ${firstName}` : ""}
            </button>

            {/* ROUVRIR SANS RENVOYER. Une boîte d'impression fermée par erreur,
                un PDF perdu dans les téléchargements : sans cette porte, il
                faudrait recliquer « Envoyer » et rouvrir une conversation
                WhatsApp pour récupérer un fichier. */}
            {plaquetteUrl && (
              <button
                type="button"
                className="btn sm outline"
                style={{ alignSelf: "flex-start" }}
                onClick={ouvrirPlaquette}
              >
                <Icon name="doc" className="ico-sm" />
                Rouvrir la plaquette seule
              </button>
            )}

            {/* CE QUI FERME LA LIGNE : une barre, pas un second bloc. Les deux
                se confondaient, et se tromper coûte soit un message jamais
                envoyé marqué comme fait, soit un doublon chez le prospect. */}
            <BoutonBoucler
              arme={geste}
              label={geste ? "C'est fait" : "Marquer comme fait"}
              sous={geste ? undefined : "sans passer par l'envoi"}
              disabled={busy}
              onClick={markDone}
            />
          </>
        )}

        {/* ── appel ── */}
        {task.kind === "call" && (
          <>
            <div className="dm-tel">
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "var(--warn-tint)",
                  color: "var(--warn)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="phone" className="ico-sm" />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="num">{callPhone || "Aucun numéro connu"}</div>
                {ctName && (
                  <div className="who">
                    demander <strong>{ctName}</strong>
                    {dec?.role_title ? ` · ${dec.role_title}` : ""}
                  </div>
                )}
              </div>
            </div>

            <button
              className="dm-cta"
              data-fait={geste ? "1" : undefined}
              disabled={!callPhone || calling || busy}
              onClick={call}
            >
              <Icon name="phone" className="ico-sm" />
              Appeler{firstName ? ` ${firstName}` : ""}
            </button>

            <div className="dm-tabs" role="tablist" aria-label="Contenu de l'appel">
              <button
                type="button"
                role="tab"
                className="dm-tab"
                aria-selected={callTab === "script"}
                onClick={() => setCallTab("script")}
              >
                <Icon name="flow" className="ico-xs" />
                Script de l&apos;étape
              </button>
              <button
                type="button"
                role="tab"
                className="dm-tab"
                aria-selected={callTab === "aide"}
                onClick={() => setCallTab("aide")}
              >
                <Icon name="layers" className="ico-xs" />
                Trame &amp; objections
                <span className="n">{SCRIPT_STEPS.length + DEM_OBJECTIONS.length}</span>
              </button>
            </div>

            {callTab === "script" ? (
              <div className="dm-say">
                <div className="hd">
                  <Icon name="phone" className="ico-xs" style={{ color: ch.c }} />
                  <span className="ti">Ce que la séquence a préparé</span>
                  {scriptName && <span className="src">{scriptName}</span>}
                </div>

                {/* La bascule change le texte SOUS LES YEUX : elle ne règle pas
                    quelque chose dont on verrait l'effet au prochain appel. */}
                {callVersions.length > 1 && (
                  <div className="dm-variant" role="group" aria-label="Version du script">
                    {callVersions.map((v) => (
                      <button
                        key={v.variant}
                        type="button"
                        className="dm-variant-b"
                        aria-pressed={callVariant === v.variant}
                        title={VARIANT_LABELS[v.variant].hint}
                        onClick={() => setCallVariant(v.variant)}
                      >
                        <Icon name={v.variant === "contact" ? "user" : "building"} className="ico-xs" />
                        {VARIANT_LABELS[v.variant].tab}
                      </button>
                    ))}
                  </div>
                )}

                {callScript.trim() ? (
                  <p className="tx">{callScript}</p>
                ) : froid ? (
                  /* Un appel à froid N'A PAS de script préparé, et ce n'est pas
                     une anomalie : il n'y a pas d'étape où en ranger un. Lui
                     afficher l'avertissement de séquence enverrait corriger
                     quelque chose qui n'existe pas — cent fois par jour. */
                  <div className="dm-hint">
                    <Icon name="info" className="ico-sm" />
                    Appel à froid : aucun texte préparé, c&apos;est normal.{" "}
                    {cohorte ? `${COHORTE_INFO[cohorte].argument} ` : ""}La trame générique et les
                    objections sont dans l&apos;onglet à côté.
                  </div>
                ) : (
                  <div className="dm-hint warn">
                    <Icon name="warning" className="ico-sm" />
                    Cette étape n&apos;a aucun script préparé. Ouvre la trame générique dans l&apos;onglet
                    à côté, ou ajoute un texte à l&apos;étape dans la séquence.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="dm-scr">
                  {SCRIPT_STEPS.map((s, i) => (
                    <div className="r" key={s.title} onClick={() => setScriptStep(i)}>
                      <span className="k">{s.title}</span>
                      <span className="v" style={i === scriptStep ? { color: "var(--text)" } : undefined}>
                        <ScriptLine text={s.body.replace(/\{(\w+)\}/g, "{{$1}}")} vars={vars} />
                      </span>
                    </div>
                  ))}
                </div>

                <div className="dm-objs">
                  {DEM_OBJECTIONS.map((o, i) => (
                    <div className="dm-ob" key={o.q} onClick={() => setOb(ob === i ? null : i)}>
                      <div className="q">
                        {o.q}
                        <Icon name={ob === i ? "minus" : "plus"} className="ico-xs" />
                      </div>
                      {ob === i && <div className="a">{o.a}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── attente de réponse ── */}
        {task.kind === "wait" && (
          <>
            <div className="dm-hint">
              <Icon name="info" className="ico-sm" />
              La séquence est en pause : elle attend que le prospect réponde. Rien ne partira tant que
              personne ne l&apos;aura déclaré ici.
            </div>
            <button className="dm-cta" disabled={busy} onClick={declareReply}>
              <Icon name="check" className="ico-sm" />
              Le prospect a répondu
            </button>
            {/* CE QU'IL A DIT se note ICI, avant même de déclarer la réponse :
                c'est le moment où on l'a sous les yeux. La note part seule, la
                séquence n'a pas à bouger pour ça. */}
            <DemNotes
              entrepriseId={task.entreprise_id}
              contactId={task.contact_id}
              opportuniteId={task.opportunite_id}
              stepId={task.step_id}
              valeur={note}
              setValeur={setNote}
              placeholder={`Ce que ${firstName || "le prospect"} a répondu…`}
              onEnregistree={onLogged}
            />
            <div className="dm-cta2">
              <a className="btn outline sm" href="#messages-history" style={{ justifyContent: "center" }}>
                <Icon name="layers" className="ico-sm" />
                Relire les échanges
              </a>
              {/* Une attente n'est pas un cul-de-sac : rien à faire ici tant
                  que le prospect n'a pas réagi, donc on enchaîne. */}
              <button className="btn outline sm" onClick={onNext} style={{ justifyContent: "center" }}>
                <Icon name="arrowRight" className="ico-sm" />
                Tâche suivante
              </button>
            </div>
          </>
        )}

        {/* ── ni oui ni non : mettre de côté, sortir du canal, ou sortir du
            scénario. LA BARRE EST RENDUE SUR TOUS LES TYPES DE TÂCHE, attentes
            comprises — c'est précisément sur une attente qu'on découvre qu'il a
            appelé, puisque c'est là que la séquence croit qu'il se tait. */}
        <div className="dm-side-acts">
          {/* IL A PRIS CONTACT DE LUI-MÊME — en tête, et sur toute fiche.
              Ce n'est pas une variante des trois autres : les trois autres
              rangent un prospect qui n'a rien dit, celui-ci ramasse un prospect
              qui a parlé. C'est le seul geste de la carte qui rapporte de
              l'information ENTRANTE, et il ne doit pas se chercher. */}
          <button
            type="button"
            className="dm-side-b"
            aria-pressed={rappel}
            disabled={busy || envoiRappel}
            title="Il a appelé, écrit, ou répondu hors séquence — on consigne l'échange et ce qu'on lui a envoyé."
            onClick={() => {
              setRappel((v) => !v);
              setDeCote(false);
              setHorsCanal(false);
              setMotif("");
            }}
          >
            <Icon name="phone" className="ico-sm" />
            Il m&apos;a rappelé
          </button>
          {task.kind !== "wait" && (
            <button
              type="button"
              className="dm-side-b"
              aria-pressed={deCote}
              disabled={busy}
              onClick={() => {
                setDeCote((v) => !v);
                setHorsCanal(false);
                setRappel(false);
                // Le motif est propre à chaque geste : « il est en congés » n'a
                // rien à faire dans la note d'une sortie de canal.
                setMotif("");
              }}
            >
              <Icon name="clock" className="ico-sm" />
              Mettre de côté
            </button>
          )}
          {/* Décider d'appeler plutôt que d'écrire ne devrait pas coûter un
              faux « Fait » : la tâche change de canal, elle ne se ferme pas.
              Absent sur un appel (il l'est déjà) et sur une attente (il n'y a
              rien à envoyer). */}
          {isMessageKind(task.kind) && (
            <button
              type="button"
              className="dm-side-b"
              disabled={busy}
              title="Transformer cette tâche en appel — même prospect, même étape de séquence."
              onClick={onBasculerEnAppel}
            >
              <Icon name="phone" className="ico-sm" />
              Appeler plutôt
            </button>
          )}
          {/* Une sortie de canal n'a de sens que là où le canal peut manquer :
              un numéro sans compte WhatsApp, un contact sans LinkedIn. Un
              téléphone, lui, sonne ou ne sonne pas. */}
          {isMessageKind(task.kind) && (
            <button
              type="button"
              className="dm-side-b danger"
              aria-pressed={horsCanal}
              disabled={busy || sortie}
              onClick={() => {
                setHorsCanal((v) => !v);
                setDeCote(false);
                setRappel(false);
                setMotif("");
              }}
            >
              <Icon name="phoneOff" className="ico-sm" />
              Pas sur {ch.lb}
            </button>
          )}
        </div>

        {/* ── il a pris contact de lui-même ─────────────────────────────── */}
        {rappel && (
          <div className="dm-panel">
            <div className="dm-lbl">
              Il a pris contact de lui-même
              <span>on sort du scénario</span>
            </div>

            {/* PAR OÙ. L'appel domine largement — c'est le geste d'un artisan
                qui a le téléphone dans la main — mais un « oui c'est bien moi »
                sur WhatsApp est le même événement du point de vue du CRM : le
                prospect a parlé, hors de ce qu'on attendait. */}
            <div className="dm-outs">
              {(
                [
                  { id: "call", lb: "Il a appelé" },
                  { id: "whatsapp", lb: "Il a écrit sur WhatsApp" },
                  { id: "email", lb: "Il a répondu par e-mail" },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="dm-out"
                  aria-pressed={canalRappel === c.id}
                  onClick={() => setCanalRappel(c.id)}
                >
                  {c.lb}
                </button>
              ))}
            </div>

            {/* CE QU'ON LUI A ENVOYÉ PENDANT L'ÉCHANGE. Cochées par défaut :
                quand quelqu'un appelle, on lui envoie ce qu'on a, et c'est
                exactement ce qui ne se journalisait nulle part — le CRM voyait
                ensuite un prospect « sans envoi » qui ouvrait des liens. */}
            <div className="dm-lbl">
              Ce qu&apos;on lui a envoyé pendant l&apos;échange
              <span>décoche ce qui n&apos;est pas parti</span>
            </div>
            {(
              [
                { id: "demo", lb: "Le site démo" },
                { id: "plaquette", lb: "La plaquette" },
                { id: "audit", lb: "Le rapport d’audit" },
              ] as const
            ).map((p) => (
              <label key={p.id} className="dm-check">
                <input
                  type="checkbox"
                  checked={pieces[p.id]}
                  onChange={(e) => setPieces((v) => ({ ...v, [p.id]: e.target.checked }))}
                />
                <span>{p.lb}</span>
              </label>
            ))}

            {/* LA NOTE EST OBLIGATOIRE, et c'est la seule contrainte de ce
                panneau. Un « il a rappelé » sans contenu ne vaut pas mieux que
                le silence qu'il remplace : dans trois semaines, personne ne
                saura s'il était intéressé ou s'il appelait pour qu'on cesse.
                Elle est saisie dans le même champ que partout ailleurs sur la
                carte — `note` — pour qu'un texte déjà commencé plus bas ne soit
                pas à réécrire ici. */}
            <textarea
              className="dm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ce qu'il a dit, mot pour mot si possible — son objection est ce qu'on relira avant de le rappeler."
            />

            <div className="dm-hint">
              <Icon name="flow" className="ico-sm" />
              Il sort de {froid ? "la file à froid" : "sa séquence"} et passe sur «&nbsp;S4 — Il a
              rappelé&nbsp;» : un appel de suite arrive dans la file, avec le script qui correspond à
              ce qu&apos;on sait de lui. La suite reste libre — mise de côté, RDV, ou rien.
            </div>

            <button
              className="dm-cta"
              disabled={busy || envoiRappel || !note.trim()}
              onClick={declarerRappel}
            >
              <Icon name="check" className="ico-sm" />
              {envoiRappel ? "Enregistrement…" : "Consigner l’échange et la suite"}
            </button>
          </div>
        )}

        {deCote && task.kind !== "wait" && (
          <div className="dm-panel">
            <div className="dm-lbl">
              Il revient quand ?<span>ni un oui ni un non</span>
            </div>
            <div className="dm-outs">
              {DELAIS_MISE_DE_COTE.map((d) => (
                <button
                  key={d.j}
                  type="button"
                  className="dm-out"
                  aria-pressed={dateRetour === dansNJours(d.j)}
                  onClick={() => setDateRetour(dansNJours(d.j))}
                >
                  {d.lb}
                </button>
              ))}
              <input
                type="date"
                aria-label="Date de retour"
                className="dm-note"
                value={dateRetour}
                min={dansNJours(1)}
                onChange={(e) => setDateRetour(e.target.value)}
                style={{ minHeight: 0, height: 32, width: 150 }}
              />
            </div>
            <textarea
              className="dm-note"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Pourquoi maintenant ce n'est pas possible — c'est ce qu'on relira en le rouvrant."
            />
            <div className="dm-hint">
              <Icon name="info" className="ico-sm" />
              Il quitte la file et revient le {dateLongue(dateRetour)}. Rien n&apos;est envoyé
              d&apos;ici là, et l&apos;affaire n&apos;est ni gagnée ni perdue.
            </div>
            <button className="dm-cta" disabled={busy} onClick={mettreDeCote}>
              <Icon name="clock" className="ico-sm" />
              Mettre de côté jusqu&apos;au {dateLongue(dateRetour)}
            </button>
          </div>
        )}

        {horsCanal && isMessageKind(task.kind) && (
          <div className="dm-panel">
            <div className="dm-lbl">
              Injoignable sur {ch.lb}
              <span>le prospect reste bon</span>
            </div>
            <div className="dm-hint warn">
              <Icon name="warning" className="ico-sm" />
              {task.kind === "whatsapp"
                ? "Le numéro n'a pas de compte WhatsApp : rien ne partira jamais par là."
                : "Aucun profil LinkedIn atteignable pour ce contact."}{" "}
              Il sort de cette séquence — les relances prévues sont annulées. L&apos;affaire, elle,
              n&apos;est pas perdue.
            </div>
            <label className="dm-check">
              <input
                type="checkbox"
                checked={basculeAppel}
                onChange={(e) => setBasculeAppel(e.target.checked)}
              />
              <span>
                Le mettre dans mes appels à la place
                {phones[0] ? ` — ${phones[0]}` : " (aucun numéro connu)"}
              </span>
            </label>
            <textarea
              className="dm-note"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Précision éventuelle — sinon la raison est enregistrée telle quelle."
            />
            <button
              className="dm-cta"
              style={{ ["--k" as string]: "var(--danger)" }}
              disabled={busy || sortie}
              onClick={sortirDuCanal}
            >
              <Icon name="phoneOff" className="ico-sm" />
              {sortie ? "En cours…" : `Le sortir de la séquence ${ch.lb}`}
            </button>
          </div>
        )}

        {/* ── ce qu'il a dit, à toutes les étapes ── */}
        {task.kind !== "wait" && (
          <DemNotes
            entrepriseId={task.entreprise_id}
            contactId={task.contact_id}
            opportuniteId={task.opportunite_id}
            stepId={task.step_id}
            valeur={note}
            setValeur={setNote}
            placeholder={`Ce que dit ${firstName || "le prospect"}, son besoin, la prochaine étape…`}
            onEnregistree={onLogged}
            aide="« Noter » enregistre seul — sinon ce texte part avec la tâche."
          />
        )}

        {/* ── issue : commune à l'appel et au message ── */}
        {task.kind !== "wait" && (
          <>
            <div className="dm-lbl">
              Issue de l&apos;échange
              <span>facultatif</span>
            </div>
            <div className="dm-outs">
              {outcomes.map((o) => (
                <button
                  key={o.id}
                  className={`dm-out ${TONE[o.tone] ?? ""}`.trim()}
                  aria-pressed={outcome === o.id}
                  title={o.note}
                  onClick={() => setOutcome(o.id as StepOutcomeId)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {chosen?.needsDate && (
              <input
                type="date"
                className="dm-note"
                value={dateRetour}
                onChange={(e) => setDateRetour(e.target.value)}
                style={{ minHeight: 0, height: 36 }}
              />
            )}

            {chosen && (
              <div className="dm-hint">
                <Icon name="flow" className="ico-sm" />
                {chosen.note} — la file se met à jour automatiquement.
              </div>
            )}

            {/* Sans issue choisie, c'est « Fait » : l'action est faite, la
                séquence passe en attente et la file enchaîne. Dès qu'une issue
                est cochée, le même bouton l'enregistre — un seul bouton, jamais
                deux gestes concurrents.

                Sur un message, « Fait » vit déjà en gros sous l'envoi : ce
                bouton-ci n'apparaît donc que pour enregistrer une issue. */}
            {(!isMessageKind(task.kind) || outcome) && (
              <BoutonBoucler
                arme={geste || !!outcome}
                label={chosen ? `Enregistrer l'issue · ${chosen.label}` : "C'est fait"}
                disabled={busy}
                onClick={outcome ? saveOutcome : markDone}
              />
            )}

            <div className="dm-cta2">
              <button className="btn outline sm" disabled={busy} onClick={rdv} style={{ justifyContent: "center" }}>
                <Icon name="calendar" className="ico-sm" />
                RDV calé
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
