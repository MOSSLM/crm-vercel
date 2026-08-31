"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { one } from "@/components/agent-portal/format";
import { DemRail } from "@/components/agent-portal/demarchage/DemRail";
import { DemHead } from "@/components/agent-portal/demarchage/DemHead";
import { DemSeqStrip } from "@/components/agent-portal/demarchage/DemSeqStrip";
import { DemActionCard } from "@/components/agent-portal/demarchage/DemActionCard";
import { DemHisto } from "@/components/agent-portal/demarchage/DemHisto";
import { DemRetour } from "@/components/agent-portal/demarchage/DemRetour";
import { DemSide } from "@/components/agent-portal/demarchage/DemSide";
import { DemSearch } from "@/components/agent-portal/demarchage/DemSearch";
import { DemHorsFile } from "@/components/agent-portal/demarchage/DemHorsFile";
import { DemAttribution } from "@/components/agent-portal/demarchage/DemAttribution";
import {
  fileDe,
  fileDeLaJournee,
  hasSignal,
  repartirLaJournee,
  type DemarchageSignal,
  type FileDeTravail,
} from "@/lib/agent-portal/demarchage-buckets";
import type { CompanySearchResult } from "@/lib/entreprises/colonnes";
import type {
  CompanyBundle,
  DemCohorte,
  DemarchagePatchBody,
  DemarchageQueueMeta,
  DemarchageTask,
  DemAudit,
} from "@/components/agent-portal/demarchage/types";
import "@/components/agent-portal/demarchage/dem-skin.css";

const EMPTY_META: DemarchageQueueMeta = {
  done_today: 0,
  done_today_by_kind: {},
  done_today_conversation: 0,
};

/**
 * Démarchage — le poste de travail.
 *
 * Trois zones : la file à gauche, l'entreprise en cours au centre (son dossier
 * en en-tête, sa frise de séquence, la carte d'action de l'étape, puis tout son
 * historique), et à droite ce dont on se sert pendant l'échange (démo, audit,
 * RDV, registre).
 *
 * LA FILE EST TRIPLE, et c'est la décision qui structure tout l'écran :
 *   · À CONTACTER — des entreprises que personne n'a jamais abordées. Un stock,
 *     rien ne les date. L'objectif du jour s'affiche, il ne cache rien ;
 *   · RELANCES — des gens déjà touchés, dus aujourd'hui ou en retard. Ce qui
 *     est prévu plus tard est compté en pied de liste, pas déplié ;
 *   · EN ATTENTE — rien à envoyer, une réponse à déclarer. Ces lignes étaient
 *     mêlées aux relances, donc invisibles, et les séquences dormaient.
 * (cf. `repartirLaJournee`).
 *
 * L'écran est piloté par une TÂCHE — sauf sur un point, et c'est volontaire :
 * une entreprise qui rappelle n'a par définition rien de prévu aujourd'hui.
 * `horsFile` ouvre alors sa fiche seule, sans tâche et sans rien créer.
 *
 * ── DEUX MONTAGES, UN SEUL ÉCRAN ─────────────────────────────────────────
 * Il était une `page.tsx` sous `espace-agent/` : le seul moyen pour l'admin de
 * démarcher était de se fabriquer un second compte. Il est devenu un composant,
 * monté par deux routes — `/espace-agent/demarchage` (coque agent) et
 * `/terrain` (coque admin). RIEN N'A ÉTÉ DUPLIQUÉ, et il ne faut pas le faire :
 * dès qu'un écran de travail existe en deux exemplaires, l'un des deux prend du
 * retard sans que personne s'en aperçoive.
 *
 * Il ne prend aucune option de rôle, et c'est délibéré : il ne lit QUE le
 * périmètre du compte connecté (`user.id`, côté serveur). Un admin y voit donc
 * sa propre file, jamais celle d'un agent — pour regarder le travail des
 * autres, c'est `/equipe`, qui est un écran de lecture.
 */
