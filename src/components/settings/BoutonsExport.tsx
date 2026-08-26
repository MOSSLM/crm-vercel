"use client";

/**
 * Les boutons d'export des Paramètres — enfin branchés.
 *
 * Ils existaient depuis le début, ils avaient l'air de fonctionner, et ils
 * n'avaient AUCUN `onClick`. Sur 60 726 entreprises, ne pas pouvoir sortir une
 * liste est un frein quotidien ; et des données qu'on ne peut pas exporter sont
 * des données qu'on ne possède plus tout à fait.
 *
 * ── POURQUOI PAS UN SIMPLE `<a href>` ────────────────────────────────────
 * La route exige un jeton (`withAuth`), et un `<a>` n'en porte pas : le
 * navigateur téléchargerait une page 401 nommée `entreprises.csv`. On passe
 * donc par `authedFetch` et on fabrique le fichier depuis le blob reçu.
 *
 * ── LE NOM DU FICHIER VIENT DU SERVEUR ───────────────────────────────────
 * `Content-Disposition` porte déjà un nom horodaté ; le relire ici évite que le
 * client et le serveur aient chacun leur convention et finissent par diverger.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";

type Jeu = { cle: string; libelle: string };

const JEUX: Jeu[] = [
  { cle: "entreprises", libelle: "Exporter les entreprises (CSV)" },
  { cle: "contacts", libelle: "Exporter les contacts (CSV)" },
  { cle: "pipeline", libelle: "Exporter le pipeline (JSON)" },
];

/** Lit le nom proposé par le serveur, avec repli si l'en-tête manque. */
function nomDepuisEntete(entete: string | null, repli: string): string {
  const m = entete?.match(/filename="?([^"]+)"?/i);
  return m?.[1] ?? repli;
}

export function BoutonsExport() {
  const [enCours, setEnCours] = useState<string | null>(null);

  const exporter = async (jeu: Jeu) => {
    setEnCours(jeu.cle);
    try {
      const r = await authedFetch(`/api/export?jeu=${jeu.cle}`);
      if (!r.ok) throw new Error(`Export refusé (${r.status})`);

      const blob = await r.blob();
      const nom = nomDepuisEntete(
        r.headers.get("Content-Disposition"),
        `${jeu.cle}.${jeu.cle === "pipeline" ? "json" : "csv"}`,
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`${nom} téléchargé`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {JEUX.map((jeu) => (
          <Button
            key={jeu.cle}
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => void exporter(jeu)}
            disabled={enCours !== null}
          >
            {enCours === jeu.cle ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {jeu.libelle}
          </Button>
        ))}
      </div>

      {/* Dit où est passé « Exporter les recherches » plutôt que de laisser
          croire à une disparition. Le bouton rallumait le scraper externe pour
          un fichier ; l'export par recherche existe là où il a du sens. */}
      <p className="text-xs text-muted-foreground">
        Les résultats d&apos;une recherche Google Maps s&apos;exportent depuis
        l&apos;écran de recherche lui-même, recherche par recherche — le scraper n&apos;est
        allumé qu&apos;à ce moment-là.
      </p>
    </div>
  );
}

export default BoutonsExport;
