"use client";

import React, { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { journalApi } from "../utils/journalApi";
import { sendPaymentReceiptEmail } from "../utils/paymentEmailClient";
import {
  Phone,
  RotateCcw,
  Calendar,
  FileText,
  PenTool,
  DollarSign,
  Magnet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { ContactChannel } from "../types";

import logger from "../utils/logger";
interface JournalActionButtonsProps {
  opportunite_id?: string;
  entreprise_id?: number;
  companyName?: string;
  recipientEmail?: string;
  onActionCompleted?: () => void;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost";
  showLabels?: boolean;
}

type ActionConfig = {
  type: string;
  label: string;
  icon: LucideIcon;
  color: string;
  action: (params: { description?: string; channel: ContactChannel }) => Promise<void>;
};

const contactChannelOptions: { value: ContactChannel; label: string }[] = [
  { value: ContactChannel.PasDefini, label: "Pas défini" },
  { value: ContactChannel.Telephone, label: "Téléphone" },
  { value: ContactChannel.Email, label: "Email" },
  { value: ContactChannel.Linkedin, label: "LinkedIn" },
  { value: ContactChannel.Whatsapp, label: "WhatsApp" },
  { value: ContactChannel.Sms, label: "SMS" },
  { value: ContactChannel.Autre, label: "Autre" },
];

export const JournalActionButtons: React.FC<JournalActionButtonsProps> = ({
  opportunite_id,
  entreprise_id,
  companyName,
  recipientEmail,
  onActionCompleted,
  size = "sm",
  variant = "outline",
  showLabels = true,
}) => {
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(
    null
  );
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactChannel, setContactChannel] = useState<ContactChannel>(
    ContactChannel.PasDefini
  );

  const actions: ActionConfig[] = [
    {
      type: "call",
      label: "Appel",
      icon: Phone,
      color: "text-blue-600",
      action: async ({ description: desc, channel }) => {
        await journalApi.logCall(opportunite_id, entreprise_id, desc, channel);
        toast.success(
          `Appel enregistré ${companyName ? `pour ${companyName}` : ""}`
        );
      },
    },
    {
      type: "relance",
      label: "Relance",
      icon: RotateCcw,
      color: "text-orange-600",
      action: async ({ description: desc, channel }) => {
        const nextNumber = await journalApi.getNextSequenceNumber(
          "relance",
          opportunite_id,
          entreprise_id
        );
        await journalApi.logRelance(opportunite_id, entreprise_id, desc, channel);
        toast.success(
          `Relance ${nextNumber} enregistrée ${
            companyName ? `pour ${companyName}` : ""
          }`
        );
      },
    },
    {
      type: "rdv",
      label: "RDV",
      icon: Calendar,
      color: "text-purple-600",
      action: async ({ description: desc, channel }) => {
        const nextNumber = await journalApi.getNextSequenceNumber(
          "rdv",
          opportunite_id,
          entreprise_id
        );
        await journalApi.logRdv(opportunite_id, entreprise_id, desc, channel);
        toast.success(
          `RDV ${nextNumber} enregistré ${
            companyName ? `pour ${companyName}` : ""
          }`
        );
      },
    },
    {
      type: "devis",
      label: "Devis",
      icon: FileText,
      color: "text-yellow-600",
      action: async ({ description: desc, channel }) => {
        await journalApi.logDevis(opportunite_id, entreprise_id, desc, channel);
        toast.success(
          `Devis enregistré ${companyName ? `pour ${companyName}` : ""}`
        );
      },
    },
    {
      type: "signature",
      label: "Signature",
      icon: PenTool,
      color: "text-green-600",
      action: async ({ description: desc, channel }) => {
        await journalApi.logSignature(opportunite_id, entreprise_id, desc, channel);
        toast.success(
          `Signature enregistrée ${companyName ? `pour ${companyName}` : ""}`
        );
      },
    },
    {
      type: "acompte",
      label: "Acompte",
      icon: DollarSign,
      color: "text-emerald-600",
      action: async ({ description: desc, channel }) => {
        await journalApi.logAcompte(opportunite_id, entreprise_id, desc, channel);
        await sendPaymentReceiptEmail({
          to: recipientEmail,
          companyName,
          description: desc,
          amount: 0,
          paymentDate: new Date().toISOString(),
          qrPayload: `Paiement validé|${companyName ?? 'Entreprise'}|${new Date().toISOString()}`
        });
        toast.success(
          `Acompte enregistré et email envoyé ${companyName ? `pour ${companyName}` : ""}`
        );
      },
    },
    {
      type: "lead_magnet",
      label: "Lead Magnet",
      icon: Magnet,
      color: "text-pink-600",
      action: async ({ description: desc, channel }) => {
        await journalApi.logLeadMagnet(opportunite_id, entreprise_id, desc, channel);
        toast.success(
          `Lead Magnet enregistré ${companyName ? `pour ${companyName}` : ""}`
        );
      },
    },
  ];

  const handleQuickAction = async (actionConfig: ActionConfig) => {
    try {
      setIsSubmitting(true);
      await actionConfig.action({ channel: contactChannel });
      onActionCompleted?.();
    } catch (error) {
      logger.error("Error executing quick action:", error);
      toast.error("Erreur lors de l'enregistrement de l'action");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActionWithDescription = (actionConfig: ActionConfig) => {
    setSelectedAction(actionConfig);
    setDescription("");
    setShowDescriptionDialog(true);
  };

  const submitActionWithDescription = async () => {
    if (!selectedAction) return;

    try {
      setIsSubmitting(true);
      await selectedAction.action({
        description: description || undefined,
        channel: contactChannel,
      });
      setShowDescriptionDialog(false);
      setSelectedAction(null);
      setDescription("");
      onActionCompleted?.();
    } catch (error) {
      logger.error("Error executing action with description:", error);
      toast.error("Erreur lors de l'enregistrement de l'action");
    } finally {
      setIsSubmitting(false);
    }
  };

  const SelectedIcon = selectedAction?.icon;

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Canal de contact
          </span>
          <Select
            value={contactChannel}
            onValueChange={(value) =>
              setContactChannel(value as ContactChannel)
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Pas défini" />
            </SelectTrigger>
            <SelectContent>
              {contactChannelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          {actions.map((actionConfig) => {
            const Icon = actionConfig.icon;
            return (
              <div key={actionConfig.type} className="flex">
                {/* Bouton action rapide */}
                <Button
                  size={size}
                  variant={variant}
                  className={`${showLabels ? "rounded-r-none" : ""} ${
                    actionConfig.color
                  }`}
                  onClick={() => handleQuickAction(actionConfig)}
                  disabled={isSubmitting}
                  title={`${actionConfig.label} rapide`}
                >
                  <Icon className="h-4 w-4" />
                  {showLabels && (
                    <span className="ml-1">{actionConfig.label}</span>
                  )}
                </Button>

              {/* Bouton pour ajouter une description */}
              {showLabels && (
                <Button
                  size={size}
                  variant={variant}
                  className="rounded-l-none border-l-0 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => handleActionWithDescription(actionConfig)}
                  disabled={isSubmitting}
                  title={`${actionConfig.label} avec description`}
                >
                  +
                </Button>
              )}
            </div>
          );
        })}
      </div>

      </div>

      {/* Dialog pour ajouter une description */}
      <Dialog open={showDescriptionDialog} onOpenChange={setShowDescriptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAction && SelectedIcon && (
                <div className="flex items-center gap-2">
                  <SelectedIcon
                    className={`h-5 w-5 ${selectedAction.color}`}
                  />
                  Enregistrer {selectedAction.label.toLowerCase()}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {companyName && (
              <div className="text-sm text-muted-foreground">
                Pour: <span className="font-medium">{companyName}</span>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Canal de contact</label>
              <Select
                value={contactChannel}
                onValueChange={(value) =>
                  setContactChannel(value as ContactChannel)
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pas défini" />
                </SelectTrigger>
                <SelectContent>
                  {contactChannelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description (optionnel)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Détails de l'action..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDescriptionDialog(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button onClick={submitActionWithDescription} disabled={isSubmitting}>
                {isSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
