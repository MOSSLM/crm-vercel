"use client";
// Compléter en masse ce qui manque aux fiches, sans ouvrir soixante modales.
//
// Le bloc « À compléter » de la fiche a réglé le dossier OUVERT : les champs
// requis vides remontent en tête au lieu d'être dispersés dans quatre sections.
// Reste qu'on n'en traite qu'un à la fois — et sur le board, ce sont une
// soixantaine de lignes qui attendent, pour trois champs chacune en moyenne
// (trente-six pour le seul logo).
//
// Cette grille les met côte à côte : une ligne par fiche, une colonne par champ
// réellement manquant, et un seul enregistrement pour tout le lot.
//
// Ce qu'elle ne fait PAS : redéfinir « ce qui manque ». Les colonnes, le rouge
// et le vert sortent de `SITE_REQUIRED_WITH_PROJECT`, la saisie de
// `requiredFieldControl` — les mêmes que la fiche. Une troisième définition
// aurait divergé de la deuxième au premier correctif.

import React from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requiredFieldControl } from "./RequiredFieldControl";
import { changedFields, payloadFor } from "./complete-data-payload";
import {
  EMPTY_REQUIRED_VALUES,
  SITE_REQUIRED_WITH_PROJECT,
  ruleApplies,
  type RequiredField,
  type RequiredValues,
} from "./required-fields";
import type { BoardItem } from "./types";

/**
 * Plafond par lot, aligné sur `marketingMissingDataSchema` côté API. Au-delà, on
 * prend les premières et on le DIT : une troncature muette laisserait croire que
 * tout a été traité.
 */
const MAX_ROWS = 200;

/** Largeur de colonne par champ — le logo et les tags ne tiennent pas en 140 px. */
const COLUMN_WIDTH: Partial<Record<RequiredField, number>> = {
  lm_logo_url: 210,
  service_tags: 250,
};

interface ApiRow {
  opportunite_id: string;
  entreprise_id: number;
  project_id: string | null;
  company_name: string | null;
  values: RequiredValues;
}

interface Row extends ApiRow {
  /** Valeurs enregistrées, pour ne renvoyer que ce qui a bougé. */
  initial: RequiredValues;
  error: string | null;
  justSaved: boolean;
}

