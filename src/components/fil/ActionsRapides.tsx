"use client";

/**
 * Appeler, écrire, y aller — en un tap, et sans avoir à penser à le noter.
 *
 * ── LE DÉFAUT QU'ELLES CORRIGENT ─────────────────────────────────────────
 * Deux écrans du CRM seulement portaient un lien `tel:` (`ContactDetailPage` et
 * `EmployeesList`). Partout ailleurs, appeler depuis un téléphone voulait dire
 * sélectionner le numéro, le copier, ouvrir le clavier, coller. Et journaliser
 * le geste demandait ensuite d'ouvrir un dialogue et de remplir un menu
 * déroulant — donc, en pratique, de ne pas le faire.
 *
 * ── LA JOURNALISATION EST OPTIMISTE, ET C'EST DÉLIBÉRÉ ───────────────────
 * On enregistre le geste au moment du tap, sans attendre de savoir si l'appel a
 * abouti. Le web ne PEUT pas le savoir : `tel:` passe la main au système et ne
 * rend jamais rien. Le choix est donc entre « on note qu'on a composé » et « on
 * ne note rien ». Le premier surestime légèrement l'activité ; le second efface
 * l'essentiel du démarchage, qui se fait précisément depuis un téléphone.
 *
 * Ce que ça enregistre est donc bien « numéro composé », et les libellés le
 * disent — pas « appel abouti ». L'issue d'un appel se saisit ailleurs, dans le
 * compte-rendu.
 *
 * ── ON N'AJOUTE PAS UN QUATRIÈME ÉCRIVAIN ────────────────────────────────
 * Tout passe par `journalApi`, qui écrit déjà dans `activity_log` avec
 * `metadata.channel`. Écrire directement d'ici aurait fabriqué une quatrième
 * plume sur la même table, avec sa propre idée du vocabulaire — exactement ce
 * que le fil d'activité vient de rendre visible.
 *
 * ── CE QUI N'EST PAS RENDU N'EST PAS GRISÉ ───────────────────────────────
 * Un bouton « Appeler » sans numéro est une promesse non tenue. Une action sans
 * sa donnée n'est simplement pas affichée : la carte rétrécit, elle ne se troue
 * pas. C'est la règle d'affichage déjà tenue par `DossierEntreprise`.
 */

import { useCallback, useState } from "react";
import { MapPin, Mail, MessageCircle, MessageSquare, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ContactChannel } from "@/types";
import { journalApi } from "@/utils/journalApi";
import { lienWhatsApp, versFormatInternational } from "@/lib/telephone";
import logger from "@/utils/logger";

type Props = {
  entrepriseId: number;
  opportuniteId?: string;
  nom?: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  /** Rappelé après une journalisation réussie, pour rafraîchir le fil. */
  onGesteEnregistre?: () => void;
};

type Action = {
  cle: string;
  libelle: string;
  icone: LucideIcon;
  href: string;
  /** Nul = on ouvre sans rien journaliser (l'itinéraire n'est pas un contact). */
  canal: ContactChannel | null;
  /** Ce qui sera écrit dans le fil. */
  trace?: string;
  /** Un appel est un geste d'approche ; le reste est une relance. */
  genre?: "appel" | "relance";
};

export function ActionsRapides({
  entrepriseId,
  opportuniteId,
  nom,
  telephone,
  email,
  adresse,
  onGesteEnregistre,
}: Props) {
  const [enCours, setEnCours] = useState<string | null>(null);

  const actions: Action[] = [];

  const numero = versFormatInternational(telephone);
  if (numero) {
    actions.push({
      cle: "appeler",
      libelle: "Appeler",
      icone: Phone,
      href: `tel:+${numero}`,
      canal: ContactChannel.Telephone,
      trace: "Numéro composé depuis la fiche",
      genre: "appel",
    });

    const wa = lienWhatsApp(telephone, `Bonjour${nom ? ` ${nom}` : ""},`);
    if (wa) {
      actions.push({
        cle: "whatsapp",
        libelle: "WhatsApp",
        icone: MessageCircle,
        href: wa,
        canal: ContactChannel.Whatsapp,
        trace: "WhatsApp ouvert depuis la fiche",
        genre: "relance",
      });
    }

    actions.push({
      cle: "sms",
      libelle: "SMS",
      icone: MessageSquare,
      href: `sms:+${numero}`,
      canal: ContactChannel.Sms,
      trace: "SMS ouvert depuis la fiche",
      genre: "relance",
    });
  }

  if (email) {
    actions.push({
      cle: "email",
      libelle: "E-mail",
      icone: Mail,
      href: `mailto:${email}`,
      canal: ContactChannel.Email,
      trace: "E-mail ouvert depuis la fiche",
      genre: "relance",
    });
  }

  if (adresse) {
    // `geo:` serait plus juste sur Android mais ne mène nulle part sur iOS ni
    // sur un bureau. L'URL Google Maps marche partout et laisse le système
    // ouvrir l'application native quand elle est installée.
    actions.push({
      cle: "itineraire",
      libelle: "Itinéraire",
      icone: MapPin,
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`,
      canal: null,
    });
  }

  const declencher = useCallback(
    async (action: Action) => {
      if (!action.canal) return; // Itinéraire : rien à journaliser.
      setEnCours(action.cle);
      try {
        const enregistrer = action.genre === "appel" ? journalApi.logCall : journalApi.logRelance;
        await enregistrer(opportuniteId, entrepriseId, action.trace, action.canal);
        onGesteEnregistre?.();
      } catch (e) {
        // Le geste a eu lieu — le système a déjà ouvert le clavier ou WhatsApp.
        // On le dit sans le défaire : l'utilisateur doit savoir que le fil ne
        // portera pas cette ligne, pour pouvoir la ressaisir s'il y tient.
        logger.error("Journalisation du geste impossible", e);
        toast.error("Geste non enregistré dans le fil", {
          description: "L'action a bien été lancée, mais la trace n'a pas pu être écrite.",
        });
      } finally {
        setEnCours(null);
      }
    },
    [entrepriseId, opportuniteId, onGesteEnregistre],
  );

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.cle}
          asChild
          variant="outline"
          size="sm"
          // `min-h-11` : le seuil de confort tactile. Les boutons `sm` du
          // design system font 32 px, ce qui se rate au pouce en marchant.
          className="min-h-11 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto"
          disabled={enCours === action.cle}
        >
          <a
            href={action.href}
            // `tel:`, `sms:` et `mailto:` passent la main au système : les
            // ouvrir dans un onglet laisserait une page blanche derrière soi.
            // Seuls WhatsApp et l'itinéraire sont de vraies pages web.
            target={action.cle === "whatsapp" || action.cle === "itineraire" ? "_blank" : undefined}
            rel={
              action.cle === "whatsapp" || action.cle === "itineraire"
                ? "noopener noreferrer"
                : undefined
            }
            onClick={() => void declencher(action)}
          >
            <action.icone className="mr-2 h-4 w-4" />
            {action.libelle}
          </a>
        </Button>
      ))}
    </div>
  );
}

export default ActionsRapides;
