"use client";

import React from "react";
import { EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { chaineCookie, decisionDuCookie } from "@/lib/analytics/trafic-interne";

/**
 * « Ne pas compter mes visites » — l'interrupteur, poste par poste.
 *
 * Les liens « Ouvrir » du CRM marquent déjà le navigateur tout seuls (voir
 * `lienNonMesure`), donc ce panneau n'est PAS le chemin normal : c'est le
 * rattrapage et la preuve. Le rattrapage, pour le navigateur qui ouvre les
 * démos autrement — un favori, l'historique, un lien recollé dans le
 * téléphone. La preuve, parce que « est-ce que ça marche vraiment ? » est la
 * seule question qu'on se pose ensuite, et qu'il fallait un endroit qui y
 * réponde sans devoir aller lire GA4.
 *
 * Il lit et écrit exactement le cookie que lisent les sites démo : le CRM est
 * servi sous le même domaine racine, donc ce qui est décidé ici vaut pour tout
 * le parc. Sur un hôte étranger au domaine (un aperçu Vercel, par exemple), le
 * cookie reste local à cet hôte et ne peut rien pour les démos — d'où la
 * mention affichée plutôt qu'une case qui mentirait.
 */
export function ExclusionTraficPanel() {
  const [exclu, setExclu] = React.useState(false);
  const [portee, setPortee] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExclu(decisionDuCookie(document.cookie));
    // La portée réelle du cookie, telle que le navigateur va l'appliquer.
    const chaine = chaineCookie(true, window.location.hostname, {
      secure: window.location.protocol === "https:",
    });
    const domaine = /Domain=([^;]+)/.exec(chaine)?.[1] ?? null;
    setPortee(domaine);
  }, []);

  const basculer = (valeur: boolean) => {
    document.cookie = chaineCookie(valeur, window.location.hostname, {
      secure: window.location.protocol === "https:",
    });
    // On relit plutôt que de faire confiance : si le navigateur a refusé le
    // cookie, l'interrupteur doit revenir en arrière au lieu d'afficher un
    // état que les sites démo ne verront jamais.
    setExclu(decisionDuCookie(document.cookie));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <EyeOff className="h-4 w-4 text-muted-foreground" />
          Ne pas compter mes visites
        </CardTitle>
        <CardDescription>
          Quand tu ouvres la démo d&apos;un prospect pour la vérifier, la visite est enregistrée comme si
          le prospect l&apos;avait ouverte — et le radar la remonte en lead chaud. Activé, ce navigateur
          n&apos;envoie plus rien à Google Analytics ni à Clarity sur les sites démo et les rapports d&apos;audit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="exclusion-trafic" className="text-sm font-normal">
            {exclu ? "Ce navigateur n'est pas compté." : "Ce navigateur est compté comme un prospect."}
          </Label>
          <Switch id="exclusion-trafic" checked={exclu} onCheckedChange={basculer} />
        </div>
        <p className="text-xs text-muted-foreground">
          {portee
            ? `Vaut pour tous les sites en ${portee.replace(/^\./, "")}, sur ce navigateur, pendant deux ans. À refaire sur chaque appareil (ordinateur, téléphone) et après un nettoyage des cookies.`
            : "Cet hôte n'est pas rattaché au domaine des sites démo : le réglage n'y vaudra que pour lui-même. Ouvre les démos depuis les boutons du CRM, ils marquent le navigateur automatiquement."}
        </p>
      </CardContent>
    </Card>
  );
}