export function EcranDemarchage() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<DemarchageTask[]>([]);
  const [meta, setMeta] = useState<DemarchageQueueMeta>(EMPTY_META);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  /** Laquelle des trois files on travaille. */
  const [file, setFile] = useState<FileDeTravail>("premiers");

  /**
   * Les relances prévues plus tard sont-elles dépliées ?
   *
   * Fermé par défaut : la journée d'un agent est ce qui est dû aujourd'hui. Le
   * pied de liste dit combien il y en a, ce qui suffit à ne pas les oublier.
   */
  const [aVenirOuvert, setAVenirOuvert] = useState(false);

  /**
   * Les filtres, désormais INDÉPENDANTS l'un de l'autre.
   *
   * Ils partageaient une seule variable, donc un seul choix à la fois : voir les
   * prospects chauds voulait dire renoncer à voir le canal, et inversement. Or
   * un lead peut être chaud ET en attente de réponse ET sur une tâche WhatsApp —
   * ce sont trois dimensions différentes du même prospect, pas trois valeurs
   * concurrentes.
   */
  const [canal, setCanal] = useState<string | null>(null);
  const [signal, setSignal] = useState<DemarchageSignal | null>(null);
  /** Étape de séquence filtrée — `null` = toutes. */
  const [step, setStep] = useState<number | null>(null);
  /**
   * Cohorte filtrée — `null` = les deux.
   *
   * Contrairement au canal et au signal, elle ne filtre PAS en mémoire : elle
   * part au serveur (`?cohorte=…`). La campagne compare deux cohortes au même
   * âge, et une cohorte tronquée par la pagination de la file donnerait des
   * comptes faux — c'est la file entière qui doit être celle de la cohorte.
   */
  const [cohorte, setCohorte] = useState<DemCohorte | null>(null);

  const [company, setCompany] = useState<CompanyBundle | null>(null);
  const [audit, setAudit] = useState<DemAudit>(null);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  /** La recherche « quelqu'un rappelle » est-elle ouverte ? */
  const [recherche, setRecherche] = useState(false);
  /** L'entreprise regardée hors file, quand elle n'a aucune tâche à traiter. */
  const [horsFile, setHorsFile] = useState<number | null>(null);

  /**
   * S'attribuer des entreprises : le panneau, et ce que le pool contient.
   *
   * `poolDispo` vaut `null` tant qu'on ne sait pas — l'agent n'a peut-être pas
   * ce droit (cf. `agent_settings.can_self_assign`), et proposer un bouton qui
   * répondra « interdit » vaut moins que ne rien proposer.
   */
  const [attribution, setAttribution] = useState(false);
  const [poolDispo, setPoolDispo] = useState<number | null>(null);

  const relirePool = useCallback(async () => {
    try {
      const res = await authedFetch("/api/agent/demarchage/pool?apercu=1");
      if (!res.ok) return;
      const body = (await res.json()) as { autorise?: boolean; total?: number };
      setPoolDispo(body.autorise ? (body.total ?? 0) : null);
    } catch {
      // sans réponse, le bouton ne s'affiche pas : c'est le bon défaut
    }
  }, []);

  useEffect(() => {
    void relirePool();
  }, [relirePool]);

  /**
   * Recharge la file et décide sur quoi on atterrit.
   *
   * `pick` non fourni  → on reste sur la tâche courante ;
   * `pick === null`    → recalcul complet (la tâche traitée a quitté la file) ;
   * `pick` = fonction  → on choisit à partir de la file FRAÎCHE, ce qui est le
   *   seul moyen de retrouver une ligne que le serveur vient de créer (typiquement
   *   l'attente de réponse posée par le moteur juste après un « Fait »).
   */
  const loadQueue = useCallback(
    async (
      pick?: string | null | ((rows: DemarchageTask[]) => string | null),
    ): Promise<DemarchageTask[]> => {
      setLoadingQueue(true);
      let fraiche: DemarchageTask[] = [];
      try {
        // La cohorte est le seul filtre qui voyage jusqu'à la route : les autres
        // trient ce qui est déjà chargé.
        const res = await authedFetch(
          cohorte ? `/api/agent/tasks?cohorte=${encodeURIComponent(cohorte)}` : "/api/agent/tasks",
        );
        // Une file qui ne se charge pas rend un tableau vide, pas `undefined` :
        // l'appelant enchaîne sur ce qu'elle contient, et lui faire tester deux
        // formes d'absence est un piège pour rien.
        if (!res.ok) return fraiche;
        const body = (await res.json()) as { tasks: DemarchageTask[]; meta: DemarchageQueueMeta };
        const next = body.tasks ?? [];
        fraiche = next;
        setTasks(next);
        setMeta(body.meta ?? EMPTY_META);
        setSel((current) => {
          const wanted = typeof pick === "function" ? pick(next) : pick === undefined ? current : pick;
          if (wanted && next.some((t) => t.id === wanted)) return wanted;
          // À défaut, la tête de la file la plus urgente : les relances si
          // elles portent du travail (un prospect qui a réagi passe avant un
          // inconnu), sinon les premiers contacts, sinon les attentes.
          const r = repartirLaJournee(next);
          return r.relances[0]?.id ?? r.premiers[0]?.id ?? r.attentes[0]?.id ?? null;
        });
      } catch {
        toast.error("Impossible de charger la file de démarchage.");
      } finally {
        setLoadingQueue(false);
      }
      return fraiche;
    },
    [cohorte],
  );

  // Changer de cohorte relance la requête : `loadQueue` en dépend, donc son
  // identité change, donc cet effet rejoue. C'est le seul rechargement voulu.
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  /** La journée rangée : à contacter, relances, à venir, attentes. */
  const rep = useMemo(() => repartirLaJournee(tasks), [tasks]);

  const task = useMemo(() => tasks.find((t) => t.id === sel) ?? null, [tasks, sel]);

  // La file SUIT la tâche choisie : atterrir sur une attente en laissant l'écran
  // sur « à contacter » ferait dire deux choses différentes au même écran.
  useEffect(() => {
    if (!task) return;
    setFile(fileDe(rep, task));
  }, [task, rep]);

  // Une relance dépliée depuis « plus tard » ne doit pas se replier sous les
  // yeux : si la sélection en vient, le pied reste ouvert.
  useEffect(() => {
    if (task && rep.aVenir.includes(task)) setAVenirOuvert(true);
  }, [task, rep]);

  /** La liste de la file courante, avant filtres. */
  const duJour = useMemo(
    () => fileDeLaJournee(rep, file, aVenirOuvert),
    [rep, file, aVenirOuvert],
  );

  // Les pastilles ne montrent que ce que la liste contient : un filtre resté
  // coché sur un canal absent afficherait une file vide SANS afficher le filtre
  // responsable — impossible à défaire autrement qu'en rechargeant. On le
  // relâche donc dès qu'il n'a plus de pastille.
  useEffect(() => {
    setCanal((c) => (c == null || duJour.some((t) => t.kind === c) ? c : null));
    setSignal((s) => (s == null || duJour.some((t) => hasSignal(t, s)) ? s : null));
    setStep((s) => (s == null || duJour.some((t) => t.sequence?.stepIndex === s) ? s : null));
  }, [duJour]);

  // Le même filet, pour la cohorte. Il regarde la file ENTIÈRE et non l'onglet :
  // le filtre étant servi par la route, une cohorte sans aucune ligne ne rend
  // pas une liste vide mais une file vide — et rien à l'écran ne dirait
  // pourquoi. On le relâche, ce qui recharge les deux cohortes.
  useEffect(() => {
    if (cohorte && !loadingQueue && tasks.length === 0) setCohorte(null);
  }, [cohorte, loadingQueue, tasks.length]);

  const shown = useMemo(
    () =>
      duJour.filter(
        (t) =>
          (canal == null || t.kind === canal) &&
          (signal == null || hasSignal(t, signal)) &&
          (step == null || t.sequence?.stepIndex === step),
      ),
    [duJour, canal, signal, step],
  );

  // Fiche entreprise + audit à chaque changement de prospect. La fiche ouverte
  // hors file prime sur la tâche sélectionnée : c'est elle qu'on regarde, la
  // file continue d'exister derrière sans se recharger.
  const entrepriseId = horsFile ?? task?.entreprise_id ?? null;
  useEffect(() => {
    if (!entrepriseId) {
      setCompany(null);
      setAudit(null);
      return;
    }
    let active = true;
    (async () => {
      const [cRes, aRes] = await Promise.all([
        authedFetch(`/api/agent/demarchage/company?entreprise_id=${entrepriseId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        authedFetch(`/api/audit-site/${entrepriseId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (!active) return;
      setCompany((cRes as CompanyBundle) ?? null);
      setAudit(aRes?.disponible === false ? null : ((aRes?.audit as DemAudit) ?? null));
    })();
    return () => {
      active = false;
    };
  }, [entrepriseId]);

  /**
   * Le dossier de la fiche hors file — et seulement s'il est bien le SIEN.
   *
   * Le bundle précédent reste affiché pendant le chargement du suivant, ce qui
   * est un confort quand on enchaîne les tâches. Ici, non : le nom encore à
   * l'écran est celui qu'on s'apprête à prononcer au téléphone. On attend donc
   * que le dossier chargé corresponde à l'entreprise demandée.
   */
  const ficheHorsFile =
    horsFile != null && company?.entreprise.id === horsFile ? company : null;
  const enTete = horsFile != null ? ficheHorsFile : company;

  /**
   * « / » ouvre la recherche : une seule touche, atteignable sans regarder le
   * clavier pendant que ça sonne. ⌘K et ⌘J sont déjà pris par le menu de
   * commandes et le cockpit RDV de l'espace agent.
   *
   * Rien n'est intercepté pendant une saisie — sans quoi taper « et/ou » dans
   * une note ouvrirait la recherche. Le champ de recherche gère lui-même
   * Entrée, les flèches et Échap.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const enSaisie =
        !!cible &&
        (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName));
      if (enSaisie) return;
      if (e.key === "/") {
        e.preventDefault();
        setRecherche(true);
        return;
      }
      // Échap quitte la fiche hors file et rend la file — le chemin de retour
      // d'un aller sans clic.
      if (e.key === "Escape" && !recherche && horsFile != null) {
        e.preventDefault();
        setHorsFile(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recherche, horsFile]);

  const estEnFile = useCallback(
    (id: number) => tasks.some((t) => t.entreprise_id === id),
    [tasks],
  );

  /**
   * Ce qui se passe quand on choisit une entreprise dans la recherche.
   *
   * Si elle a une tâche en file, on atterrit dessus — et on relâche les filtres
   * au passage : atterrir sur une tâche que la liste de gauche n'affiche pas
   * ferait dire deux choses différentes au même écran. Sinon, sa fiche seule.
   */
  const ouvrirEntreprise = useCallback(
    (e: CompanySearchResult) => {
      setRecherche(false);
      const enFile = tasks.find((t) => t.entreprise_id === e.id);
      if (enFile) {
        setHorsFile(null);
        setCanal(null);
        setSignal(null);
        setStep(null);
        setSel(enFile.id);
        return;
      }
      setHorsFile(e.id);
    },
    [tasks],
  );

  const goNext = useCallback(() => {
    const next = shown.find((t) => t.id !== sel);
    if (next) setSel(next.id);
  }, [shown, sel]);

  /**
   * BOUCLER UNE TÂCHE, PUIS DESCENDRE — jamais remonter sur le même prospect.
   *
   * On suivait l'inscription : boucler un premier contact garait la séquence
   * sur son attente de réponse, et l'écran atterrissait sur cette attente
   * fraîchement créée. Du point de vue de l'agent, « c'est fait » ramenait donc
   * au prospect qu'il venait de terminer, avec une carte où il n'y a rien à
   * faire — le geste ne faisait pas avancer la file, il tournait en rond.
   *
   * La règle est celle de lemlist : « Terminer » ferme la ligne et passe à la
   * SUIVANTE. La tâche suivante du même prospect reprend sa place à sa date,
   * elle ne double personne.
   *
   * Ce qui reste du suivi de prospect : un lien dans le message de
   * confirmation. Quand le geste a réellement ouvert une suite (l'attente, ou
   * l'étape que la réponse débloque), on la propose en un clic — sans jamais
   * l'imposer.
   */
  /**
   * Le retour en arrière — la photo d'avant, reposée.
   *
   * Le serveur a photographié la tâche et son inscription JUSTE AVANT
   * d'écrire ; annuler consiste à reposer cette photo, pas à recalculer un état
   * inverse. Il refuse de lui-même quand quelque chose s'est passé depuis — un
   * geste plus récent sur le même prospect, ou un message réellement parti — et
   * il dit alors laquelle des deux raisons, en clair.
   *
   * CE QUE ÇA NE FAIT PAS : rappeler un message. Un WhatsApp ouvert dans
   * `wa.me` est parti pour de bon. Ce qui revient, c'est notre comptabilité.
   */
  const annulerLeGeste = useCallback(
    async (gesteId: string) => {
      try {
        const res = await authedFetch("/api/agent/gestes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: gesteId }),
        });
        const data = (await res.json()) as { motif?: string; error?: string };
        if (!res.ok) throw new Error(data?.error ?? "Annulation impossible");
        toast.success(`C'est revenu en arrière : ${data.motif ?? "l'état précédent est reposé"}.`);
        setHistoryKey((k) => k + 1);
        await loadQueue(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Annulation impossible");
      }
    },
    [loadQueue],
  );

  const handlePatch = useCallback(
    async (body: Omit<DemarchagePatchBody, "id">) => {
      if (!task) return;
      // Retenus AVANT l'appel : une fois la tâche bouclée, elle disparaît de la
      // file et ces trois repères avec elle.
      const enrollmentId = task.enrollment_id;
      const courant = task.id;
      const nom = one(task.entreprise)?.name ?? "ce prospect";
      const suivante = shown.find((t) => t.id !== task.id)?.id ?? null;

      setBusy(true);
      try {
        const res = await authedFetch("/api/agent/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, ...body }),
        });
        if (!res.ok) throw new Error();
        // `geste_id` est la photo prise juste avant l'écriture : c'est elle qui
        // rend le geste réversible. `null` quand rien n'a pu être photographié
        // — le bouton ne s'affiche alors pas, plutôt que d'échouer au clic.
        const gesteId = ((await res.json().catch(() => ({}))) as { geste_id?: string | null })
          .geste_id;
        setHistoryKey((k) => k + 1);
        const rows = await loadQueue(suivante);
        const suite = enrollmentId
          ? (rows.find((t) => t.enrollment_id === enrollmentId && t.id !== courant) ?? null)
          : null;
        toast.success(body.step_outcome ? "Issue enregistrée." : "C'est fait.", {
          description: suite ? `${nom} a une suite : ${suite.sequence?.stepLabel ?? "étape suivante"}.` : undefined,
          action: suite
            ? {
                label: "L'ouvrir",
                onClick: () => {
                  setHorsFile(null);
                  setSel(suite.id);
                },
              }
            : undefined,
          // L'ANNULATION TOUJOURS AU MÊME ENDROIT, quelle que soit l'autre
          // action proposée : on ne cherche pas un bouton de rattrapage.
          // Et ce n'est pas la seule porte — le tableau des tâches garde la
          // liste des derniers gestes, pour ceux qu'on regrette une heure plus
          // tard plutôt que dans les cinq secondes.
          cancel: gesteId
            ? { label: "Annuler ce geste", onClick: () => void annulerLeGeste(gesteId) }
            : undefined,
        });
      } catch {
        toast.error("Action impossible.");
      } finally {
        setBusy(false);
      }
    },
    [task, shown, loadQueue, annulerLeGeste],
  );

  const onLogged = useCallback(() => setHistoryKey((k) => k + 1), []);

  /**
   * La tâche a quitté la file sans passer par le `PATCH` habituel — une sortie
   * de canal (« pas sur WhatsApp »), qui annule la tâche et ferme sa séquence
   * d'un seul geste côté serveur. On enchaîne comme après n'importe quel geste
   * bouclé : la tâche suivante de la liste affichée.
   */
  const onRetire = useCallback(() => {
    const suivante = shown.find((t) => t.id !== sel)?.id ?? null;
    setHistoryKey((k) => k + 1);
    void loadQueue(suivante);
  }, [shown, sel, loadQueue]);

  /**
   * « Je préfère l'appeler » — un clic, la tâche courante devient un appel.
   *
   * Le geste manquait, et rien ne le remplaçait : décider d'appeler un prospect
   * dont la séquence prévoyait un WhatsApp obligeait à boucler la tâche comme
   * faite (ce qui est faux, rien n'a été envoyé) ou à la laisser traîner. La
   * tâche est modifiée SUR PLACE — même prospect, même étape, même séquence :
   * seul le canal change, donc l'identifiant ne bouge pas et on reste dessus.
   */
  const basculerEnAppel = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const res = await authedFetch("/api/agent/demarchage/basculer-en-appel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: id }),
        });
        const corps = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) {
          toast.error(corps?.message || corps?.error || "Bascule impossible.");
          return;
        }
        toast.success("À appeler — la tâche est passée en appel.");
        await loadQueue(id);
      } catch {
        toast.error("Bascule impossible.");
      } finally {
        setBusy(false);
      }
    },
    [loadQueue],
  );

  /**
   * Le prospect a répondu : l'attente est levée et le moteur a déjà posé
   * l'étape suivante.
   *
   * Même règle que « c'est fait » — la file descend. L'étape que la réponse
   * débloque (typiquement : envoyer le site démo) est réelle et souvent
   * urgente, alors elle est PROPOSÉE dans le message de confirmation ; elle
   * n'est pas imposée. Sans quoi déclarer trois réponses d'affilée obligeait à
   * traiter trois prospects en entier au milieu de la file des attentes.
   */
  const onReplied = useCallback(() => {
    const enrollmentId = task?.enrollment_id ?? null;
    const courant = task?.id ?? null;
    const nom = task ? (one(task.entreprise)?.name ?? "ce prospect") : "ce prospect";
    const suivante = shown.find((t) => t.id !== courant)?.id ?? null;
    setHistoryKey((k) => k + 1);
    void (async () => {
      const rows = await loadQueue(suivante);
      const suite = enrollmentId
        ? (rows.find((t) => t.enrollment_id === enrollmentId && t.id !== courant) ?? null)
        : null;
      if (!suite) return;
      toast.success(`Réponse enregistrée — ${nom} passe à la suite.`, {
        description: suite.sequence?.stepLabel ?? undefined,
        action: {
          label: "L'ouvrir",
          onClick: () => {
            setHorsFile(null);
            setSel(suite.id);
          },
        },
      });
    })();
  }, [task, shown, loadQueue]);

  const companyName = enTete?.entreprise.name ?? "";

  return (
    <div className="dm-skin" style={{ flex: 1, minHeight: 0 }}>
      <div className="dm">
        <DemRail
          file={file}
          setFile={setFile}
          rep={rep}
          aVenirOuvert={aVenirOuvert}
          setAVenirOuvert={setAVenirOuvert}
          canal={canal}
          setCanal={setCanal}
          signal={signal}
          setSignal={setSignal}
          step={step}
          setStep={setStep}
          cohorte={cohorte}
          setCohorte={setCohorte}
          tasks={shown}
          meta={meta}
          agentName={user?.name ?? null}
          loading={loadingQueue}
          busy={busy}
          // Rien de surligné dans la file quand on regarde une fiche hors
          // file : ce n'est pas elle qui est à l'écran.
          sel={horsFile != null ? null : (task?.id ?? null)}
          onPick={(id) => {
            setHorsFile(null);
            setSel(id);
          }}
          onRechercher={() => setRecherche(true)}
          onBasculerEnAppel={basculerEnAppel}
          poolDispo={poolDispo}
          onAttribuer={() => setAttribution(true)}
        />

        {enTete && (task || horsFile != null) ? (
          <DemHead
            company={enTete}
            sequence={horsFile != null ? null : (task?.sequence ?? null)}
            audit={audit}
            cohorte={horsFile != null ? null : (task?.cohorte ?? null)}
            horsSequence={horsFile == null && task?.hors_sequence === true}
          />
        ) : (
          <header className="dm-head">
            <div className="dm-hd">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">Démarchage</div>
                <div className="sb">
                  <span className="it">
                    {horsFile != null
                      ? "Ouverture de la fiche…"
                      : loadingQueue
                        ? "Chargement de la file…"
                        : "Aucune entreprise à démarcher pour l'instant."}
                  </span>
                </div>
              </div>
            </div>
          </header>
        )}

        <main className="dm-main">
          {/* LE RATTRAPAGE AVANT LE TRAVAIL. Il ne dépend pas de la tâche
              affichée — ce sont les derniers gestes de l'agent, quel que soit
              le prospect ouvert au centre — et il s'efface tout seul quand il
              n'y a plus rien à annuler. Le toast, lui, ne sert qu'aux cinq
              secondes qui suivent le clic. */}
          {/* La tâche ouverte au centre lui sert à proposer les étapes de SA
              séquence : le reste du bloc reste indépendant du prospect affiché. */}
          <DemRetour
            taskId={horsFile == null ? (task?.id ?? null) : null}
            apres={() => {
              setHistoryKey((k) => k + 1);
              void loadQueue();
            }}
          />
          {horsFile != null ? (
            ficheHorsFile && (
              <>
                <DemHorsFile
                  company={ficheHorsFile}
                  onRetour={() => setHorsFile(null)}
                  onNote={onLogged}
                />
                <DemHisto
                  entrepriseId={horsFile}
                  companyName={companyName}
                  refreshKey={historyKey}
                />
              </>
            )
          ) : task ? (
            <>
              <DemSeqStrip
                sequence={task.sequence}
                horsSequence={task.hors_sequence === true}
                cohorte={task.cohorte ?? null}
              />
              <DemActionCard
                key={task.id}
                task={task}
                company={company}
                audit={audit}
                busy={busy}
                onPatch={handlePatch}
                onLogged={onLogged}
                onNext={goNext}
                onReplied={onReplied}
                onRetire={onRetire}
                onBasculerEnAppel={() => basculerEnAppel(task.id)}
              />
              {task.entreprise_id != null && (
                <DemHisto
                  entrepriseId={task.entreprise_id}
                  companyName={companyName}
                  refreshKey={historyKey}
                />
              )}
            </>
          ) : (
            !loadingQueue && (
              // Le message d'avant parlait de séquences : depuis les appels à
              // froid, une file vide veut dire « plus personne à appeler », pas
              // « aucune séquence en cours ».
              <div className="dm-hint">
                File vide — aucune entreprise n&apos;attend d&apos;action aujourd&apos;hui. Si
                quelqu&apos;un rappelle, sa fiche se retrouve avec « / ».
              </div>
            )
          )}
        </main>

        {enTete && (task || horsFile != null) ? (
          <DemSide
            company={enTete}
            audit={audit}
            opportuniteId={
              horsFile != null ? (enTete.opportunite?.id ?? null) : (task?.opportunite_id ?? null)
            }
          />
        ) : (
          <aside className="dm-side" />
        )}

        <DemSearch
          ouvert={recherche}
          onFermer={() => setRecherche(false)}
          onChoisir={ouvrirEntreprise}
          estEnFile={estEnFile}
        />

        <DemAttribution
          ouvert={attribution}
          onFermer={() => setAttribution(false)}
          onAttribue={() => {
            // L'attribution sème une tâche « Appel à froid » par entreprise :
            // c'est elle qui les fait apparaître ici. Sans ce rechargement, le
            // lot resterait invisible jusqu'au prochain passage sur la page.
            void loadQueue();
            void relirePool();
          }}
        />
      </div>
    </div>
  );
}

export default EcranDemarchage;
