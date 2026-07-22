"use client";

import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bookAppointment } from "@/lib/telephony/client";

/**
 * Book an appointment from a record. It can be kept for the booking agent or
 * escalated to the admin/superior ("Assigner au supérieur").
 */
export function AppointmentDialog({
  contactId,
  entrepriseId,
  opportuniteId,
  callId,
  defaultTitle,
  onBooked,
}: {
  contactId?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
  callId?: string | null;
  defaultTitle?: string;
  onBooked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [startAt, setStartAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [forAdmin, setForAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !startAt) {
      toast.error("Titre et date requis.");
      return;
    }
    setSaving(true);
    const res = await bookAppointment({
      title: title.trim(),
      start_at: startAt,
      duration_min: duration,
      for_admin: forAdmin,
      contact_id: contactId ?? null,
      entreprise_id: entrepriseId ?? null,
      opportunite_id: opportuniteId ?? null,
      call_id: callId ?? null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success(forAdmin ? "RDV créé pour le supérieur." : "RDV créé.");
      setOpen(false);
      setStartAt("");
      onBooked?.();
    } else {
      toast.error("RDV non créé", { description: res.error });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarPlus className="mr-1 h-4 w-4" /> Prendre RDV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau rendez-vous</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Objet</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Rappel / démo produit"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date &amp; heure</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Durée</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {[15, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forAdmin}
              onChange={(e) => setForAdmin(e.target.checked)}
            />
            Assigner au supérieur (admin) plutôt qu’à moi
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