export const CompleteDataDialog: React.FC<{
  /** Lignes à compléter. `null` = fermé. */
  items: BoardItem[] | null;
  onClose: () => void;
  /** Rafraîchit le board après un enregistrement réussi. */
  onSaved: () => void;
  /** Ouvre la fiche complète — pour tout ce que la grille ne couvre pas. */
  onOpenDetails: (item: BoardItem) => void;
}> = ({ items, onClose, onSaved, onOpenDetails }) => {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [columns, setColumns] = React.useState<RequiredField[]>([]);
  const [tagCatalog, setTagCatalog] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const open = items !== null;
  const kept = React.useMemo(() => (items ?? []).slice(0, MAX_ROWS), [items]);
  const dropped = (items?.length ?? 0) - kept.length;
  const itemById = React.useMemo(() => new Map(kept.map((it) => [it.id, it])), [kept]);
  const ids = React.useMemo(() => kept.map((it) => it.id).join(","), [kept]);

  // Catalogue des tags autorisés, comme la fiche : la saisie libre créerait des
  // tags jumeaux qu'aucune page ni image ne reconnaît.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    authedFetch("/api/site-builder/service-tags")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tags?: string[] } | null) => {
        if (!cancelled && Array.isArray(data?.tags)) setTagCatalog(data.tags);
      })
      .catch(() => {
        /* catalogue indisponible : la saisie libre reste possible */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || ids === "") return;
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setColumns([]);
    (async () => {
      try {
        const res = await authedFetch(`/api/marketing-pipeline/missing-data?ids=${encodeURIComponent(ids)}`);
        const data = (await res.json().catch(() => ({}))) as { rows?: ApiRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          toast.error(data.error || "Lecture des fiches impossible.");
          setLoading(false);
          return;
        }
        const loaded: Row[] = (data.rows ?? []).map((r) => ({
          ...r,
          values: { ...EMPTY_REQUIRED_VALUES, ...r.values },
          initial: { ...EMPTY_REQUIRED_VALUES, ...r.values },
          error: null,
          justSaved: false,
        }));

        // Les colonnes sont figées à l'OUVERTURE, comme le bloc « À compléter »
        // de la fiche : recalculées à chaque frappe, une colonne disparaîtrait
        // dès la première lettre saisie et décalerait toutes les cellules sous
        // le curseur. C'est la mise en page qui doit être stable ; le repère,
        // lui, reste vivant — le rouge et le vert suivent la saisie.
        //
        // Le dossier lead magnet étant créé à l'enregistrement quand il manque,
        // on évalue toujours la liste complète (même raison que la fiche).
        const needed = SITE_REQUIRED_WITH_PROJECT.filter(
          (rule) =>
            loaded.some((row) => !rule.ok(row.initial)) &&
            // Une règle sans contrôle ouvrirait une colonne vide sous un en-tête
            // qui la réclame. Elle reste signalée, mais dans la fiche.
            requiredFieldControl({
              field: rule.field,
              values: EMPTY_REQUIRED_VALUES,
              onChange: () => {},
              tagCatalog: [],
            }) !== null,
        ).map((rule) => rule.field);

        setRows(loaded);
        setColumns(needed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ids]);

  const patch = (oppId: string, values: Partial<RequiredValues>) =>
    setRows((rs) =>
      rs.map((r) =>
        r.opportunite_id === oppId
          ? { ...r, values: { ...r.values, ...values }, error: null, justSaved: false }
          : r,
      ),
    );

  const dirty = rows.filter((r) => changedFields(r).length > 0);

  const save = async () => {
    const payload = dirty.flatMap((r) => {
      const p = payloadFor(r);
      return p
        ? [{ opportunite_id: r.opportunite_id, entreprise_id: r.entreprise_id, project_id: r.project_id, ...p }]
        : [];
    });
    if (payload.length === 0) return;

    setSaving(true);
    try {
      const res = await authedFetch("/api/marketing-pipeline/missing-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        results?: Array<{ opportunite_id: string; ok: boolean; error?: string }>;
        saved?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error || "Enregistrement impossible.");
        return;
      }

      const byOpp = new Map((data.results ?? []).map((r) => [r.opportunite_id, r]));
      setRows((rs) =>
        rs.map((r) => {
          const result = byOpp.get(r.opportunite_id);
          if (!result) return r;
          // Seule une ligne réellement enregistrée voit ses valeurs devenir la
          // nouvelle référence : sinon un second essai ne renverrait plus rien.
          return result.ok
            ? { ...r, initial: { ...r.values }, error: null, justSaved: true }
            : { ...r, error: result.error ?? "échec", justSaved: false };
        }),
      );

      const failed = data.failed ?? 0;
      if (failed > 0) toast.error(`${failed} ligne${failed > 1 ? "s" : ""} en échec — voir le détail.`);
      else toast.success(`${data.saved ?? payload.length} fiche(s) enregistrée(s).`);
      onSaved();
    } catch {
      toast.error("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      {/* Une grille a besoin de la largeur de l'écran, pas de celle d'une
          modale de formulaire (`max-w-lg` par défaut). */}
      <DialogContent className="max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Compléter les données manquantes</DialogTitle>
        </DialogHeader>

        {/* Le dialogue sort du board par portail : sans ce `mp-scope`, les
            classes de la peau (`btn`, `pill`, tokens de couleur) ne
            s'appliqueraient pas. `mp-embed` neutralise le layout plein écran du
            scope — même montage que `NotesDialog`. */}
        <div className="mp-scope mp-embed space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Rien à compléter sur les lignes choisies.
          </p>
        ) : (
          <>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Une colonne par champ manquant sur au moins une ligne, figée à l&apos;ouverture pour que
              rien ne bouge sous le curseur. Le rouge suit la saisie ; une ligne passe au vert dès
              qu&apos;elle n&apos;a plus rien à réclamer. Ce que la grille ne couvre pas — avis,
              horaires, zones — reste dans la fiche.
              {dropped > 0 && (
                <>
                  {" "}
                  <strong>
                    {kept.length} lignes sur {kept.length + dropped} : enregistre, puis rouvre pour la
                    suite.
                  </strong>
                </>
              )}
            </p>

            <div className="max-h-[65vh] overflow-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-background">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[190px] border-b border-r bg-background p-2 text-left font-medium">
                      Entreprise
                    </th>
                    {columns.map((field) => {
                      const rule = SITE_REQUIRED_WITH_PROJECT.find((r) => r.field === field);
                      return (
                        <th
                          key={field}
                          title={rule?.hint}
                          className="border-b border-r p-2 text-left font-medium"
                          style={{ minWidth: COLUMN_WIDTH[field] ?? 140 }}
                        >
                          {rule?.label ?? field}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const stillMissing = SITE_REQUIRED_WITH_PROJECT.filter((r) => !r.ok(row.values));
                    const complete = stillMissing.length === 0;
                    const item = itemById.get(row.opportunite_id);
                    return (
                      <tr key={row.opportunite_id} className="align-top">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-b border-r bg-background p-2 text-left font-normal"
                          style={{
                            boxShadow: `inset 3px 0 0 var(${complete ? "--ok" : "--danger"})`,
                          }}
                        >
                          <span className="block truncate font-medium" title={row.company_name ?? ""}>
                            {row.company_name ?? "Entreprise"}
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            {complete ? (
                              <span className="inline-flex items-center gap-1" style={{ color: "var(--ok)" }}>
                                <Check className="h-3 w-3" />
                                {row.justSaved ? "Enregistrée" : "Complète"}
                              </span>
                            ) : (
                              <span style={{ color: "var(--danger)" }}>
                                {stillMissing.length} à remplir
                              </span>
                            )}
                            {item && (
                              <button
                                type="button"
                                className="text-muted-foreground underline hover:text-foreground"
                                onClick={() => onOpenDetails(item)}
                              >
                                Fiche
                              </button>
                            )}
                          </span>
                          {row.error && (
                            <span
                              className="mt-1 flex items-start gap-1"
                              style={{ color: "var(--danger)" }}
                            >
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {row.error}
                            </span>
                          )}
                        </th>

                        {columns.map((field) => {
                          const rule = SITE_REQUIRED_WITH_PROJECT.find((r) => r.field === field);
                          // Un champ que la règle ne réclame pas sur CETTE ligne
                          // (la note sans avis) reste saisissable, mais sans rouge.
                          const invalid = !!rule && !rule.ok(row.values) && ruleApplies(rule, row.values);
                          return (
                            <td
                              key={field}
                              className="border-b border-r p-2"
                              style={
                                invalid
                                  ? { background: "var(--danger-tint)" }
                                  : undefined
                              }
                            >
                              {requiredFieldControl({
                                field,
                                values: row.values,
                                onChange: (p) => patch(row.opportunite_id, p),
                                entrepriseId: row.entreprise_id,
                                tagCatalog,
                                compact: true,
                                invalid,
                                required: !!rule && ruleApplies(rule, row.values),
                              })}
                              {/* La ville SEO est « la grande ville la plus proche » :
                                  souvent celle de l'entreprise, pas toujours. Le
                                  raccourci est donc par cellule — remplir la colonne
                                  entière affirmerait quelque chose que personne n'a
                                  décidé. */}
                              {field === "lm_override_city" && row.values.ville && (
                                <button
                                  type="button"
                                  className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                                  onClick={() =>
                                    patch(row.opportunite_id, { lm_override_city: row.values.ville })
                                  }
                                >
                                  = {row.values.ville}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>

        <DialogFooter>
          {/* `mp-embed` repasse le scope en `display:block` : la rangée de
              boutons a donc son propre conteneur flex à l'intérieur. */}
          <div className="mp-scope mp-embed w-full">
            <div className="flex justify-end gap-2">
              <button type="button" className="btn ghost sm" onClick={close} disabled={saving}>
                Fermer
              </button>
              <button
                type="button"
                className="btn accent sm"
                onClick={save}
                disabled={saving || dirty.length === 0}
              >
                {saving ? <Loader2 className="ico-sm animate-spin" /> : <Check className="ico-sm" />}
                Enregistrer
                {dirty.length > 0 && ` (${dirty.length} ligne${dirty.length > 1 ? "s" : ""})`}
              </button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
