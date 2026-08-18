"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { DemRail, type DemOnglet } from "@/components/agent-portal/demarchage/DemRail";
import { DemHead } from "@/components/agent-portal/demarchage/DemHead";
import { DemSeqStrip } from "@/components/agent-portal/demarchage/DemSeqStrip";
import { DemActionCard } from "@/components/agent-portal/demarchage/DemActionCard";
import { DemHisto } from "@/components/agent-portal/demarchage/DemHisto";
import { DemSide } from "@/components/agent-portal/demarchage/DemSide";
import { DemSearch } from "@/components/agent-portal/demarchage/DemSearch";
import { DemHorsFile } from "@/components/agent-portal/demarchage/DemHorsFile";
import { DemAttribution } from "@/components/agent-portal/demarchage/DemAttribution";
import {
  dayOfTask,
  estPremierContact,
  hasSignal,
  joursReels,
  separerFile,
  type DemarchageSignal,
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
 * LA FILE EST DOUBLE, et c'est la décision qui structure tout l'écran :
 *   · PREMIERS CONTACTS — des entreprises que personne n'a jamais abordées. Un
 *     stock, rien ne les date. L'objectif du jour s'affiche, il ne cache rien ;
 *   · RELANCES & DISCUSSIONS — des gens déjà touchés. Un calendrier : chaque
 *     ligne à la date où elle est due, l'échu replié sur aujourd'hui.
 * (cf. `separerFile` / `joursReels`).
 *
 * L'écran est piloté par une TÂCHE — sauf sur un point, et c'est volontaire :
 * une entreprise qui rappelle n'a par définition rien de prévu aujourd'hui.
 * `horsFile` ouvre alors sa fiche seule, sans tâche et sans rien créer.
 */
export default function AgentDemarchagePage() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<DemarchageTask[]>([]);
  const [meta, setMeta] = useState<DemarchageQueueMeta>(EMPTY_META);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  /** Laquelle des deux files on travaille. */
  const [onglet, setOnglet] = useState<DemOnglet>("premiers");

  /**
   * Le jour affiché dans les relances, par sa date civile (YYYY-MM-DD). Les
   * premiers contacts n'en ont pas : rien ne les date.
   */
  const [day, setDay] = useState<string>("");

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
    async (pick?: string | null | ((rows: DemarchageTask[]) => string | null)) => {
      setLoadingQueue(true);
      try {
        // La cohorte est le seul filtre qui voyage jusqu'à la route : les autres
        // trient ce qui est déjà chargé.
        const res = await authedFetch(
          cohorte ? `/api/agent/tasks?cohorte=${encodeURIComponent(cohorte)}` : "/api/agent/tasks",
        );
        if (!res.ok) return;
        const body = (await res.json()) as { tasks: DemarchageTask[]; meta: DemarchageQueueMeta };
        const next = body.tasks ?? [];
        setTasks(next);
        setMeta(body.meta ?? EMPTY_META);
        setSel((current) => {
          const wanted = typeof pick === "function" ? pick(next) : pick === undefined ? current : pick;
          if (wanted && next.some((t) => t.id === wanted)) return wanted;
          // À défaut, la tête de la file la plus urgente : les relances si elles
          // portent du travail (un prospect qui a répondu passe avant un
          // inconnu), sinon les premiers contacts.
          const { premiers, relances } = separerFile(next);
          const jours = joursReels(relances);
          return jours[0]?.tasks[0]?.id ?? premiers[0]?.id ?? null;
        });
      } catch {
        toast.error("Impossible de charger la file de démarchage.");
      } finally {
        setLoadingQueue(false);
      }
    },
    [cohorte],
  );

  // Changer de cohorte relance la requête : `loadQueue` en dépend, donc son
  // identité change, donc cet effet rejoue. C'est le seul rechargement voulu.
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  /** Les deux files, et le calendrier des relances. */
  const { premiers, relances } = useMemo(() => separerFile(tasks), [tasks]);
  const jours = useMemo(() => joursReels(relances), [relances]);

  const task = useMemo(() => tasks.find((t) => t.id === sel) ?? null, [tasks, sel]);

  // L'onglet et le jour SUIVENT la tâche choisie : atterrir sur une relance de
  // jeudi en laissant l'écran sur « premiers contacts / aujourd'hui » ferait
  // dire deux choses différentes au même écran.
  useEffect(() => {
    if (!task) return;
    setOnglet(estPremierContact(task) ? "premiers" : "relances");
  }, [task]);

  useEffect(() => {
    const k = task && !estPremierContact(task) ? dayOfTask(jours, task.id) : null;
    setDay((current) => k ?? (jours.some((d) => d.date === current) ? current : jours[0]?.date ?? ""));
  }, [task, jours]);

  /** La liste de l'onglet courant, avant filtres. */
  const duJour = useMemo(
    () => (onglet === "premiers" ? premiers : (jours.find((d) => d.date === day)?.tasks ?? [])),
    [onglet, premiers, jours, day],
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

  const handlePatch = useCallback(
    async (body: Omit<DemarchagePatchBody, "id">) => {
      if (!task) return;
      // Retenus AVANT l'appel : une fois la tâche bouclée, elle disparaît de la
      // file et ces deux repères avec elle.
      const enrollmentId = task.enrollment_id;
      const suivante = shown.find((t) => t.id !== task.id)?.id ?? null;

      setBusy(true);
      try {
        const res = await authedFetch("/api/agent/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, ...body }),
        });
        if (!res.ok) throw new Error();
        toast.success(body.step_outcome ? "Issue enregistrée." : "C'est fait.");
        setHistoryKey((k) => k + 1);
        await loadQueue((rows) => {
          // On suit le prospect, pas la file : boucler un premier contact gare
          // sa séquence sur l'attente de réponse, et c'est cette ligne-là qu'on
          // veut sous les yeux — pas un prospect au hasard. À défaut (séquence
          // terminée, arrêtée, ou appel à froid qui n'en a jamais eu), on
          // enchaîne sur la tâche suivante.
          const suite = enrollmentId ? rows.find((t) => t.enrollment_id === enrollmentId) : undefined;
          return suite?.id ?? suivante;
        });
      } catch {
        toast.error("Action impossible.");
      } finally {
        setBusy(false);
      }
    },
    [task, shown, loadQueue],
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
   * l'étape suivante. On atterrit dessus — c'est tout l'intérêt d'avoir déclaré
   * la réponse, et cette étape-là est justement celle qu'il faut faire dans la
   * foulée (typiquement : envoyer le site démo).
   */
  const onReplied = useCallback(() => {
    const enrollmentId = task?.enrollment_id ?? null;
    const courant = task?.id ?? null;
    setHistoryKey((k) => k + 1);
    void loadQueue((rows) => {
      const suite = enrollmentId
        ? rows.find((t) => t.enrollment_id === enrollmentId && t.id !== courant)
        : undefined;
      return suite?.id ?? null;
    });
  }, [task, loadQueue]);

  const companyName = enTete?.entreprise.name ?? "";

  return (
    <div className="dm-skin" style={{ flex: 1, minHeight: 0 }}>
      <div className="dm">
        <DemRail
          onglet={onglet}
          setOnglet={setOnglet}
          premiers={premiers}
          jours={jours}
          day={day}
          setDay={setDay}
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
          {horsFile != null ? (
            ficheHorsFile && (
              <>
                <DemHorsFile company={ficheHorsFile} onRetour={() => setHorsFile(null)} />
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
