"use client";

import React from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ARCHIVE_REASONS_CHOISISSABLES,
  archiveReasonLabel,
  isPlausibleDomain,
  reasonNeedsConcurrent,
  type ArchiveReason,
} from "@/lib/archive/reasons";
import { canonicalizeDomain } from "@/lib/url-canonical";
import { authedFetch } from "@/utils/authedFetch";

/**
 * Le dialogue d'archivage, monté par les quatre surfaces qui portent le menu ⋮.
 *
 * Écrit avec les seules primitives shadcn — aucune classe `.mp-scope` — pour
 * qu'il tienne aussi bien dans les deux boards à peau CSS (marketing, pipeline
 * commercial) que dans les pages Tailwind, sans le wrapper `mp-scope mp-embed`
 * qu'impose `NotesDialog`.
 *
 * Les deux modes (archiver / désarchiver) sont dans le même composant parce que
 * l'appelant les ouvre depuis la même entrée de menu selon l'état de la ligne :
 * `target.currentReason` non nul ⇒ la fiche est archivée, on propose l'inverse.
 */

export interface ArchiveTarget {
  /** Ce qu'on archive : la fiche entreprise (avec ses opportunités) ou une opportunité seule. */
  kind: "opportunite" | "entreprise";
  opportunityIds: string[];
  entrepriseIds: number[];
  /** « Menuiserie Durand » — affiché dans l'en-tête. */
  label: string;
  /** Non nul ⇒ la fiche est déjà archivée : le dialogue passe en désarchivage. */
  currentReason?: string | null;
  /** Note d'archivage existante, rappelée en mode désarchivage. */
  currentNote?: string | null;
}

export interface ArchiveDialogProps {
  /** `null` = fermé (même convention que `NotesDialog`). */
  target: ArchiveTarget | null;
  /** `/api/archive` (admin) ou `/api/agent/archive` (freelance). */
  apiBase: string;
  onClose: () => void;
  /** Appelé après une écriture réussie : le parent recharge sa vue. */
  onDone: () => void;
}

export const ArchiveDialog: React.FC<ArchiveDialogProps> = ({
  target,
  apiBase,
  onClose,
  onDone,
}) => {
  const [reason, setReason] = React.useState<ArchiveReason | "">("");
  const [concurrentUrl, setConcurrentUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const isUnarchive = !!target?.currentReason;

  // Repartir d'un formulaire vierge à chaque ouverture : sans ça le motif de la
  // fiche précédente reste sélectionné, et on archive la suivante avec.
  React.useEffect(() => {
    if (target) {
      setReason("");
      setConcurrentUrl("");
      setNote("");
      setBusy(false);
    }
  }, [target]);

  if (!target) return null;

  const needsConcurrent = reasonNeedsConcurrent(reason);

  const submit = async () => {
    if (!isUnarchive) {
      if (!reason) {
        toast.error("Choisissez un motif.");
        return;
      }
      if (needsConcurrent && !isPlausibleDomain(canonicalizeDomain(concurrentUrl.trim()))) {
        toast.error("Indiquez l’adresse du site du concurrent (ex. agence-web.fr).");
        return;
      }
    }

    setBusy(true);
    try {
      const res = await authedFetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isUnarchive
            ? {
                action: "unarchive",
                opportunity_ids: target.opportunityIds,
                entreprise_ids: target.entrepriseIds,
              }
            : {
                action: "archive",
                opportunity_ids: target.opportunityIds,
                entreprise_ids: target.entrepriseIds,
                reason,
                note: note.trim() || undefined,
                concurrent_url: needsConcurrent ? concurrentUrl.trim() : undefined,
              },
        ),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        concurrent?: { domaine: string } | null;
      };
      if (!res.ok) {
        toast.error(payload.error || "L’archivage a échoué.");
        return;
      }

      toast.success(
        isUnarchive
          ? `${target.label} est de retour dans les listes.`
          : payload.concurrent
            ? `${target.label} archivée — ${payload.concurrent.domaine} ajouté aux concurrents.`
            : `${target.label} archivée.`,
      );
      onDone();
      onClose();
    } catch {
      toast.error("Réseau indisponible — réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUnarchive ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {isUnarchive ? "Désarchiver" : "Archiver"} {target.label}
          </DialogTitle>
        </DialogHeader>

        {isUnarchive ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Archivée pour&nbsp;: <strong>{archiveReasonLabel(target.currentReason)}</strong>
              {target.currentNote ? <> — « {target.currentNote} »</> : null}
            </p>
            <p className="text-muted-foreground">
              La fiche revient dans les listes. Les séquences d’emails, elles, ne repartent pas
              toutes seules.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="archive-reason">Motif</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ArchiveReason)}>
                <SelectTrigger id="archive-reason">
                  <SelectValue placeholder="Pourquoi cette piste s’arrête" />
                </SelectTrigger>
                <SelectContent>
                  {ARCHIVE_REASONS_CHOISISSABLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Le seul motif qui alimente le registre des concurrents. */}
            {needsConcurrent && (
              <div className="space-y-2">
                <Label htmlFor="archive-concurrent">Site du concurrent</Label>
                <Input
                  id="archive-concurrent"
                  value={concurrentUrl}
                  onChange={(e) => setConcurrentUrl(e.target.value)}
                  placeholder="agence-web.fr"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Il rejoint la page Concurrents, avec le nombre de prospects qu’il nous a pris.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="archive-note">Note (facultatif)</Label>
              <Textarea
                id="archive-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Ce qu’il faudrait savoir si on la ressort dans six mois."
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {target.kind === "entreprise"
                ? "Son opportunité sera archivée avec elle. "
                : ""}
              Les emails encore planifiés seront annulés et les tâches en attente clôturées.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant={isUnarchive ? "default" : "destructive"}
            onClick={submit}
            disabled={busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isUnarchive ? "Désarchiver" : "Archiver"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveDialog;
